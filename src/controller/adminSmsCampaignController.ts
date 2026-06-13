import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/customer";
import SmsCampaign from "../models/smsCampaign";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import {
  sendWhatsAppBroadcast,
  BroadcastRecipient,
} from "../services/msg91WhatsappService";

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

// ── Group label map ──────────────────────────────────────────────────────────
const GROUP_LABELS: Record<string, string> = {
  all:        "All Customers",
  repeat:     "Repeat Buyers",
  high_value: "VIP Customers",
  new:        "New This Month",
  at_risk:    "At-Risk Customers",
  custom:     "Selected Customers",
};

// ─────────────────────────────────────────────────────────────────────────────
// resolveTargetCustomers
// Returns { _id, firstName, lastName, mobile } for the target group
// ─────────────────────────────────────────────────────────────────────────────
async function resolveTargetCustomers(
  targetGroup: string,
  targetIds: string[]
): Promise<BroadcastRecipient[]> {
  // Custom selection — use the exact IDs provided
  if (targetGroup === "custom" && targetIds.length > 0) {
    const docs = await Customer.find(
      { _id: { $in: targetIds }, isActive: true, mobile: { $exists: true, $ne: "" } },
      { firstName: 1, lastName: 1, mobile: 1 }
    ).lean();
    return docs.map((d: any) => ({
      mobile:    d.mobile,
      firstName: d.firstName,
      lastName:  d.lastName,
    }));
  }

  // Group-based — aggregate with order stats
  const monthStart = startOfMonth();
  const riskDate   = atRiskDate();

  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        isActive: true,
        mobile:   { $exists: true, $ne: "" }, // only customers with a WhatsApp number
      },
    },
    {
      $lookup: {
        from:         "orders",
        localField:   "_id",
        foreignField: "customerId",
        as:           "orders",
      },
    },
    {
      $addFields: {
        orderCount:     { $size: "$orders" },
        totalSpent:     { $sum: "$orders.totalAmount" },
        lastOrderDate:  { $max: "$orders.createdAt" },
        isNewThisMonth: { $gte: ["$createdAt", monthStart] },
      },
    },
  ];

  switch (targetGroup) {
    case "all":
      // already matched isActive above
      break;
    case "repeat":
      pipeline.push({ $match: { orderCount: { $gt: 1 } } });
      break;
    case "high_value":
      pipeline.push({ $match: { totalSpent: { $gte: 1000 } } });
      break;
    case "new":
      pipeline.push({ $match: { isNewThisMonth: true } });
      break;
    case "at_risk":
      pipeline.push({
        $match: {
          orderCount:    { $gt: 0 },
          lastOrderDate: { $lt: riskDate },
        },
      });
      break;
    default:
      break; // fall through — all active customers
  }

  pipeline.push({ $project: { firstName: 1, lastName: 1, mobile: 1 } });

  const docs: any[] = await Customer.aggregate(pipeline);
  return docs.map((d) => ({
    mobile:    d.mobile,
    firstName: d.firstName,
    lastName:  d.lastName,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/sms-campaigns/stats
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignStats = asyncHandler(async (_req: Request, res: Response) => {
  const monthStart = startOfMonth();

  const [agg] = await SmsCampaign.aggregate([
    { $match: { status: "sent" } },
    {
      $group: {
        _id:           null,
        totalSent:     { $sum: "$sentCount" },
        totalDelivered:{ $sum: "$deliveredCount" },
        totalFailed:   { $sum: "$failedCount" },
        campaignCount: { $sum: 1 },
        thisMonthCount: {
          $sum: { $cond: [{ $gte: ["$sentAt", monthStart] }, 1, 0] },
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
            { $round: [{ $multiply: [{ $divide: ["$totalDelivered", "$totalSent"] }, 100] }, 1] },
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
// Creates and sends a WhatsApp broadcast via MSG91.
// Body: { name, message, targetGroup, targetIds?, targetLabel? }
// ─────────────────────────────────────────────────────────────────────────────
export const createAndSendCampaign = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    message,
    targetGroup  = "all",
    targetIds    = [] as string[],
    targetLabel,
  } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!name || !String(name).trim())
    throw new AppError("Campaign name is required", 400);
  if (!message || !String(message).trim())
    throw new AppError("WhatsApp message is required", 400);
  if (String(message).trim().length > 1024)
    throw new AppError("Message must be ≤ 1024 characters", 400);

  // ── Resolve recipients ───────────────────────────────────────────────────────
  const recipients = await resolveTargetCustomers(
    String(targetGroup),
    Array.isArray(targetIds) ? (targetIds as string[]) : []
  );

  if (recipients.length === 0) {
    throw new AppError(
      "No active customers with a mobile number found for the selected group",
      400
    );
  }

  // ── Send WhatsApp broadcast via MSG91 ────────────────────────────────────────
  const { sent, delivered, failed } = await sendWhatsAppBroadcast(
    recipients,
    String(message).trim()
  );

  // ── Resolve label ────────────────────────────────────────────────────────────
  const label =
    (targetLabel as string) ||
    (targetGroup === "custom"
      ? `${sent} Selected Customers`
      : GROUP_LABELS[String(targetGroup)] ?? "All Customers");

  // ── Persist campaign record ──────────────────────────────────────────────────
  const campaign = await SmsCampaign.create({
    name:       String(name).trim(),
    message:    String(message).trim(),
    channel:    "whatsapp",
    targetGroup,
    targetLabel: label,
    targetIds:
      targetGroup === "custom"
        ? (targetIds as string[]).map((id) => new mongoose.Types.ObjectId(id))
        : [],
    status:        "sent",
    sentCount:     sent,
    deliveredCount: delivered,
    failedCount:   failed,
    sentAt:        new Date(),
  });

  return sendSuccessResponse(
    res,
    201,
    `WhatsApp broadcast sent to ${sent} customers (${delivered} delivered, ${failed} failed)`,
    campaign
  );
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
