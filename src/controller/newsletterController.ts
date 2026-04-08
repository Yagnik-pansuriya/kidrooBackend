import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import { newsletterService } from "../services/newsletterService";

/**
 * POST /api/newsletter/subscribe
 * Public — subscribe an email to the newsletter
 */
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const subscriber = await newsletterService.subscribe(email);
  return sendSuccessResponse(res, 201, "Subscribed successfully!", subscriber);
});

/**
 * GET /api/newsletter
 * Admin — list all subscribers
 */
export const getAllSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const subscribers = await newsletterService.getAll();
  return sendSuccessResponse(res, 200, "Subscribers fetched", subscribers);
});

/**
 * GET /api/newsletter/stats
 * Admin — get subscriber stats
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await newsletterService.getStats();
  return sendSuccessResponse(res, 200, "Stats fetched", stats);
});

/**
 * DELETE /api/newsletter/:id
 * Admin — remove a subscriber
 */
export const removeSubscriber = asyncHandler(async (req: Request, res: Response) => {
  await newsletterService.remove(req.params.id as string);
  return sendSuccessResponse(res, 200, "Subscriber removed");
});

/**
 * POST /api/newsletter/unsubscribe
 * Public — unsubscribe an email
 */
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  await newsletterService.unsubscribe(email);
  return sendSuccessResponse(res, 200, "Unsubscribed successfully");
});
