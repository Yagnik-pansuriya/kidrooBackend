import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import { reviewService } from "../services/reviewService";

// GET /api/reviews/product/:productId (public - approved only)
export const getProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.getProductReviews(req.params.productId as string);
  return sendSuccessResponse(res, 200, "Reviews fetched", reviews);
});

// GET /api/reviews/product/:productId/stats (public)
export const getProductStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await reviewService.getProductStats(req.params.productId as string);
  return sendSuccessResponse(res, 200, "Stats fetched", stats);
});

// POST /api/reviews/product/:productId (public)
export const addReview = asyncHandler(async (req: Request, res: Response) => {
  const { name, rating, title, comment } = req.body;
  const review = await reviewService.addReview({
    product: req.params.productId as string,
    name,
    rating: Number(rating),
    title,
    comment,
  });
  return sendSuccessResponse(res, 201, "Review added", review);
});

// GET /api/reviews (admin - all reviews)
export const getAllReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.getAllReviews();
  return sendSuccessResponse(res, 200, "All reviews fetched", reviews);
});

// DELETE /api/reviews/:id (admin)
export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  await reviewService.deleteReview(req.params.id as string);
  return sendSuccessResponse(res, 200, "Review deleted");
});

// PATCH /api/reviews/:id/toggle (admin - toggle approval)
export const toggleReviewApproval = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.toggleApproval(req.params.id as string);
  return sendSuccessResponse(res, 200, "Review approval toggled", review);
});
