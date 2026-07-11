import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/customer";
import AppError from "../utils/appError";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/customers/summary
// Returns global KPI stats for the customer list header cards
// ═══════════════════════════════════════════════════════════════
export const getCustomerSummary = asyncHandler(async (_req: Request, res: Response) => {
  // Start of this calendar month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [summary] = await Customer.aggregate([
      {
        $addFields: {
          orderCount: 0,
          lifetimeValue: 0,
          isRepeat: false,
          isNewThisMonth: { $gte: ["$createdAt", startOfMonth] },
        },
      },
      {
        $group: {
          _id: null,
          total:         { $sum: 1 },
          newThisMonth:  { $sum: { $cond: ["$isNewThisMonth", 1, 0] } },
          repeatCount:   { $sum: 0 },
          totalLTV:      { $sum: 0 },
        },
      },
      {
        $project: {
          _id: 0,
          total:        1,
          newThisMonth: 1,
          repeatCount:  1,
          repeatRate:   { $literal: 0 },
          avgLTV:       { $literal: 0 },
        },
      },
    ]);

  const stats = summary || {
    total: 0,
    newThisMonth: 0,
    repeatCount: 0,
    repeatRate: 0,
    avgLTV: 0,
  };

  return sendSuccessResponse(res, 200, "Customer summary fetched", stats);
});

// Typed params helpers
interface IdParam { id: string }

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/customers
// Query params: search, filter, sort, page, limit
// ═══════════════════════════════════════════════════════════════
export const getAllCustomers = asyncHandler(async (req: Request, res: Response) => {
  const {
    search = "",
    filter = "all",   // all | active | inactive | verified | unverified | repeat | high_value
    sort = "newest",  // newest | oldest | most_orders | most_spent | last_active
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // ── Build match filter ─────────────────────────────────────
  const matchFilter: Record<string, unknown> = {};

  if (search) {
    const regex = new RegExp(search, "i");
    matchFilter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { mobile: regex },
    ];
  }

  if (filter === "active")    matchFilter.isActive  = true;
  if (filter === "inactive")  matchFilter.isActive  = false;
  if (filter === "verified")  matchFilter.isVerified = true;
  if (filter === "unverified") matchFilter.isVerified = false;

  // ── Build sort ─────────────────────────────────────────────
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest:      { createdAt: -1 },
    oldest:      { createdAt: 1 },
    most_orders: { totalOrders: -1 },
    most_spent:  { totalSpent: -1 },
    last_active: { lastLogin: -1 },
  };
  const sortStage = sortMap[sort] || sortMap["newest"];

  // ── Base aggregation pipeline ──────────────────────────────
  const pipeline: mongoose.PipelineStage[] = [
    { $match: matchFilter },
    {
      $addFields: {
        totalOrders: 0,
        totalSpent: 0,
        repeatCustomer: false,
        lastOrderDate: null,
      },
    },
  ];

  // Apply post-addFields filters for repeat / high-value
  if (filter === "repeat") {
    pipeline.push({ $match: { repeatCustomer: true } });
  }
  if (filter === "high_value") {
    pipeline.push({ $match: { totalSpent: { $gte: 1000 } } });
  }

  pipeline.push(
    { $sort: sortStage },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              password: 0,
              otp: 0,
              otpExpiry: 0,
              orders: 0,
              wishlist: 0,
              orderHistory: 0,
              addresses: 0,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    }
  );

  const [result] = await Customer.aggregate(pipeline);
  const customers = result?.data || [];
  const total     = result?.total?.[0]?.count || 0;

  return sendSuccessResponse(res, 200, "Customers fetched successfully", {
    customers,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/customers/:id
// ═══════════════════════════════════════════════════════════════
export const getCustomerById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("Invalid customer ID", 400);
    }

    const oid = new mongoose.Types.ObjectId(id);

    const customer = await Customer.findById(oid)
      .select("-password -otp -otpExpiry")
      .lean();

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    const orders: any[] = [];

    const stats = {
      totalOrders: 0,
      totalSpent: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
      averageOrderValue: 0,
    };

    return sendSuccessResponse(res, 200, "Customer fetched successfully", {
      customer,
      orders,
      stats,
    });
  }
);

// ═══════════════════════════════════════════════════════════════
// PATCH /api/admin/customers/:id/status
// Toggle isActive status
// ═══════════════════════════════════════════════════════════════
export const toggleCustomerStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError("Invalid customer ID", 400);
    }

    const oid = new mongoose.Types.ObjectId(id);

    const customer = await Customer.findById(oid);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    customer.isActive = !customer.isActive;
    await customer.save({ validateModifiedOnly: true });

    return sendSuccessResponse(
      res,
      200,
      `Customer ${customer.isActive ? "activated" : "deactivated"} successfully`,
      { isActive: customer.isActive }
    );
  }
);
