import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { generateToken, generateTokenPair, verifyToken } from "../utils/jwt";
import {
  comparePassword,
  validatePasswordStrength,
  hashPassword,
} from "../utils/password";
import {
  sendTokenCookie,
  sendTokenCookies,
  clearCookies,
} from "../utils/cookies";
import {
  sendSuccessResponse,
  sendErrorResponse,
  sendValidationErrorResponse,
} from "../utils/apiResponse";
import AppError from "../utils/appError";
import User from "../models/user";

/**
 * User Login
 * POST /auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Please provide email and password", 400);
  }

  const user = await User.findOne({ email }).select("+password");
  
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Debug: Check if password field exists
  if (!user.password) {
    console.error("ERROR: User password field is missing or undefined");
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordCorrect = await user.comparePassword(password);

  console.log("Password comparison result:", isPasswordCorrect);

  if (!isPasswordCorrect) {
    throw new AppError("Invalid email or password", 401);
  }

  const { accessToken, refreshToken } = generateTokenPair({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  sendTokenCookies(res, accessToken, refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return sendSuccessResponse(
    res,
    200,
    "Login successful",
    {
      id: user._id,
      name: user.name,
      email: user.email,
      userName: user.userName,
      role: user.role,
    },
    { accessToken, refreshToken },
  );
});

/**
 * Logout
 * POST /auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearCookies(res);

  return sendSuccessResponse(res, 200, "Logout successful");
});

/**
 * Get current user
 * GET /auth/me
 * Requires authentication middleware
 */
export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId || (req as any).user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return sendSuccessResponse(res, 200, "User retrieved successfully", user);
  },
);

/**
 * Refresh Token
 * POST /auth/refresh
 * Rotates both access and refresh tokens
 */
export const refreshAccessToken = asyncHandler(
  async (req: Request, res: Response) => {
    const refreshTokenFromRequest =
      req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshTokenFromRequest) {
      throw new AppError("Refresh token is required", 400);
    }

    // Verify the refresh token
    const decoded = verifyToken(refreshTokenFromRequest);

    const user = await User.findById(decoded.id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Generate new token pair (both access and refresh tokens)
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokenPair({
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      });

    // Send both new tokens as cookies
    sendTokenCookies(res, newAccessToken, newRefreshToken, {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
    });

    return sendSuccessResponse(
      res,
      200,
      "Token refreshed successfully",
      { id: user._id, email: user.email, role: user.role },
      { accessToken: newAccessToken, refreshToken: newRefreshToken },
    );
  },
);

/**
 * Change Password
 * POST /auth/change-password
 * Requires authentication
 */
export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword, passwordConfirm } = req.body;
    const userId = (req as any).userId || (req as any).user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!currentPassword || !newPassword || !passwordConfirm) {
      throw new AppError("Please provide all required fields", 400);
    }

    if (newPassword !== passwordConfirm) {
      throw new AppError("New passwords do not match", 400);
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new AppError(
        `Password is weak: ${passwordValidation.errors.join(", ")}`,
        400,
      );
    }

    if (currentPassword === newPassword) {
      throw new AppError(
        "New password must be different from current password",
        400,
      );
    }

    const user = await User.findById(userId).select("+password");

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const isPasswordCorrect = await user.comparePassword(currentPassword);

    if (!isPasswordCorrect) {
      throw new AppError("Current password is incorrect", 401);
    }

    user.password = newPassword;
    await user.save();

    return sendSuccessResponse(res, 200, "Password changed successfully");
  },
);
