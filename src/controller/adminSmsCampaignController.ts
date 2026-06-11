import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/customer";
import SmsCampaign from "../models/smsCampaign";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// 90 days ago — "at risk" threshold
const atRiskDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
};

// Start of current month
const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

/**
 * Resolve customer documents for a given targetGroup.
 * Returns array of { _id, firstName, lastName, mobile }
 */
async function resolveTargetCustomers(
  targetGroup: string,
  targetIds: string[]
): Promise<{ _id: mongoose.Types.ObjectId; firstName: string; lastName: string; mobile: string }[]> {
  if (targetGroup === "custom" && targetIds.length > 0) {
    return Customer.find(
      { _id: { $in: targetIds }, isActive: true },
      { firstName: 1, lastName: 1, mobile: 1 }
    ).lean() as any;
  }

  // For group-based targeting we use the same aggregation logic as the list API
  const now = new Date();
  const monthStart = startOfMonth();
  const riskDate   = atRiskDate();

  const pipeline: mongoose.PipelineStage[] = [
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "customerId",
        as: "orders",
      },
    },
    {
      $addFields: {
        orderCount:    { $size: "$orders" },
        totalSpent:    { $sum: "$orders.totalAmount" },
        lastOrderDate: { $max: "$orders.createdAt" },
        isNewThisMonth: { $gte: ["$createdAt", monthStart] },
      },
    },
  ];

  // Apply group filter
  switch (targetGroup) {
    case "all":
      pipeline.push({ $match: { isActive: true } });
      break;
    case "repeat":
      pipeline.push({ $match: { isActive: true, orderCount: { $gt: 1 } } });
      break;
    case "high_value":
      pipeline.push({ $match: { isActive: true, totalSpent: { $gte: 1000 } } });
      break;
    case "new":
      pipeline.push({ $match: { isActive: true, isNewThisMonth: true } });
      break;
    case "at_risk":
      pipeline.push({
        $match: {
          isActive: true,
          orderCount: { $gt: 0 },
          lastOrderDate: { $lt: riskDate },
        },
      });
      break;
    default:
      pipeline.push({ $match: { isActive: true } });
  }

  pipeline.push({ $project: { firstName: 1, lastName: 1, mobile: 1 } });

  return Customer.aggregate(pipeline) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/sms-campaigns/stats
// Global KPI: total sent, delivered, failedRate, campaigns this month
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignStats = asyncHandler(async (_req: Request, res: Response) => {
  const monthStart = startOfMonth();

  const [agg] = await SmsCampaign.aggregate([
    { $match: { status: "sent" } },
    {
      $group: {
        _id: null,
        totalSent:       { $sum: "$sentCount" },
        totalDelivered:  { $sum: "$deliveredCount" },
        totalFailed:     { $sum: "$failedCount" },
        campaignCount:   { $sum: 1 },
        thisMonthCount: {
          $sum: {
            $cond: [{ $gte: ["$sentAt", monthStart] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSent: 1,
        totalDelivered: 1,
        totalFailed: 1,
        campaignCount: 1,
        thisMonthCount: 1,
        deliveryRate: {
          $cond: [
            { $gt: ["$totalSent", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$totalDelivered", "$totalSent"] }, 100] },
                1,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  return sendSuccessResponse(res, 200, "Campaign stats fetched", agg || {
    totalSent: 0, totalDelivered: 0, totalFailed: 0,
    campaignCount: 0, thisMonthCount: 0, deliveryRate: 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/sms-campaigns
// List all campaigns (newest first)
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCampaigns = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await SmsCampaign.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return sendSuccessResponse(res, 200, "Campaigns fetched", campaigns);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/sms-campaigns
// Create + "send" a campaign (simulates delivery; plug in MSG91 here)
// Body: { name, message, targetGroup, targetIds?, targetLabel? }
// ─────────────────────────────────────────────────────────────────────────────
export const createAndSendCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { name, message, targetGroup = "all", targetIds = [], targetLabel } = req.body;

  if (!name || !name.trim())    throw new AppError("Campaign name is required", 400);
  if (!message || !message.trim()) throw new AppError("Message is required", 400);
  if (message.trim().length > 160)  throw new AppError("Message must be ≤ 160 characters", 400);

  // Resolve recipients
  const recipients = await resolveTargetCustomers(targetGroup, targetIds);

  if (recipients.length === 0) {
    throw new AppError("No active customers found for the selected target group", 400);
  }

  // ── Simulate SMS sending ──────────────────────────────────────
  // Replace this block with real MSG91 / Twilio API calls per recipient.
  // For now we simulate a ~4% failure rate.
  const sentCount      = recipients.length;
  const failedCount    = Math.max(0, Math.floor(sentCount * 0.04));
  const deliveredCount = sentCount - failedCount;

  const label = (targetLabel as string) || ({
    all:        "All Customers",
    repeat:     "Repeat Buyers",
    high_value: "VIP Customers",
    new:        "New This Month",
    at_risk:    "At-Risk Customers",
    custom:     `${sentCount} Selected`,
  } as Record<string, string>)[targetGroup] || "All Customers";

  const campaign = await SmsCampaign.create({
    name: name.trim(),
    message: message.trim(),
    targetGroup,
    targetLabel: label,
    targetIds: targetGroup === "custom" ? (targetIds as string[]).map(id => new mongoose.Types.ObjectId(id)) : [],
    status: "sent",
    sentCount,
    deliveredCount,
    failedCount,
    sentAt: new Date(),
  });

  return sendSuccessResponse(res, 201, `Campaign sent to ${sentCount} customers`, campaign);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/sms-campaigns/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid ID", 400);
  await SmsCampaign.findByIdAndDelete(new mongoose.Types.ObjectId(id));
  return sendSuccessResponse(res, 200, "Campaign deleted");
});
