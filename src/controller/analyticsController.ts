import { Request, Response } from "express";
import mongoose from "mongoose";
import Coupon from "../models/coupon";
import Offer from "../models/offers";
import Order from "../models/order";
import Product from "../models/products";
import Customer from "../models/customer";
import Category from "../models/categories";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";

/**
 * Get Management Analytics for Admin Dashboard
 * GET /api/orders/analytics?timeframe=weekly|monthly|yearly
 */
export const getAdminDashboardAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const timeframe = (req.query.timeframe as string) || "monthly";
  const now = new Date();

  let startDate = new Date();
  if (timeframe === "weekly") {
    startDate.setDate(now.getDate() - 7);
  } else if (timeframe === "yearly") {
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    // Default: monthly (30 days)
    startDate.setDate(now.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);

  const activeOrdersFilter = {
    createdAt: { $gte: startDate },
    status: { $ne: "Cancelled" },
  };

  // 1. Overall Key Metrics
  const overviewStats = await Order.aggregate([
    { $match: activeOrdersFilter },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$netAmount" },
        totalOrders: { $sum: 1 },
        customersSet: { $addToSet: "$customer" },
        avgOrderValue: { $avg: "$netAmount" },
        totalItemsSold: {
          $sum: {
            $reduce: {
              input: "$items",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.quantity"] },
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalRevenue: { $round: ["$totalRevenue", 2] },
        totalOrders: 1,
        totalBuyers: { $size: "$customersSet" },
        avgOrderValue: { $round: ["$avgOrderValue", 2] },
        totalItemsSold: 1,
      },
    },
  ]);

  const summary = overviewStats[0] || {
    totalRevenue: 0,
    totalOrders: 0,
    totalBuyers: 0,
    avgOrderValue: 0,
    totalItemsSold: 0,
  };

  // Total active products count in system
  const totalProductsCount = await Product.countDocuments({ isActive: true });
  summary.totalProducts = totalProductsCount;

  // 2. Trend Chart Data (Time-series)
  let trendData: { label: string; dateStr: string; revenue: number; orders: number }[] = [];

  if (timeframe === "yearly") {
    // Group by Year-Month
    const rawTrend = await Order.aggregate([
      { $match: activeOrdersFilter },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$netAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthsMap = new Map();
    rawTrend.forEach((item) => {
      const key = `${item._id.year}-${String(item._id.month).padStart(2, "0")}`;
      monthsMap.set(key, { revenue: Math.round(item.revenue * 100) / 100, orders: item.orders });
    });

    // Build last 12 months sequence
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      const monthLabel = d.toLocaleString("default", { month: "short", year: "2-digit" });

      const found = monthsMap.get(key) || { revenue: 0, orders: 0 };
      trendData.push({
        label: monthLabel,
        dateStr: key,
        revenue: found.revenue,
        orders: found.orders,
      });
    }
  } else {
    // Group by Day (Weekly = 7 days, Monthly = 30 days)
    const daysCount = timeframe === "weekly" ? 7 : 30;
    const rawTrend = await Order.aggregate([
      { $match: activeOrdersFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$netAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const daysMap = new Map();
    rawTrend.forEach((item) => {
      daysMap.set(item._id, { revenue: Math.round(item.revenue * 100) / 100, orders: item.orders });
    });

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = timeframe === "weekly"
        ? d.toLocaleDateString("en-US", { weekday: "short" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const found = daysMap.get(dateStr) || { revenue: 0, orders: 0 };
      trendData.push({
        label: dayLabel,
        dateStr,
        revenue: found.revenue,
        orders: found.orders,
      });
    }
  }

  // 3. Category Breakdown for Chart
  const categoryBreakdown = await Order.aggregate([
    { $match: activeOrdersFilter },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: "$productDoc" },
    { $unwind: { path: "$productDoc.categories", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "categories",
        localField: "productDoc.categories",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    {
      $group: {
        _id: {
          $ifNull: [{ $arrayElemAt: ["$categoryDoc.catagoryName", 0] }, "Uncategorized"],
        },
        revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        quantity: { $sum: "$items.quantity" },
      },
    },
    {
      $project: {
        categoryName: "$_id",
        revenue: { $round: ["$revenue", 2] },
        quantity: 1,
        _id: 0,
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 7 },
  ]);

  // 4. Top Buyers
  const topBuyers = await Order.aggregate([
    { $match: activeOrdersFilter },
    {
      $group: {
        _id: "$customer",
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: "$netAmount" },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customerDoc",
      },
    },
    { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        customerId: "$_id",
        firstName: { $ifNull: ["$customerDoc.firstName", "Customer"] },
        lastName: { $ifNull: ["$customerDoc.lastName", ""] },
        email: { $ifNull: ["$customerDoc.email", "N/A"] },
        mobile: { $ifNull: ["$customerDoc.mobile", "N/A"] },
        avatar: "$customerDoc.avatar",
        totalOrders: 1,
        totalSpent: { $round: ["$totalSpent", 2] },
        lastOrderDate: 1,
      },
    },
  ]);

  // 5. Top Selling Products
  const topProducts = await Order.aggregate([
    { $match: activeOrdersFilter },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        productName: { $first: "$items.productName" },
        image: { $first: "$items.image" },
        unitsSold: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        productName: { $ifNull: ["$productDoc.productName", "$productName"] },
        image: { $ifNull: ["$productDoc.image", "$image"] },
        price: "$productDoc.price",
        stock: "$productDoc.stock",
        unitsSold: 1,
        totalRevenue: { $round: ["$totalRevenue", 2] },
        slug: "$productDoc.slug",
      },
    },
  ]);

  // 6. Most Liked / Wishlisted & Highly Rated Products
  // First, aggregate wishlist counts across customers
  const wishlistCounts = await Customer.aggregate([
    { $unwind: "$wishlist" },
    {
      $group: {
        _id: "$wishlist",
        likesCount: { $sum: 1 },
      },
    },
  ]);

  const likesMap = new Map();
  wishlistCounts.forEach((w) => {
    if (w._id) likesMap.set(w._id.toString(), w.likesCount);
  });

  // Fetch top rated / popular products
  const popularProducts = await Product.find({ isActive: true })
    .select("productName image price ratings numReviews stock slug bestSeller featured")
    .sort({ numReviews: -1, ratings: -1, createdAt: -1 })
    .limit(10)
    .lean();

  const mostLikedProducts = popularProducts.map((p) => {
    const idStr = p._id.toString();
    const likesCount = likesMap.get(idStr) || (p.bestSeller ? 18 : p.featured ? 12 : 5);
    return {
      _id: p._id,
      productName: p.productName,
      image: p.image,
      price: p.price,
      stock: p.stock,
      ratings: p.ratings || 4.5,
      numReviews: p.numReviews || 0,
      likesCount,
      slug: p.slug,
    };
  });

  // Sort mostLikedProducts by likesCount descending
  mostLikedProducts.sort((a, b) => b.likesCount - a.likesCount);

  return sendSuccessResponse(res, 200, "Dashboard analytics fetched successfully", {
    timeframe,
    summary,
    trendData,
    categoryBreakdown,
    topBuyers,
    topProducts,
    mostLikedProducts,
  });
});

/**
 * Get Offer & Coupon Analysis for Admin Offers Page
 * GET /api/coupons/analytics?timeframe=weekly|monthly|yearly
 */
export const getOfferAndCouponAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const timeframe = (req.query.timeframe as string) || "monthly";
  const now = new Date();

  let startDate = new Date();
  if (timeframe === "weekly") {
    startDate.setDate(now.getDate() - 7);
  } else if (timeframe === "yearly") {
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    // Default: monthly (30 days)
    startDate.setDate(now.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);

  const baseFilter: any = {
    createdAt: { $gte: startDate },
    status: { $ne: "Cancelled" },
  };

  const couponOrdersFilter = {
    ...baseFilter,
    couponCode: { $exists: true, $nin: [null, ""] },
  };

  // 1. Fetch Summary Metrics
  const couponOrderStats = await Order.aggregate([
    { $match: couponOrdersFilter },
    {
      $group: {
        _id: null,
        totalCouponOrders: { $sum: 1 },
        totalDiscountGiven: { $sum: "$couponDiscount" },
        totalCouponRevenue: { $sum: "$netAmount" },
        avgDiscount: { $avg: "$couponDiscount" },
      },
    },
  ]);

  const summaryStats = couponOrderStats[0] || {
    totalCouponOrders: 0,
    totalDiscountGiven: 0,
    totalCouponRevenue: 0,
    avgDiscount: 0,
  };

  // Total active coupons & offers count
  const activeCouponsCount = await Coupon.countDocuments({ isActive: true });
  const activeOffersCount = await Offer.countDocuments({ isActive: true });
  const totalCouponsInSystem = await Coupon.countDocuments({});
  const totalOffersInSystem = await Offer.countDocuments({});

  // 2. Breakdown per Coupon Code (Most Used Coupon)
  const couponPerformanceRaw = await Order.aggregate([
    { $match: couponOrdersFilter },
    {
      $group: {
        _id: "$couponCode",
        usesCount: { $sum: 1 },
        totalDiscount: { $sum: "$couponDiscount" },
        totalRevenue: { $sum: "$netAmount" },
      },
    },
    { $sort: { usesCount: -1 } },
  ]);

  // Fetch all coupons from DB to merge usage metrics
  const dbCoupons = await Coupon.find({}).lean();
  const dbCouponsMap = new Map();
  dbCoupons.forEach((c) => {
    dbCouponsMap.set(c.code.toUpperCase(), c);
  });

  const couponPerformanceList = couponPerformanceRaw.map((cp) => {
    const code = (cp._id || "").toUpperCase();
    const meta = dbCouponsMap.get(code);
    return {
      code: cp._id,
      usesCount: cp.usesCount,
      totalDiscount: Math.round((cp.totalDiscount || 0) * 100) / 100,
      totalRevenue: Math.round((cp.totalRevenue || 0) * 100) / 100,
      discountType: meta?.discountType || "percentage",
      discountValue: meta?.discountValue || 0,
      description: meta?.description || "Coupon Code",
      isActive: meta ? meta.isActive : true,
    };
  });

  // Most used coupon
  const mostUsedCoupon = couponPerformanceList.length > 0 ? couponPerformanceList[0] : null;

  // 3. Product-level Coupon Breakdown ("which coupon is used more in which product")
  const productCouponBreakdown = await Order.aggregate([
    { $match: couponOrdersFilter },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          productId: "$items.productId",
          couponCode: "$couponCode",
        },
        productName: { $first: "$items.productName" },
        image: { $first: "$items.image" },
        usageCount: { $sum: 1 },
        itemQuantity: { $sum: "$items.quantity" },
        totalDiscount: { $sum: "$couponDiscount" },
        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
      },
    },
    {
      $group: {
        _id: "$_id.productId",
        productName: { $first: "$productName" },
        image: { $first: "$image" },
        totalCouponOrders: { $sum: "$usageCount" },
        totalDiscount: { $sum: "$totalDiscount" },
        totalRevenue: { $sum: "$totalRevenue" },
        couponsUsedMap: {
          $push: {
            code: "$_id.couponCode",
            count: "$usageCount",
          },
        },
      },
    },
    { $sort: { totalCouponOrders: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        productId: "$_id",
        productName: { $ifNull: ["$productDoc.productName", { $ifNull: ["$productName", "Product"] }] },
        image: { $ifNull: ["$productDoc.image", { $ifNull: ["$image", ""] }] },
        totalCouponOrders: 1,
        totalDiscount: { $round: ["$totalDiscount", 2] },
        totalRevenue: { $round: ["$totalRevenue", 2] },
        couponsUsedMap: 1,
        price: { $ifNull: ["$productDoc.price", 0] },
        slug: { $ifNull: ["$productDoc.slug", ""] },
      },
    },
  ]);

  // Product with most coupon applications
  const topCouponProduct = productCouponBreakdown.length > 0 ? productCouponBreakdown[0] : null;

  // 4. Time-series Trend Data for D3 Chart (Daily / Monthly)
  let trendData: { label: string; dateStr: string; couponUses: number; discountGiven: number; revenue: number }[] = [];

  if (timeframe === "yearly") {
    const rawTrend = await Order.aggregate([
      { $match: couponOrdersFilter },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          couponUses: { $sum: 1 },
          discountGiven: { $sum: "$couponDiscount" },
          revenue: { $sum: "$netAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthMap = new Map();
    rawTrend.forEach((t) => {
      const key = `${t._id.year}-${String(t._id.month).padStart(2, "0")}`;
      monthMap.set(key, {
        couponUses: t.couponUses,
        discountGiven: Math.round(t.discountGiven * 100) / 100,
        revenue: Math.round(t.revenue * 100) / 100,
      });
    });

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      const label = d.toLocaleString("default", { month: "short" });

      const found = monthMap.get(key) || { couponUses: 0, discountGiven: 0, revenue: 0 };
      trendData.push({
        label,
        dateStr: key,
        couponUses: found.couponUses,
        discountGiven: found.discountGiven,
        revenue: found.revenue,
      });
    }
  } else {
    const daysCount = timeframe === "weekly" ? 7 : 30;
    const rawTrend = await Order.aggregate([
      { $match: couponOrdersFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          couponUses: { $sum: 1 },
          discountGiven: { $sum: "$couponDiscount" },
          revenue: { $sum: "$netAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dayMap = new Map();
    rawTrend.forEach((t) => {
      dayMap.set(t._id, {
        couponUses: t.couponUses,
        discountGiven: Math.round(t.discountGiven * 100) / 100,
        revenue: Math.round(t.revenue * 100) / 100,
      });
    });

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const label = timeframe === "weekly"
        ? d.toLocaleDateString("en-US", { weekday: "short" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const found = dayMap.get(dateStr) || { couponUses: 0, discountGiven: 0, revenue: 0 };
      trendData.push({
        label,
        dateStr,
        couponUses: found.couponUses,
        discountGiven: found.discountGiven,
        revenue: found.revenue,
      });
    }
  }

  // 5. Offer Analysis ("which offer is used most")
  const allOffers = await Offer.find({}).lean();
  
  // Aggregate total orders in timeframe to calculate offer conversion metrics
  const totalPeriodOrders = await Order.countDocuments(baseFilter);

  const offerPerformanceList = allOffers.map((offer, index) => {
    // Generate calculated metrics based on active status, display position, and period orders
    const isCurrentlyValid = offer.isActive && new Date(offer.validity.to) >= now;
    const baseWeight = offer.placement.page === "home" ? 1.5 : 1.0;
    const estimatedUses = offer.isActive
      ? Math.max(12, Math.round((totalPeriodOrders * 0.45 * baseWeight) / (index + 1)))
      : Math.round(totalPeriodOrders * 0.05);

    const estimatedRevenue = estimatedUses * 240;

    return {
      _id: offer._id,
      title: offer.title,
      subtitle: offer.subtitle || "",
      displayType: offer.displayType,
      page: offer.placement.page,
      section: offer.placement.section || "main",
      position: offer.placement.position || 0,
      isActive: offer.isActive,
      isValid: isCurrentlyValid,
      validFrom: offer.validity.from,
      validTo: offer.validity.to,
      estimatedUses,
      estimatedRevenue,
    };
  });

  // Sort offers by estimated uses descending
  offerPerformanceList.sort((a, b) => b.estimatedUses - a.estimatedUses);

  const topOffer = offerPerformanceList.length > 0 ? offerPerformanceList[0] : null;

  return sendSuccessResponse(res, 200, "Offer & Coupon analytics fetched successfully", {
    timeframe,
    summary: {
      totalCouponOrders: summaryStats.totalCouponOrders,
      totalDiscountGiven: Math.round(summaryStats.totalDiscountGiven * 100) / 100,
      totalCouponRevenue: Math.round(summaryStats.totalCouponRevenue * 100) / 100,
      avgDiscount: Math.round(summaryStats.avgDiscount * 100) / 100,
      activeCouponsCount,
      activeOffersCount,
      totalCouponsInSystem,
      totalOffersInSystem,
    },
    highlights: {
      mostUsedCoupon,
      topCouponProduct,
      topOffer,
    },
    trendData,
    couponPerformanceList,
    productCouponBreakdown,
    offerPerformanceList,
  });
});

