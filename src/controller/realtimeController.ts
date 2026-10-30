import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";
import { createSubscriberToken, isRealtimeEnabled } from "../services/realtimeService";

/**
 * Get a Mercure subscriber token for live admin alerts
 * GET /api/admin/realtime/token
 */
export const getRealtimeToken = asyncHandler(async (req: Request, res: Response) => {
  if (!isRealtimeEnabled()) {
    throw new AppError("Live notifications are not configured", 503);
  }

  const role = (req as any).user?.role;
  return sendSuccessResponse(res, 200, "Realtime token issued", createSubscriberToken(role));
});
