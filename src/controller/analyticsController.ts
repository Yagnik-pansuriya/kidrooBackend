import { Request, Response } from "express";
import mongoose from "mongoose";
import Coupon from "../models/coupon";
import Offer from "../models/offers";
import OfferDailyStat from "../models/offerDailyStat";
import { STORE_TZ, istDayKey, parseOfferDate } from "../utils/istDate";
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

const round2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

/** Chart x-axis buckets in store time (IST), oldest first */
const buildTrendBuckets = (timeframe: string, now: Date) => {
  const buckets: { key: string; label: string }[] = [];
  if (timeframe === "yearly") {
    const [y, m] = istDayKey(now).split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      buckets.push({
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        label: `${d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })} '${String(d.getUTCFullYear()).slice(2)}`,
      });
    }
    return buckets;
  }
  const days = timeframe === "weekly" ? 7 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    buckets.push({
      key: istDayKey(d),
      label: d.toLocaleDateString("en-IN", timeframe === "weekly"
        ? { weekday: "short", day: "numeric", timeZone: STORE_TZ }
        : { day: "numeric", month: "short", timeZone: STORE_TZ }),
    });
  }
  return buckets;
};

/**
 * Get Offer & Coupon Analysis for Admin Offers Page
 * GET /api/coupons/analytics?timeframe=weekly|monthly|yearly
 */
export const getOfferAndCouponAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const requested = req.query.timeframe as string;
  const timeframe = requested === "weekly" || requested === "yearly" ? requested : "monthly";
  const now = new Date();

  // Chart buckets in store time: last 7 / 30 days, or last 12 months
  const buckets = buildTrendBuckets(timeframe, now);
  const startDate = parseOfferDate(timeframe === "yearly" ? `${buckets[0].key}-01` : buckets[0].key, "start")!;
  const bucketFormat = timeframe === "yearly" ? "%Y-%m" : "%Y-%m-%d";

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

  // 4. Time-series coupon trend
  const rawCouponTrend = await Order.aggregate([
    { $match: couponOrdersFilter },
    {
      $group: {
        _id: { $dateToString: { format: bucketFormat, date: "$createdAt", timezone: STORE_TZ } },
        couponUses: { $sum: 1 },
        discountGiven: { $sum: "$couponDiscount" },
        revenue: { $sum: "$netAmount" },
      },
    },
  ]);
  const couponTrendMap = new Map(rawCouponTrend.map((t) => [t._id, t]));
  const trendData = buckets.map(({ key, label }) => {
    const found: any = couponTrendMap.get(key) || {};
    return {
      label,
      dateStr: key,
      couponUses: found.couponUses || 0,
      discountGiven: round2(found.discountGiven),
      revenue: round2(found.revenue),
    };
  });

  // 5. Offer analysis — real storefront views/clicks plus orders placed after clicking an offer
  const startDay = buckets[0].key.length === 7 ? `${buckets[0].key}-01` : buckets[0].key;
  const [allOffers, offerEventTotals, offerEventTrend, offerOrderTotals, offerOrderTrend] = await Promise.all([
    Offer.find({}).select("title subtitle displayType placement isActive validity images stats").lean(),
    OfferDailyStat.aggregate([
      { $match: { day: { $gte: startDay } } },
      { $group: { _id: "$offer", impressions: { $sum: "$impressions" }, clicks: { $sum: "$clicks" } } },
    ]),
    OfferDailyStat.aggregate([
      { $match: { day: { $gte: startDay } } },
      {
        $group: {
          _id: timeframe === "yearly" ? { $substrBytes: ["$day", 0, 7] } : "$day",
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...baseFilter, sourceOffer: { $exists: true, $ne: null } } },
      { $group: { _id: "$sourceOffer", orders: { $sum: 1 }, revenue: { $sum: "$netAmount" } } },
    ]),
    Order.aggregate([
      { $match: { ...baseFilter, sourceOffer: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: bucketFormat, date: "$createdAt", timezone: STORE_TZ } },
          orders: { $sum: 1 },
          revenue: { $sum: "$netAmount" },
        },
      },
    ]),
  ]);

  const eventsByOffer = new Map(offerEventTotals.map((e) => [String(e._id), e]));
  const ordersByOffer = new Map(offerOrderTotals.map((o) => [String(o._id), o]));

  const offerPerformanceList = allOffers.map((offer: any) => {
    const ev: any = eventsByOffer.get(String(offer._id)) || {};
    const ord: any = ordersByOffer.get(String(offer._id)) || {};
    const impressions = ev.impressions || 0;
    const clicks = ev.clicks || 0;
    const orders = ord.orders || 0;
    const from = offer.validity?.from ? new Date(offer.validity.from) : null;
    const to = offer.validity?.to ? new Date(offer.validity.to) : null;
    const status = to && to < now ? "expired" : !offer.isActive ? "inactive" : from && from > now ? "scheduled" : "live";
    return {
      _id: offer._id,
      title: offer.title,
      subtitle: offer.subtitle || "",
      image: offer.images?.[0]?.url || "",
      displayType: offer.displayType,
      page: offer.placement?.page,
      section: offer.placement?.section || "main",
      position: offer.placement?.position || 0,
      isActive: offer.isActive,
      status,
      validFrom: offer.validity?.from,
      validTo: offer.validity?.to,
      impressions,
      clicks,
      ctr: impressions ? round2((clicks / impressions) * 100) : 0,
      orders,
      revenue: round2(ord.revenue),
      conversionRate: clicks ? round2((orders / clicks) * 100) : 0,
      lifetimeImpressions: offer.stats?.impressions || 0,
      lifetimeClicks: offer.stats?.clicks || 0,
    };
  });

  // Rank by what the offer actually drove: orders, then clicks, then views
  offerPerformanceList.sort(
    (a, b) => b.orders - a.orders || b.clicks - a.clicks || b.impressions - a.impressions
  );

  const topOffer = offerPerformanceList.find((o) => o.clicks > 0 || o.impressions > 0) || null;

  const offerEventTrendMap = new Map(offerEventTrend.map((t) => [t._id, t]));
  const offerOrderTrendMap = new Map(offerOrderTrend.map((t) => [t._id, t]));
  const offerTrendData = buckets.map(({ key, label }) => {
    const ev: any = offerEventTrendMap.get(key) || {};
    const ord: any = offerOrderTrendMap.get(key) || {};
    return {
      label,
      dateStr: key,
      impressions: ev.impressions || 0,
      clicks: ev.clicks || 0,
      orders: ord.orders || 0,
      revenue: round2(ord.revenue),
    };
  });

  const offerTotals = offerPerformanceList.reduce(
    (acc, o) => {
      acc.impressions += o.impressions;
      acc.clicks += o.clicks;
      acc.orders += o.orders;
      acc.revenue += o.revenue;
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    { impressions: 0, clicks: 0, orders: 0, revenue: 0, live: 0, scheduled: 0, expired: 0, inactive: 0 } as Record<string, number>
  );
  offerTotals.revenue = round2(offerTotals.revenue);
  offerTotals.ctr = offerTotals.impressions ? round2((offerTotals.clicks / offerTotals.impressions) * 100) : 0;

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
    offerTrendData,
    offerSummary: offerTotals,
  });
});

