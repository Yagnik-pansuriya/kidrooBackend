import Customer from "../models/customer";
import AppError from "../utils/appError";
import { sendOTPEmail } from "../utils/mailer";
import mongoose from "mongoose";

// ═══════════════════════════════════════════════════════════════
// TEMPORARY OTP STORE
// Holds signup data in memory until OTP is verified.
// After verification the customer is persisted to MongoDB.
// Entries auto-expire after 10 minutes.
// ═══════════════════════════════════════════════════════════════
interface PendingSignup {
  firstName: string;
  lastName: string;
  mobile: string;
  password: string;
  email?: string;
  alternatePhone?: string;
  otp: string;
  otpExpiry: Date;
  createdAt: Date;
}

const pendingSignups = new Map<string, PendingSignup>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, entry] of pendingSignups.entries()) {
    if (now > entry.otpExpiry) {
      pendingSignups.delete(key);
    }
  }
}, 5 * 60 * 1000);

class CustomerService {
  // ── OTP ───────────────────────────────────────────────────────
  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ═════════════════════ SIGNUP (no DB save) ═════════════════════

  /**
   * Step 1: Collect signup data, generate OTP, send via email.
   * Does NOT save customer to DB yet.
   */
  async signup(data: {
    firstName: string;
    lastName: string;
    mobile: string;
    password: string;
    email?: string;
    alternatePhone?: string;
  }) {
    // Validate mobile
    if (!/^[6-9]\d{9}$/.test(data.mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    // Email is required for OTP delivery
    if (!data.email) {
      throw new AppError("Email is required to receive the verification OTP", 400);
    }

    // Check if mobile already exists and is verified
    const existing = await Customer.findOne({ mobile: data.mobile });
    if (existing && existing.isVerified) {
      throw new AppError("An account with this mobile number already exists", 400);
    }

    // Check email uniqueness (only against verified accounts)
    const emailExists = await Customer.findOne({
      email: data.email.toLowerCase(),
      isVerified: true,
    });
    if (emailExists) {
      throw new AppError("An account with this email already exists", 400);
    }

    // If an unverified DB record exists, remove it (clean slate)
    if (existing && !existing.isVerified) {
      await Customer.deleteOne({ _id: existing._id });
    }

    // Generate OTP
    const otp = this.generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store in memory — NOT in database
    pendingSignups.set(data.mobile, {
      firstName: data.firstName,
      lastName: data.lastName,
      mobile: data.mobile,
      password: data.password,
      email: data.email.toLowerCase(),
      alternatePhone: data.alternatePhone,
      otp,
      otpExpiry,
      createdAt: new Date(),
    });

    // Send OTP via email
    try {
      await sendOTPEmail(data.email, otp, data.firstName);
    } catch (err: any) {
      pendingSignups.delete(data.mobile);
      throw new AppError(err.message || "Failed to send OTP email", 500);
    }

    console.log(`[OTP] Signup for ${data.mobile} → OTP sent to ${data.email}`);

    return {
      message: `OTP sent to ${data.email}`,
      mobile: data.mobile,
      email: data.email,
    };
  }

  // ═════════════════════ VERIFY OTP ═════════════════════════════

  /**
   * Step 2: Verify OTP.
   * If from signup (pending in memory) → create customer in DB.
   * If from resend-otp for existing customer → verify them.
   */
  async verifyOTP(mobile: string, otp: string) {
    // 1. Check pending signups (in-memory)
    const pending = pendingSignups.get(mobile);

    if (pending) {
      if (new Date() > pending.otpExpiry) {
        pendingSignups.delete(mobile);
        throw new AppError("OTP has expired. Please sign up again.", 400);
      }

      if (pending.otp !== otp) {
        throw new AppError("Invalid OTP", 400);
      }

      // OTP is correct — NOW save to database
      const customer = await Customer.create({
        firstName: pending.firstName,
        lastName: pending.lastName,
        mobile: pending.mobile,
        password: pending.password,
        email: pending.email,
        alternatePhone: pending.alternatePhone,
        isVerified: true,
      });

      // Clean up memory
      pendingSignups.delete(mobile);

      return customer;
    }

    // 2. Check existing customer in DB (for resend-otp flow)
    const customer = await Customer.findOne({ mobile }).select("+otp +otpExpiry");

    if (!customer) {
      throw new AppError("No account found with this mobile number. Please sign up.", 404);
    }

    if (!customer.otp || !customer.otpExpiry) {
      throw new AppError("No OTP was sent. Please request a new OTP.", 400);
    }

    if (new Date() > customer.otpExpiry) {
      throw new AppError("OTP has expired. Please request a new OTP.", 400);
    }

    if (customer.otp !== otp) {
      throw new AppError("Invalid OTP", 400);
    }

    // Mark as verified and clear OTP
    customer.isVerified = true;
    customer.otp = undefined;
    customer.otpExpiry = undefined;
    await customer.save({ validateModifiedOnly: true });

    return customer;
  }

  // ═════════════════════ SEND / RESEND OTP ═════════════════════

  /**
   * Resend OTP for pending signup or existing unverified customer.
   */
  async sendOTP(mobile: string, email?: string) {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    const otp = this.generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Check pending signups first
    const pending = pendingSignups.get(mobile);
    if (pending) {
      pending.otp = otp;
      pending.otpExpiry = otpExpiry;

      // Re-send email
      const targetEmail = pending.email || email;
      if (targetEmail) {
        await sendOTPEmail(targetEmail, otp, pending.firstName);
      }

      console.log(`[OTP] Resend for pending ${mobile} → ${targetEmail}`);
      return { message: `OTP resent to ${targetEmail}` };
    }

    // Check existing customer
    const customer = await Customer.findOne({ mobile }).select("+otp +otpExpiry");

    if (customer) {
      customer.otp = otp;
      customer.otpExpiry = otpExpiry;
      await customer.save({ validateModifiedOnly: true });

      // Send email
      const targetEmail = customer.email || email;
      if (targetEmail) {
        await sendOTPEmail(targetEmail, otp, customer.firstName);
      }

      console.log(`[OTP] Resend for existing ${mobile} → ${targetEmail}`);
      return {
        exists: true,
        isVerified: customer.isVerified,
        message: `OTP resent to ${targetEmail}`,
      };
    }

    throw new AppError("No account found. Please sign up first.", 404);
  }

  // ═════════════════════ LOGIN ═════════════════════════════════

  async login(mobile: string, password: string) {
    const customer = await Customer.findOne({ mobile }).select("+password");

    if (!customer) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    if (!customer.isVerified) {
      throw new AppError("Please verify your account first", 403);
    }

    if (!customer.isActive) {
      throw new AppError("Your account has been deactivated", 403);
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    // Update last login
    customer.lastLogin = new Date();
    await customer.save({ validateModifiedOnly: true });

    return customer;
  }

  // ═════════════════════ PROFILE MANAGEMENT ═════════════════════

  async getProfile(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate("wishlist", "productName images price originalPrice")
      .lean();

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    return customer;
  }

  async updateProfile(
    customerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      alternatePhone?: string;
      avatar?: string;
    }
  ) {
    // Check email uniqueness if being updated
    if (data.email) {
      const emailExists = await Customer.findOne({
        email: data.email.toLowerCase(),
        _id: { $ne: customerId },
      });
      if (emailExists) {
        throw new AppError("This email is already in use", 400);
      }
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    return customer;
  }

  async changePassword(
    customerId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const customer = await Customer.findById(customerId).select("+password");

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    const isMatch = await customer.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AppError("Current password is incorrect", 400);
    }

    customer.password = newPassword;
    await customer.save();

    return { message: "Password changed successfully" };
  }

  // ═════════════════════ ADDRESS MANAGEMENT ═════════════════════

  async addAddress(customerId: string, address: any) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    // Max 5 addresses
    if (customer.addresses.length >= 5) {
      throw new AppError("Maximum 5 addresses allowed. Please delete one first.", 400);
    }

    // If this is the first address or marked as default, set it as default
    if (customer.addresses.length === 0 || address.isDefault) {
      customer.addresses.forEach((addr: any) => (addr.isDefault = false));
      address.isDefault = true;
    }

    customer.addresses.push(address);
    await customer.save();

    return customer.addresses;
  }

  async updateAddress(customerId: string, addressId: string, data: any) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    const address = (customer.addresses as any).id(addressId);
    if (!address) throw new AppError("Address not found", 404);

    // If setting as default, unset others
    if (data.isDefault) {
      customer.addresses.forEach((addr: any) => (addr.isDefault = false));
    }

    Object.assign(address, data);
    await customer.save();

    return customer.addresses;
  }

