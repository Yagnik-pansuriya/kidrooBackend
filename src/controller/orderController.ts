import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { orderService } from "../services/orderService";
import { sendSuccessResponse, sendErrorResponse, sendPaginatedResponse } from "../utils/apiResponse";
import mongoose from "mongoose";

// ═══════════════════════════════════════════════════════════════
//  CUSTOMER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Create Order (Online Payment or COD)
 * POST /api/customer/orders
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { items, paymentMethod, shippingAddress } = req.body;

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    return sendErrorResponse(res, 400, "Order must contain at least one item");
  }
  if (!paymentMethod || !["online", "cod"].includes(paymentMethod)) {
    return sendErrorResponse(res, 400, "Invalid payment method. Must be 'online' or 'cod'");
  }
  if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
    return sendErrorResponse(res, 400, "Complete shipping address is required");
  }

  // MED-4 FIX: Validate each item with ObjectId check + quantity cap
  for (const item of items) {
    if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
      return sendErrorResponse(res, 400, `Invalid productId: "${item.productId}". Must be a valid ID.`);
    }
    if (item.variantId && !mongoose.isValidObjectId(item.variantId)) {
      return sendErrorResponse(res, 400, `Invalid variantId: "${item.variantId}". Must be a valid ID.`);
    }
    if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
      return sendErrorResponse(res, 400, "Each item must have a numeric quantity >= 1");
    }
    if (item.quantity > 100) {
      return sendErrorResponse(res, 400, "Maximum 100 units per item per order");
    }
  }

  const result = await orderService.createOrder({
    customerId,
    items,
    paymentMethod,
    shippingAddress,
  });

  if (paymentMethod === "online") {
    return sendSuccessResponse(res, 201, "Order created. Complete payment to confirm.", {
      order: result.order,
      razorpayOrderId: result.razorpayOrderId,
      razorpayKeyId: result.razorpayKeyId,
      amount: result.amount,
    });
  }

  return sendSuccessResponse(res, 201, "Order placed successfully!", { order: result.order });
});

/**
 * Verify Razorpay Payment
 * POST /api/customer/orders/verify-payment
 */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    return sendErrorResponse(res, 400, "All payment verification fields are required");
  }

  // MED-10 FIX: Validate orderId as a valid MongoDB ObjectId
  if (!mongoose.isValidObjectId(orderId)) {
    return sendErrorResponse(res, 400, "Invalid order ID format");
  }

  const order = await orderService.verifyAndCompletePayment({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderId,
  });

  return sendSuccessResponse(res, 200, "Payment verified successfully!", { order });
});

/**
 * Get Customer's Orders
 * GET /api/customer/orders
 */
export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  // MED-2 FIX: Paginated query. sendPaginatedResponse keeps `data` as the array
  // (backward-compatible with frontend) and adds `pagination` as a sibling key.
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const result = await orderService.getCustomerOrders(customerId, page, limit);
  return sendPaginatedResponse(res, 200, "Orders fetched successfully", result.orders, result.pagination);
});

/**
 * Get Customer's Single Order Detail
 * GET /api/customer/orders/:id
 */
export const getMyOrderById = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const orderId = req.params.id as string;
  // Basic ObjectId validation
  if (!mongoose.isValidObjectId(orderId)) {
    return sendErrorResponse(res, 400, "Invalid order ID format");
  }
  const order = await orderService.getCustomerOrderById(orderId, customerId);
  return sendSuccessResponse(res, 200, "Order fetched successfully", order);
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Get All Orders (Admin)
 * GET /api/orders
 */
export const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, paymentStatus, paymentMethod, search, page, limit } = req.query;

  const result = await orderService.getAllOrders({
    status: status as string,
    paymentStatus: paymentStatus as string,
    paymentMethod: paymentMethod as string,
    search: search as string,
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 20,
  });

  return sendSuccessResponse(res, 200, "Orders fetched successfully", result.orders, undefined);
});

/**
 * Get Single Order Detail (Admin)
 * GET /api/orders/:id
 */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  // MED-7 FIX: Validate ObjectId format before DB query to avoid CastError 500
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendErrorResponse(res, 400, "Invalid order ID format");
  }
  const order = await orderService.getOrderById(req.params.id as string);
  return sendSuccessResponse(res, 200, "Order fetched successfully", order);
});

/**
 * Update Order Status (Admin)
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  // MED-7 FIX: Validate ObjectId
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendErrorResponse(res, 400, "Invalid order ID format");
  }

  const { orderStatus, paymentStatus } = req.body;

  if (!orderStatus) {
    return sendErrorResponse(res, 400, "orderStatus is required");
  }

  const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(orderStatus)) {
    return sendErrorResponse(res, 400, `Invalid order status. Must be one of: ${validStatuses.join(", ")}`);
  }

  // HIGH-3 FIX: Validate paymentStatus with enum + business logic
  const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
  if (paymentStatus !== undefined) {
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return sendErrorResponse(
        res,
        400,
        `Invalid payment status. Must be one of: ${validPaymentStatuses.join(", ")}`
      );
    }
    // Business rule: can only mark as refunded if currently paid
    if (paymentStatus === "refunded") {
      const existingOrder = await orderService.getOrderById(req.params.id as string);
      if (existingOrder.paymentStatus !== "paid") {
        return sendErrorResponse(res, 400, "Can only refund orders that have been paid");
      }
    }
  }

  const order = await orderService.updateOrderStatus(req.params.id as string, orderStatus, paymentStatus);
  return sendSuccessResponse(res, 200, "Order status updated successfully", order);
});
