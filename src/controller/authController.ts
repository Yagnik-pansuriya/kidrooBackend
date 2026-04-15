import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { generateTokenPair, verifyToken } from "../utils/jwt";
import { validatePasswordStrength, hashPassword } from "../utils/password";
import { sendTokenCookies, clearCookies } from "../utils/cookies";
import { sendSuccessResponse, sendErrorResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";
import User from "../models/user";
import { authService } from "../services/authService";
import { PermissionService } from "../services/permissionService";
import { CacheService } from "../services/redisCacheService";

/**
 * User Login
 * POST /auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Please provide email and password", 400);
  }

  const user = await authService.getUserByEmail(email);

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.password) {
    throw new AppError("Invalid email or password", 401);
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new AppError("Invalid email or password", 401);
  }

  const basePayload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateTokenPair(basePayload);

  // Store refresh token in Redis for single-session rotation (TTL: 7 days)
  await CacheService.setRefreshToken(user._id.toString(), refreshToken);

  // Send tokens via HttpOnly cookies ONLY — never expose in response body
  sendTokenCookies(res, accessToken, refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const permissions = await PermissionService.getPermissions(user._id.toString());

  // CRIT-3 fix: tokens are NOT returned in the response body
  return sendSuccessResponse(res, 200, "Login successful", {
    id: user._id,
    name: user.name,
    email: user.email,
    userName: user.userName,
    role: user.role,
    permissions,
  });
});

/**
 * Logout
 * POST /auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Try to invalidate the refresh token in Redis
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const decoded = verifyToken(refreshToken, "refresh");
      await CacheService.deleteRefreshToken(decoded.id);
    } catch {
      // Token already expired or invalid — still proceed with cookie clearing
    }
  }

  clearCookies(res);
  return sendSuccessResponse(res, 200, "Logout successful");
});

/**
 * Refresh Token
 * POST /auth/refresh
 * Validates refresh token type, rotates the token pair.
 */
export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshTokenFromRequest = req.cookies?.refreshToken || req.body.refreshToken;

  if (!refreshTokenFromRequest) {
    throw new AppError("Refresh token is required", 400);
  }

  // CRIT-2 fix: assert this is a refresh token, not an access token
  const decoded = verifyToken(refreshTokenFromRequest, "refresh");

  // HIGH-1 fix: validate token exists in Redis (rotation check)
  const storedToken = await CacheService.getRefreshToken(decoded.id);
  if (!storedToken || storedToken !== refreshTokenFromRequest) {
    // Token was already rotated or user logged out — reject
    throw new AppError("Refresh token is invalid or has already been used", 401);
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const basePayload = { id: user._id.toString(), email: user.email, role: user.role };
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    generateTokenPair(basePayload);

  // Rotate: delete old, store new
  await CacheService.deleteRefreshToken(user._id.toString());
  await CacheService.setRefreshToken(user._id.toString(), newRefreshToken);

  sendTokenCookies(res, newAccessToken, newRefreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const permissions = await PermissionService.getPermissions(user._id.toString());

  // CRIT-3 fix: tokens NOT in response body
  return sendSuccessResponse(res, 200, "Token refreshed successfully", {
    id: user._id,
    email: user.email,
    role: user.role,
    permissions,
  });
});

/**
 * Get current user
 * GET /auth/me
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId || (req as any).user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const permissions = await PermissionService.getPermissions(user._id.toString());
  const userData = user.toObject();
  (userData as any).permissions = permissions;

  return sendSuccessResponse(res, 200, "User retrieved successfully", userData);
});

/**
 * Change Password
 * POST /auth/change-password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
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
    throw new AppError(`Password is weak: ${passwordValidation.errors.join(", ")}`, 400);
  }

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from current password", 400);
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

  // Invalidate refresh token so user must re-login on all sessions
  await CacheService.deleteRefreshToken(userId);

  return sendSuccessResponse(res, 200, "Password changed successfully");
});
