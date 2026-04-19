import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { orderService } from "../services/orderService";
import { sendSuccessResponse, sendErrorResponse } from "../utils/apiResponse";

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

  // Validate each item
  for (const item of items) {
    if (!item.productId || !item.quantity || item.quantity < 1) {
      return sendErrorResponse(res, 400, "Each item must have a productId and quantity >= 1");
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
  const orders = await orderService.getCustomerOrders(customerId);
  return sendSuccessResponse(res, 200, "Orders fetched successfully", orders);
});

/**
 * Get Customer's Single Order Detail
 * GET /api/customer/orders/:id
 */
export const getMyOrderById = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const order = await orderService.getCustomerOrderById(req.params.id as string, customerId);
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
  const order = await orderService.getOrderById(req.params.id as string);
  return sendSuccessResponse(res, 200, "Order fetched successfully", order);
});

/**
 * Update Order Status (Admin)
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { orderStatus, paymentStatus } = req.body;

  if (!orderStatus) {
    return sendErrorResponse(res, 400, "orderStatus is required");
  }

  const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(orderStatus)) {
    return sendErrorResponse(res, 400, `Invalid order status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const order = await orderService.updateOrderStatus(req.params.id as string, orderStatus, paymentStatus);
  return sendSuccessResponse(res, 200, "Order status updated successfully", order);
});
