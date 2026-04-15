import Customer from "../models/customer";
import AppError from "../utils/appError";
import { sendSMS } from "../utils/twilio";
import { CacheService } from "./redisCacheService";
import {
  generateAndStoreSignupOTP,
  verifySignupOTP,
  refreshSignupOTP,
  generateAndStoreForgotOTP,
  verifyForgotOTP,
  getResendCooldown,
  setResendCooldown,
  getPendingSignup,
} from "./otpService";
import mongoose from "mongoose";

class CustomerService {
  // ═════════════════════ SIGNUP (Step 1) ════════════════════════

  /**
   * Step 1: Validate, store pending data in Redis, send OTP via Twilio SMS.
   * Customer is NOT saved to MongoDB until OTP is verified.
   */
  async signup(data: {
    firstName: string;
    lastName: string;
    mobile: string;
    password: string;
    email?: string;
    alternatePhone?: string;
  }) {
    if (!/^[6-9]\d{9}$/.test(data.mobile)) {
      throw new AppError("Invalid Indian mobile number format", 400);
    }

    // Check if a verified account already exists with this mobile
    const existingByMobile = await Customer.findOne({ mobile: data.mobile, isVerified: true });
    if (existingByMobile) {
      throw new AppError("An account with this mobile number already exists", 400);
    }

    // Check email uniqueness (verified accounts only)
    if (data.email) {
      const existingByEmail = await Customer.findOne({
        email: data.email.toLowerCase(),
        isVerified: true,
      });
      if (existingByEmail) {
        throw new AppError("An account with this email already exists", 400);
      }
    }

    // Check resend cooldown (prevents repeated signup calls)
    const cooldown = await getResendCooldown(data.mobile);
    if (cooldown > 0) {
      throw new AppError(`Please wait ${cooldown}s before requesting a new OTP.`, 429);
    }

    // Store pending data + generate OTP in Redis
    const otp = await generateAndStoreSignupOTP({
      ...data,
      email: data.email?.toLowerCase(),
    });

    // Send OTP via Twilio SMS FIRST — only set cooldown after successful send.
    // If SMS fails, clean up Redis so the user can retry immediately.
    try {
      await sendSMS(
        data.mobile,
        `Your Kidroo verification code is: ${otp}. Valid for 5 minutes. Do not share it with anyone.`
      );
    } catch (err: any) {
      // Roll back Redis key so user isn't stuck waiting for a cooldown
      const { redis } = await import("../config/redis");
      await redis.del(`otp:signup:${data.mobile}`);
      throw err; // Re-throw the Twilio error
    }

    // Cooldown only starts after SMS is confirmed sent
    await setResendCooldown(data.mobile);

    console.log(`[OTP:Signup] SMS sent to +91${data.mobile}`);

    return {
      message: "OTP sent to your mobile number. Please verify to complete registration.",
      mobile: data.mobile,
    };
  }

  // ═════════════════════ VERIFY OTP (Step 2) ════════════════════

  /**
   * Step 2: Validate OTP hash, create customer in MongoDB, return customer doc.
   * Handles both signup verification and login-less verification flows.
   */
  async verifyOTP(mobile: string, otp: string) {
    // Verify against signup pending store
    const pendingData = await verifySignupOTP(mobile, otp);

    // OTP correct — remove any unverified DB record for this mobile (clean slate)
    await Customer.deleteOne({ mobile, isVerified: false });

    // Create verified customer in MongoDB
    const customer = await Customer.create({
      firstName: pendingData.firstName,
      lastName: pendingData.lastName,
      mobile: pendingData.mobile,
      password: pendingData.password, // hashed by pre-save hook
      email: pendingData.email,
      alternatePhone: pendingData.alternatePhone,
      isVerified: true,
    });

    return customer;
  }

  // ═════════════════════ RESEND OTP ════════════════════════════

  /**
   * Resend signup OTP. Enforces 60s cooldown to prevent SMS billing abuse.
   */
  async resendSignupOTP(mobile: string) {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid Indian mobile number format", 400);
    }

    // Enforce cooldown
    const cooldown = await getResendCooldown(mobile);
    if (cooldown > 0) {
      throw new AppError(
        `Please wait ${cooldown} second${cooldown === 1 ? "" : "s"} before resending.`,
        429
      );
    }

    // Ensure there is a pending signup to resend for
    const pending = await getPendingSignup(mobile);
    if (!pending) {
      throw new AppError("No pending signup found for this number. Please sign up again.", 404);
    }

