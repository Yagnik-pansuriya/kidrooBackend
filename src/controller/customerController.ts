import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";
import { customerService } from "../services/customerService";

// ═══════════════════ PROFILE ═══════════════════

/**
 * Update Profile
 * PUT /api/customer/profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { firstName, lastName, email, alternatePhone, avatar } = req.body;

  const customer = await customerService.updateProfile(customerId, {
    firstName,
    lastName,
    email,
    alternatePhone,
    avatar,
  });

  return sendSuccessResponse(res, 200, "Profile updated successfully", customer);
});

/**
 * Change Password
 * POST /api/customer/change-password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }

  // MED-6 FIX: Enforce consistent password policy (8 chars + complexity)
  if (newPassword.length < 8) {
    throw new AppError("New password must be at least 8 characters", 400);
  }
  if (!/[A-Z]/.test(newPassword)) {
    throw new AppError("New password must contain at least one uppercase letter", 400);
  }
  if (!/[0-9]/.test(newPassword)) {
    throw new AppError("New password must contain at least one number", 400);
  }

  await customerService.changePassword(customerId, currentPassword, newPassword);

  return sendSuccessResponse(res, 200, "Password changed successfully");
});

// ═══════════════════ ADDRESS ═══════════════════

/**
 * Add Address
 * POST /api/customer/addresses
 */
export const addAddress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const addresses = await customerService.addAddress(customerId, req.body);

  return sendSuccessResponse(res, 201, "Address added successfully", addresses);
});

/**
 * Update Address
 * PUT /api/customer/addresses/:addressId
 */
export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const addressId = req.params.addressId as string;
  const addresses = await customerService.updateAddress(customerId, addressId, req.body);

  return sendSuccessResponse(res, 200, "Address updated successfully", addresses);
});

/**
 * Delete Address
 * DELETE /api/customer/addresses/:addressId
 */
export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const addressId = req.params.addressId as string;
  const addresses = await customerService.deleteAddress(customerId, addressId);

  return sendSuccessResponse(res, 200, "Address deleted successfully", addresses);
});

/**
 * Set Default Address
 * PATCH /api/customer/addresses/:addressId/default
 */
export const setDefaultAddress = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const addressId = req.params.addressId as string;
  const addresses = await customerService.setDefaultAddress(customerId, addressId);

  return sendSuccessResponse(res, 200, "Default address set successfully", addresses);
});

// ═══════════════════ WISHLIST ═══════════════════

/**
 * Get Wishlist
 * GET /api/customer/wishlist
 */
export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const wishlist = await customerService.getWishlist(customerId);

  return sendSuccessResponse(res, 200, "Wishlist fetched successfully", wishlist);
});

/**
 * Toggle Wishlist Item (Add/Remove)
 * POST /api/customer/wishlist/:productId
 */
export const toggleWishlist = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const productId = req.params.productId as string;

  // LOW-6 FIX: Validate productId to prevent CastError 500
  if (!productId || !/^[a-fA-F0-9]{24}$/.test(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const result = await customerService.toggleWishlist(customerId, productId);

  const message = result.action === "added"
    ? "Product added to wishlist"
    : "Product removed from wishlist";

  return sendSuccessResponse(res, 200, message, result);
});

/**
 * Clear Wishlist
 * DELETE /api/customer/wishlist
 */
export const clearWishlist = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const wishlist = await customerService.clearWishlist(customerId);

  return sendSuccessResponse(res, 200, "Wishlist cleared", wishlist);
});
