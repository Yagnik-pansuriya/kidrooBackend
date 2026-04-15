import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import { reviewService } from "../services/reviewService";
import AppError from "../utils/appError";
import mongoose from "mongoose";

// GET /api/reviews/product/:productId (public — approved only)
export const getProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.getProductReviews(req.params.productId as string);
  return sendSuccessResponse(res, 200, "Reviews fetched", reviews);
});

// GET /api/reviews/product/:productId/stats (public)
export const getProductStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await reviewService.getProductStats(req.params.productId as string);
  return sendSuccessResponse(res, 200, "Stats fetched", stats);
});

// POST /api/reviews/product/:productId (public — rate limited + validated by route)
export const addReview = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { name, rating, title, comment } = req.body;
  const userId = (req as any).userId; // May be undefined for anonymous reviews

  const review = await reviewService.addReview({
    product: req.params.productId as string,
    name,
    rating: Number(rating), // Zod already validates this as a valid integer
    title,
    comment,
    user: userId,
  });
  return sendSuccessResponse(res, 201, "Review added", review);
});

// GET /api/reviews (admin — paginated)
// MED-5: Added pagination; no longer returns unbounded result set
export const getAllReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const result = await reviewService.getAllReviews(page, limit);
  return sendSuccessResponse(res, 200, "All reviews fetched", result);
});

// DELETE /api/reviews/:id (admin)
// MED-9: ObjectId validation added
export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid review ID", 400);
  await reviewService.deleteReview(id as string);
  return sendSuccessResponse(res, 200, "Review deleted");
});

// PATCH /api/reviews/:id/toggle (admin)
// MED-9: ObjectId validation added
export const toggleReviewApproval = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid review ID", 400);
  const review = await reviewService.toggleApproval(id as string);
  return sendSuccessResponse(res, 200, "Review approval toggled", review);
});
