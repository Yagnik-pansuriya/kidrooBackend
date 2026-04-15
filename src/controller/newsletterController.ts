import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import { newsletterService } from "../services/newsletterService";

/**
 * POST /api/newsletter/subscribe
 * Public — rate limited in route layer
 */
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const subscriber = await newsletterService.subscribe(email);
  return sendSuccessResponse(res, 201, "Subscribed successfully!", subscriber);
});

/**
 * GET /api/newsletter
 * Admin — paginated list of subscribers
 * MED-5: Added pagination, no longer returns unbounded result set
 */
export const getAllSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const result = await newsletterService.getAll(page, limit);
  return sendSuccessResponse(res, 200, "Subscribers fetched", result);
});

/**
 * GET /api/newsletter/stats
 * Admin — subscriber statistics
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await newsletterService.getStats();
  return sendSuccessResponse(res, 200, "Stats fetched", stats);
});

/**
 * DELETE /api/newsletter/:id
 * Admin — remove a subscriber permanently
 */
export const removeSubscriber = asyncHandler(async (req: Request, res: Response) => {
  await newsletterService.remove(req.params.id as string);
  return sendSuccessResponse(res, 200, "Subscriber removed");
});

/**
 * POST /api/newsletter/unsubscribe
 * Public — rate limited in route layer
 */
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  await newsletterService.unsubscribe(email);
  return sendSuccessResponse(res, 200, "Unsubscribed successfully");
});
