import Customer from "../models/customer";
import AppError from "../utils/appError";
import mongoose from "mongoose";

class CustomerService {
  // ── OTP ───────────────────────────────────────────────────────
  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Send OTP (step 1 of signup / login recovery) ─────────────
  async sendOTP(mobile: string) {
    // Validate mobile format
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    const otp = this.generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Check if customer already exists
    let customer = await Customer.findOne({ mobile }).select("+otp +otpExpiry");

    if (customer) {
      // Update OTP for existing customer
      customer.otp = otp;
      customer.otpExpiry = otpExpiry;
      await customer.save({ validateModifiedOnly: true });
    }

    // In production, integrate with SMS gateway (e.g., Twilio, MSG91)
    // For now we'll return the OTP in dev mode for testing
    console.log(`[OTP] Mobile: ${mobile} → OTP: ${otp}`);

    return {
      exists: !!customer,
      isVerified: customer?.isVerified || false,
      // Only return OTP in development for testing
      ...(process.env.NODE_ENV !== "production" ? { otp } : {}),
    };
  }

  // ── Verify OTP ────────────────────────────────────────────────
  async verifyOTP(mobile: string, otp: string) {
    const customer = await Customer.findOne({ mobile }).select("+otp +otpExpiry");

    if (!customer) {
      throw new AppError("No account found with this mobile number", 404);
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

  // ── Signup (create customer) ──────────────────────────────────
  async signup(data: {
    firstName: string;
    lastName: string;
    mobile: string;
    password: string;
    email?: string;
    alternatePhone?: string;
  }) {
    // Check if mobile already exists
    const existing = await Customer.findOne({ mobile: data.mobile });
    if (existing && existing.isVerified) {
      throw new AppError("An account with this mobile number already exists", 400);
    }

    // Check email uniqueness if provided
    if (data.email) {
      const emailExists = await Customer.findOne({ email: data.email.toLowerCase() });
      if (emailExists) {
        throw new AppError("An account with this email already exists", 400);
      }
    }

    // Generate OTP
    const otp = this.generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    if (existing && !existing.isVerified) {
      // Update unverified account
      existing.firstName = data.firstName;
      existing.lastName = data.lastName;
      existing.password = data.password;
      existing.email = data.email;
      existing.alternatePhone = data.alternatePhone;
      existing.otp = otp;
      existing.otpExpiry = otpExpiry;
      await existing.save();

      console.log(`[OTP] Signup mobile: ${data.mobile} → OTP: ${otp}`);
      return {
        customerId: existing._id,
        ...(process.env.NODE_ENV !== "production" ? { otp } : {}),
      };
    }

    const customer = await Customer.create({
      ...data,
      otp,
      otpExpiry,
      isVerified: false,
    });

    console.log(`[OTP] Signup mobile: ${data.mobile} → OTP: ${otp}`);

    return {
      customerId: customer._id,
      ...(process.env.NODE_ENV !== "production" ? { otp } : {}),
    };
  }

  // ── Login ─────────────────────────────────────────────────────
  async login(mobile: string, password: string) {
    const customer = await Customer.findOne({ mobile }).select("+password");

    if (!customer) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    if (!customer.isVerified) {
      throw new AppError("Please verify your mobile number first", 403);
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

  // ── Get profile ───────────────────────────────────────────────
  async getProfile(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate("wishlist", "productName images price originalPrice")
      .lean();

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    return customer;
  }

  // ── Update profile ────────────────────────────────────────────
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

  // ── Change password ───────────────────────────────────────────
  async changePassword(
    customerId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const customer = await Customer.findById(customerId).select("+password");
    if (!customer) throw new AppError("Customer not found", 404);

    const isMatch = await customer.comparePassword(currentPassword);
    if (!isMatch) throw new AppError("Current password is incorrect", 401);

    customer.password = newPassword;
    await customer.save();

    return true;
  }

  // ═════════════════════ ADDRESS MANAGEMENT ═════════════════════

  async addAddress(customerId: string, address: any) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    if (customer.addresses.length >= 5) {
      throw new AppError("You can add a maximum of 5 addresses", 400);
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

    const objectId = new mongoose.Types.ObjectId(productId);
    const index = customer.wishlist.findIndex(
      (id) => id.toString() === productId
    );

    let action: "added" | "removed";

    if (index > -1) {
      customer.wishlist.splice(index, 1);
      action = "removed";
    } else {
      customer.wishlist.push(objectId);
      action = "added";
    }

    await customer.save();
    return { action, wishlist: customer.wishlist };
  }

  async getWishlist(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate("wishlist", "productName images price originalPrice discountPercentage category stock")
      .lean();

    if (!customer) throw new AppError("Customer not found", 404);
    return customer.wishlist;
  }

  async clearWishlist(customerId: string) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: { wishlist: [] } },
      { new: true }
    );
    if (!customer) throw new AppError("Customer not found", 404);
    return [];
  }
}

export const customerService = new CustomerService();