import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { generateTokenPair } from "../utils/jwt";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";
import { customerService } from "../services/customerService";

/**
 * Customer Signup
 * POST /api/customer/auth/signup
 * Creates account + sends OTP for mobile verification
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

  return sendSuccessResponse(res, 201, "Account created. Please verify your mobile number with the OTP sent.", result);
});

/**
 * Send / Resend OTP
 * POST /api/customer/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile) {
    throw new AppError("Mobile number is required", 400);
  }

  const result = await customerService.sendOTP(mobile);

  return sendSuccessResponse(res, 200, "OTP sent successfully", result);
});

/**
 * Verify OTP
 * POST /api/customer/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    throw new AppError("Mobile number and OTP are required", 400);
  }

  const customer = await customerService.verifyOTP(mobile, otp);

  // Generate tokens after successful verification
  const { accessToken, refreshToken } = generateTokenPair({
    id: customer._id.toString(),
    email: customer.email || "",
    role: "customer",
  });

  // Set cookies for customer (separate from admin cookies)
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("customerAccessToken", accessToken, {
    maxAge: 15 * 60 * 1000, // 15 minutes
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  res.cookie("customerRefreshToken", refreshToken, {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  return sendSuccessResponse(
    res,
    200,
    "Mobile verified successfully",
    {
      customer: customer.toJSON(),
      accessToken,
      refreshToken,
    }
  );
});

/**
 * Customer Login
 * POST /api/customer/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    throw new AppError("Mobile number and password are required", 400);
  }

  const customer = await customerService.login(mobile, password);

  const { accessToken, refreshToken } = generateTokenPair({
    id: customer._id.toString(),
    email: customer.email || "",
    role: "customer",
  });

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("customerAccessToken", accessToken, {
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  res.cookie("customerRefreshToken", refreshToken, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  return sendSuccessResponse(
    res,
    200,
    "Login successful",
    {
      customer: customer.toJSON(),
      accessToken,
      refreshToken,
    }
  );
});

/**
 * Customer Logout
 * POST /api/customer/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie("customerAccessToken", { path: "/" });
  res.clearCookie("customerRefreshToken", { path: "/" });

  return sendSuccessResponse(res, 200, "Logged out successfully");
});

/**
 * Refresh Token
 * POST /api/customer/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { verifyToken } = require("../utils/jwt");

  const token = req.cookies?.customerRefreshToken || req.body.refreshToken;

  if (!token) {
    throw new AppError("Refresh token is required", 400);
  }

  const decoded = verifyToken(token);

  if (decoded.role !== "customer") {
    throw new AppError("Invalid token type", 401);
  }

  const Customer = require("../models/customer").default;
  const customer = await Customer.findById(decoded.id);

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair({
    id: customer._id.toString(),
    email: customer.email || "",
    role: "customer",
  });

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("customerAccessToken", newAccessToken, {
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  res.cookie("customerRefreshToken", newRefreshToken, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });

  return sendSuccessResponse(
    res,
    200,
    "Token refreshed successfully",
    {
      customer: customer.toJSON(),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }
  );
});

/**
 * Get Current Customer Profile
 * GET /api/customer/auth/me
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;

  if (!customerId) {
    throw new AppError("Not authenticated", 401);
  }

  const customer = await customerService.getProfile(customerId);

  return sendSuccessResponse(res, 200, "Profile retrieved successfully", customer);
});
