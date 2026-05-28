import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/customer";
import Order from "../models/order";
import AppError from "../utils/appError";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/customers
// Query params: search, filter, sort, page, limit
// ═══════════════════════════════════════════════════════════════
export const getAllCustomers = asyncHandler(async (req: Request, res: Response) => {
  const {
    search = "",
    filter = "all",   // all | active | inactive | verified | unverified
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

  if (filter === "active") matchFilter.isActive = true;
  if (filter === "inactive") matchFilter.isActive = false;
  if (filter === "verified") matchFilter.isVerified = true;
  if (filter === "unverified") matchFilter.isVerified = false;

  // ── Build sort ─────────────────────────────────────────────
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    most_orders: { totalOrders: -1 },
    most_spent: { totalSpent: -1 },
    last_active: { lastLogin: -1 },
  };
  const sortStage = sortMap[sort] || sortMap["newest"];

  // ── Aggregate with order stats ─────────────────────────────
  const pipeline: mongoose.PipelineStage[] = [
    { $match: matchFilter },
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
        totalOrders: { $size: "$orders" },
        totalSpent: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$orders",
                  as: "o",
                  cond: { $ne: ["$$o.orderStatus", "cancelled"] },
                },
              },
              as: "o",
              in: "$$o.totalAmount",
            },
          },
        },
        repeatCustomer: { $gt: [{ $size: "$orders" }, 1] },
        lastOrderDate: { $max: "$orders.createdAt" },
      },
    },
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
    },
  ];

  // Apply filter for repeat/high-value customers
  if (filter === "repeat") {
    pipeline.splice(1, 0, { $match: {} }); // placeholder
    // Insert after $addFields
    const afterLookupIdx = pipeline.findIndex(
      (s) => "$addFields" in s
    );
    pipeline.splice(afterLookupIdx + 1, 0, {
      $match: { repeatCustomer: true },
    });
  }
  if (filter === "high_value") {
    const afterLookupIdx = pipeline.findIndex(
      (s) => "$addFields" in s
    );
    pipeline.splice(afterLookupIdx + 1, 0, {
      $match: { totalSpent: { $gte: 1000 } },
    });
  }

  const [result] = await Customer.aggregate(pipeline);
  const customers = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

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
export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid customer ID", 400);
  }

  const customer = await Customer.findById(id)
    .select("-password -otp -otpExpiry")
    .lean();

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  // Fetch all orders for this customer
  const orders = await Order.find({ customerId: id })
    .sort({ createdAt: -1 })
    .select("orderId totalAmount orderStatus paymentStatus paymentMethod createdAt products subTotal discount shippingCost")
    .lean();

  const totalSpent = orders
    .filter((o) => o.orderStatus !== "cancelled")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const stats = {
    totalOrders: orders.length,
    totalSpent,
    completedOrders: orders.filter((o) => o.orderStatus === "delivered").length,
    cancelledOrders: orders.filter((o) => o.orderStatus === "cancelled").length,
    pendingOrders: orders.filter(
      (o) => !["delivered", "cancelled"].includes(o.orderStatus)
    ).length,
    averageOrderValue: orders.length
      ? parseFloat((totalSpent / orders.length).toFixed(2))
      : 0,
  };

  return sendSuccessResponse(res, 200, "Customer fetched successfully", {
    customer,
    orders,
    stats,
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/admin/customers/:id/status
// Toggle isActive status
// ═══════════════════════════════════════════════════════════════
export const toggleCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid customer ID", 400);
  }

  const customer = await Customer.findById(id);
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
});