    const otp = await refreshSignupOTP(mobile);
    await setResendCooldown(mobile);

    await sendSMS(
      mobile,
      `Your Kidroo verification code is: ${otp}. Valid for 5 minutes. Do not share it.`
    );

    console.log(`[OTP:Resend] SMS resent to +91${mobile}`);

    return { message: "OTP resent to your mobile number." };
  }

  // ═════════════════════ LOGIN ══════════════════════════════════

  async login(mobile: string, password: string) {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    const customer = await Customer.findOne({ mobile }).select("+password");

    if (!customer) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    if (!customer.isVerified) {
      throw new AppError(
        "Your account is not verified. Please complete OTP verification.",
        403
      );
    }

    if (!customer.isActive) {
      throw new AppError("Your account has been deactivated. Please contact support.", 403);
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    customer.lastLogin = new Date();
    await customer.save({ validateModifiedOnly: true });

    return customer;
  }

  // ═════════════════════ FORGOT PASSWORD ════════════════════════

  /**
   * Send OTP to registered mobile for password reset.
   */
  async forgotPassword(mobile: string) {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    // Always respond generically to prevent mobile enumeration
    const customer = await Customer.findOne({ mobile, isVerified: true });
    if (!customer) {
      // Respond as if sent — prevents account enumeration
      return { message: "If this number is registered, an OTP has been sent." };
    }

    if (!customer.isActive) {
      throw new AppError("Your account has been deactivated. Please contact support.", 403);
    }

    // Enforce cooldown
    const cooldown = await getResendCooldown(mobile);
    if (cooldown > 0) {
      throw new AppError(
        `Please wait ${cooldown} second${cooldown === 1 ? "" : "s"} before requesting another OTP.`,
        429
      );
    }

    const otp = await generateAndStoreForgotOTP(mobile);

    // Send SMS FIRST — set cooldown only after confirmed delivery.
    // If SMS fails, clean up Redis so user can retry immediately.
    try {
      await sendSMS(
        mobile,
        `Your Kidroo password reset code is: ${otp}. Valid for 5 minutes. Do not share it with anyone.`
      );
    } catch (err: any) {
      const { redis } = await import("../config/redis");
      await redis.del(`otp:forgot:${mobile}`);
      throw err;
    }

    // Cooldown only after successful send
    await setResendCooldown(mobile);

    console.log(`[OTP:ForgotPassword] SMS sent to +91${mobile}`);

    return { message: "If this number is registered, an OTP has been sent." };
  }

  // ═════════════════════ RESET PASSWORD ═════════════════════════

  /**
   * Verify OTP and set new password. Invalidates all existing refresh tokens.
   */
  async resetPassword(mobile: string, otp: string, newPassword: string) {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new AppError("Invalid mobile number format", 400);
    }

    // Verify forgot OTP (throws on failure)
    await verifyForgotOTP(mobile, otp);

    const customer = await Customer.findOne({ mobile, isVerified: true }).select("+password");
    if (!customer) {
      throw new AppError("Account not found", 404);
    }

    // Prevent reusing the same password
    const isSamePassword = await customer.comparePassword(newPassword);
    if (isSamePassword) {
      throw new AppError("New password must be different from your current password", 400);
    }

    customer.password = newPassword; // pre-save hook will rehash
    await customer.save();

    // Invalidate all existing customer refresh tokens
    await CacheService.deleteCustomerRefreshToken(customer._id.toString());

    return { message: "Password reset successfully. Please log in with your new password." };
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

    if (currentPassword === newPassword) {
      throw new AppError("New password must be different from current password", 400);
    }

    customer.password = newPassword;
    await customer.save();

    // Force re-login on all sessions
    await CacheService.deleteCustomerRefreshToken(customerId);

    return { message: "Password changed successfully" };
  }

  // ═════════════════════ ADDRESS MANAGEMENT ═════════════════════

  async addAddress(customerId: string, address: any) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    if (customer.addresses.length >= 5) {
      throw new AppError("Maximum 5 addresses allowed. Please delete one first.", 400);
    }

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

  // ═════════════════════ WISHLIST MANAGEMENT ════════════════════

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

    return { action, wishlist: customer.wishlist };
  }

  async getWishlist(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate(
        "wishlist",
        "productName images price originalPrice stock discountPercentage"
      )
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