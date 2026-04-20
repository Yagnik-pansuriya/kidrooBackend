import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { generateTokenPair, verifyToken } from "../utils/jwt";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";
import { customerService } from "../services/customerService";
import { CacheService } from "../services/redisCacheService";
import Customer from "../models/customer";

// ── Shared cookie setter ──────────────────────────────────────────
const setCustomerCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
): void => {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("customerAccessToken", accessToken, {
    maxAge: 15 * 60 * 1000, // 15 minutes — matches JWT "15m"
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  res.cookie("customerRefreshToken", refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // LOW-5 FIX: 7 days — matches JWT "7d" expiry
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });
};

// ── Helper: issue token pair + store refresh token in Redis ───────
const issueTokens = async (customer: any) => {
  const { accessToken, refreshToken } = generateTokenPair({
    id: customer._id.toString(),
    email: customer.email ?? "",
    role: "customer",
  });

  // Rotate: delete old, store new (single-session refresh token rotation)
  await CacheService.setCustomerRefreshToken(customer._id.toString(), refreshToken);

  return { accessToken, refreshToken };
};

// ════════════════════════════════════════════════════════════════
// SIGNUP  —  POST /api/customer/auth/signup
// ════════════════════════════════════════════════════════════════
/**
 * Step 1: Validate data, store in Redis, send OTP via Twilio SMS.
 * Does NOT save customer to MongoDB until OTP is verified.
 */
export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, mobile, password, email, alternatePhone } = req.body;

  if (!firstName || !lastName || !mobile || !password) {
    throw new AppError("First name, last name, mobile, and password are required", 400);
  }

  const result = await customerService.signup({
    firstName,
    lastName,
    mobile,
    password,
    email,
    alternatePhone,
  });

  return sendSuccessResponse(
    res,
    200,
    "OTP sent to your mobile. Please verify to complete registration.",
    result
  );
});

// ════════════════════════════════════════════════════════════════
// RESEND OTP  —  POST /api/customer/auth/resend-otp
// ════════════════════════════════════════════════════════════════
export const resendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile) {
    throw new AppError("Mobile number is required", 400);
  }

  const result = await customerService.resendSignupOTP(mobile);

  return sendSuccessResponse(res, 200, "OTP resent successfully", result);
});

// ════════════════════════════════════════════════════════════════
// VERIFY OTP  —  POST /api/customer/auth/verify-otp
// ════════════════════════════════════════════════════════════════
/**
 * Step 2: Verify OTP hash, create customer in DB, issue tokens.
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    throw new AppError("Mobile number and OTP are required", 400);
  }

  const customer = await customerService.verifyOTP(mobile, otp);
  const { accessToken, refreshToken } = await issueTokens(customer);

  setCustomerCookies(res, accessToken, refreshToken);

  return sendSuccessResponse(
    res,
    201,
    "Account verified successfully! Welcome to Kidroo!",
    {
      customer: customer.toJSON(),
      accessToken,
    }
  );
});

// ════════════════════════════════════════════════════════════════
// LOGIN  —  POST /api/customer/auth/login
// ════════════════════════════════════════════════════════════════
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    throw new AppError("Mobile number and password are required", 400);
  }

  const customer = await customerService.login(mobile, password);
  const { accessToken, refreshToken } = await issueTokens(customer);

  setCustomerCookies(res, accessToken, refreshToken);

  return sendSuccessResponse(res, 200, "Login successful", {
    customer: customer.toJSON(),
    accessToken,
  });
});

// ════════════════════════════════════════════════════════════════
// LOGOUT  —  POST /api/customer/auth/logout
// ════════════════════════════════════════════════════════════════
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Try to invalidate the stored customer refresh token in Redis
  const token =
    req.cookies?.customerRefreshToken ?? req.body?.refreshToken;

  if (token) {
    try {
      const decoded = verifyToken(token, "refresh");
      if (decoded.role === "customer") {
        await CacheService.deleteCustomerRefreshToken(decoded.id);
      }
    } catch {
      // Token already expired or invalid — still clear cookies
    }
  }

  res.clearCookie("customerAccessToken", { path: "/" });
  res.clearCookie("customerRefreshToken", { path: "/" });

  return sendSuccessResponse(res, 200, "Logged out successfully");
});

// ════════════════════════════════════════════════════════════════
// REFRESH TOKEN  —  POST /api/customer/auth/refresh
// ════════════════════════════════════════════════════════════════
/**
 * Rotates the customer refresh token.
 * - Asserts token type = "refresh" (prevents access-token-as-refresh attack)
 * - Validates token against Redis (rejects replayed/stolen tokens)
 * - Issues new access + refresh token pair and rotates Redis store
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token =
    req.cookies?.customerRefreshToken ?? req.body?.refreshToken;

  if (!token) {
    throw new AppError("Refresh token is required", 400);
  }

  // Assert this must be a refresh token, not an access token
  const decoded = verifyToken(token, "refresh");

  if (decoded.role !== "customer") {
    throw new AppError("Invalid token type", 401);
  }

  // Validate against Redis — reject replayed or stale tokens
  const storedToken = await CacheService.getCustomerRefreshToken(decoded.id);
  if (!storedToken || storedToken !== token) {
    throw new AppError("Refresh token is invalid or has already been used", 401);
  }

  const customer = await Customer.findById(decoded.id);
  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  if (!customer.isActive) {
    throw new AppError("Your account has been deactivated", 403);
  }

  // Generate new pair and rotate Redis store
  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(customer);

  setCustomerCookies(res, accessToken, newRefreshToken);

  return sendSuccessResponse(res, 200, "Token refreshed successfully", {
    accessToken,
  });
});

// ════════════════════════════════════════════════════════════════
// FORGOT PASSWORD  —  POST /api/customer/auth/forgot-password
// ════════════════════════════════════════════════════════════════
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile) {
    throw new AppError("Mobile number is required", 400);
  }

  const result = await customerService.forgotPassword(mobile);

  return sendSuccessResponse(res, 200, result.message);
});

// ════════════════════════════════════════════════════════════════
// RESET PASSWORD  —  POST /api/customer/auth/reset-password
// ════════════════════════════════════════════════════════════════
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp, newPassword, confirmPassword } = req.body;

  if (!mobile || !otp || !newPassword || !confirmPassword) {
    throw new AppError("Mobile, OTP, newPassword, and confirmPassword are required", 400);
  }

  if (newPassword !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }

  // MED-6 FIX: Enforce stronger password policy (matches signup requirements)
  if (newPassword.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }
  if (!/[A-Z]/.test(newPassword)) {
    throw new AppError("Password must contain at least one uppercase letter", 400);
  }
  if (!/[0-9]/.test(newPassword)) {
    throw new AppError("Password must contain at least one number", 400);
  }

  const result = await customerService.resetPassword(mobile, otp, newPassword);

  return sendSuccessResponse(res, 200, result.message);
});

// ════════════════════════════════════════════════════════════════
// GET ME  —  GET /api/customer/auth/me
// ════════════════════════════════════════════════════════════════
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;

  if (!customerId) {
    throw new AppError("Not authenticated", 401);
  }

  const customer = await customerService.getProfile(customerId);

  return sendSuccessResponse(res, 200, "Profile retrieved successfully", customer);
});
