import { Request, Response } from "express";
import mongoose from "mongoose";
import Cart from "../models/cart";
import Customer from "../models/customer";
import Order from "../models/order";
import AppError from "../utils/appError";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { cartService } from "../services/cartService";

// A cart untouched for this long is treated as "abandoned"
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Price of a single cart item (variant price wins over product price)
const itemPriceExpr = {
  $ifNull: [
    {
      $getField: {
        field: "price",
        input: {
          $arrayElemAt: [
            { $filter: { input: "$_variants", as: "v", cond: { $eq: ["$$v._id", "$$it.variant"] } } },
            0,
          ],
        },
      },
    },
    {
      $getField: {
        field: "price",
        input: {
          $arrayElemAt: [
            { $filter: { input: "$_products", as: "p", cond: { $eq: ["$$p._id", "$$it.product"] } } },
            0,
          ],
        },
      },
    },
    0,
  ],
};

// Stages that add itemCount / totalQuantity / cartValue / preview to each cart
const pricedCartStages: mongoose.PipelineStage[] = [
  {
    $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "_products" },
  },
  {
    $lookup: { from: "productvariants", localField: "items.variant", foreignField: "_id", as: "_variants" },
  },
  {
    $addFields: {
      itemCount: { $size: "$items" },
      totalQuantity: { $sum: "$items.quantity" },
      cartValue: {
        $sum: {
          $map: {
            input: "$items",
            as: "it",
            in: { $multiply: ["$$it.quantity", itemPriceExpr] },
          },
        },
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/carts/summary
// ═══════════════════════════════════════════════════════════════
export const getCartSummary = asyncHandler(async (_req: Request, res: Response) => {
  const abandonedBefore = new Date(Date.now() - ABANDONED_AFTER_MS);

  const [summary] = await Cart.aggregate([
    { $match: { "items.0": { $exists: true } } },
    ...pricedCartStages,
    {
      $group: {
        _id: null,
        totalCarts: { $sum: 1 },
        totalQuantity: { $sum: "$totalQuantity" },
        totalValue: { $sum: "$cartValue" },
        abandonedCarts: { $sum: { $cond: [{ $lt: ["$updatedAt", abandonedBefore] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalCarts: 1,
        totalQuantity: 1,
        totalValue: 1,
        abandonedCarts: 1,
        activeCarts: { $subtract: ["$totalCarts", "$abandonedCarts"] },
        avgCartValue: {
          $cond: [{ $gt: ["$totalCarts", 0] }, { $divide: ["$totalValue", "$totalCarts"] }, 0],
        },
      },
    },
  ]);

  return sendSuccessResponse(
    res,
    200,
    "Cart summary fetched",
    summary || {
      totalCarts: 0,
      totalQuantity: 0,
      totalValue: 0,
      abandonedCarts: 0,
      activeCarts: 0,
      avgCartValue: 0,
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/carts
// Query params: search, filter (all | active | abandoned),
//               sort (recent | oldest | highest_value | most_items), page, limit
// ═══════════════════════════════════════════════════════════════
export const getAllCarts = asyncHandler(async (req: Request, res: Response) => {
  const {
    search = "",
    filter = "all",
    sort = "recent",
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const abandonedBefore = new Date(Date.now() - ABANDONED_AFTER_MS);

  const cartMatch: Record<string, unknown> = { "items.0": { $exists: true } };
  if (filter === "active") cartMatch.updatedAt = { $gte: abandonedBefore };
  if (filter === "abandoned") cartMatch.updatedAt = { $lt: abandonedBefore };

  const pipeline: mongoose.PipelineStage[] = [
    { $match: cartMatch },
    {
      $lookup: {
        from: "customers",
        localField: "customer",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: "$customer" },
  ];

  if (search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), "i");
    pipeline.push({
      $match: {
        $or: [
          { "customer.firstName": regex },
          { "customer.lastName": regex },
          { "customer.email": regex },
          { "customer.mobile": regex },
        ],
      },
    });
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    recent: { updatedAt: -1 },
    oldest: { updatedAt: 1 },
    highest_value: { cartValue: -1 },
    most_items: { totalQuantity: -1 },
  };

  pipeline.push(...pricedCartStages, { $sort: sortMap[sort] || sortMap.recent });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limitNum },
        {
          $project: {
            _id: 1,
            itemCount: 1,
            totalQuantity: 1,
            cartValue: 1,
            createdAt: 1,
            updatedAt: 1,
            customer: {
              _id: "$customer._id",
              firstName: "$customer.firstName",
              lastName: "$customer.lastName",
              email: "$customer.email",
              mobile: "$customer.mobile",
              avatar: "$customer.avatar",
              isActive: "$customer.isActive",
              isVerified: "$customer.isVerified",
            },
            preview: {
              $slice: [
                {
                  $map: {
                    input: "$_products",
                    as: "p",
                    in: {
                      name: "$$p.productName",
                      image: { $ifNull: [{ $arrayElemAt: ["$$p.images", 0] }, "$$p.image"] },
                    },
                  },
                },
                4,
              ],
            },
          },
        },
      ],
      total: [{ $count: "count" }],
    },
  });

  const [result] = await Cart.aggregate(pipeline);
  const carts = (result?.data || []).map((c: any) => ({
    ...c,
    isAbandoned: new Date(c.updatedAt) < abandonedBefore,
  }));
  const total = result?.total?.[0]?.count || 0;

  return sendSuccessResponse(res, 200, "Carts fetched successfully", {
    carts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/carts/:customerId
// Full customer details + every cart item with product / variant details
// ═══════════════════════════════════════════════════════════════
export const getCartByCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customerId = String(req.params.customerId);

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new AppError("Invalid customer ID", 400);
  }

  const oid = new mongoose.Types.ObjectId(customerId);

  const [customer, cart, orderStats] = await Promise.all([
    Customer.findById(oid).select("-password -otp -otpExpiry -wishlist").lean(),
    Cart.findOne({ customer: oid }).lean(),
    Order.aggregate([
      { $match: { customer: oid } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: {
            $sum: { $cond: [{ $ne: ["$status", "Cancelled"] }, "$netAmount", 0] },
          },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  const items = cart?.items?.length ? await cartService.buildDetailedItems(cart.items) : [];
  const totals = cartService.computeTotals(items);
  const updatedAt = cart?.updatedAt || null;

  return sendSuccessResponse(res, 200, "Cart fetched successfully", {
    customer,
    cart: {
      _id: cart?._id || null,
      items,
      totals,
      createdAt: cart?.createdAt || null,
      updatedAt,
      isAbandoned:
        !!updatedAt && items.length > 0 && Date.now() - new Date(updatedAt).getTime() > ABANDONED_AFTER_MS,
    },
    orderStats: orderStats[0]
      ? {
          totalOrders: orderStats[0].totalOrders,
          totalSpent: orderStats[0].totalSpent,
          lastOrderAt: orderStats[0].lastOrderAt,
        }
      : { totalOrders: 0, totalSpent: 0, lastOrderAt: null },
  });
});