  async deleteAddress(customerId: string, addressId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    const address = (customer.addresses as any).id(addressId);
    if (!address) throw new AppError("Address not found", 404);

    const wasDefault = address.isDefault;
    address.deleteOne();

    // If deleted address was default, set first remaining as default
    if (wasDefault && customer.addresses.length > 0) {
      customer.addresses[0].isDefault = true;
    }

    await customer.save();
    return customer.addresses;
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    const address = (customer.addresses as any).id(addressId);
    if (!address) throw new AppError("Address not found", 404);

    customer.addresses.forEach((addr: any) => (addr.isDefault = false));
    address.isDefault = true;
    await customer.save();

    return customer.addresses;
  }

  // ═════════════════════ WISHLIST MANAGEMENT ═════════════════════

  async toggleWishlist(customerId: string, productId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    const idx = customer.wishlist.findIndex(
      (id: any) => id.toString() === productId
    );

    let action: "added" | "removed";

    if (idx > -1) {
      customer.wishlist.splice(idx, 1);
      action = "removed";
    } else {
      customer.wishlist.push(new mongoose.Types.ObjectId(productId) as any);
      action = "added";
    }

    await customer.save();

    return {
      action,
      wishlist: customer.wishlist,
    };
  }

  async getWishlist(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate("wishlist", "productName images price originalPrice stock discountPercentage")
      .lean();

    if (!customer) throw new AppError("Customer not found", 404);

    return customer.wishlist;
  }

  async clearWishlist(customerId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    customer.wishlist = [];
    await customer.save();

    return { message: "Wishlist cleared" };
  }
}

export const customerService = new CustomerService();