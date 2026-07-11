import { Request, Response } from "express";
import crypto from "crypto";
import Order from "../models/order";
import Product from "../models/products";
import ProductVariant from "../models/variants";
import Customer from "../models/customer";
import { inventoryService } from "../services/inventoryService";
import { couponService } from "../services/couponService";
import { shiprocketService } from "../services/shiprocketService";
import { sendWhatsAppOrderConfirmed, sendWhatsAppOrderStatus } from "../services/msg91WhatsappService";
import { getRazorpayInstance } from "../config/razorpay";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";

// ═══════════════════════════════════════════════════════════════
// CUSTOMER CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check delivery charges and ETD using pincode (Courier Serviceability)
 * GET /api/customer/orders/shipping-estimate?pincode=123456&weight=0.5&cod=false
 */
export const getShippingEstimate = asyncHandler(async (req: Request, res: Response) => {
  const pincode = req.query.pincode as string;
  const weight = Number(req.query.weight || 0.5);
  const cod = req.query.cod === "true";

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    throw new AppError("A valid 6-digit PIN code is required", 400);
  }

  const carriers = await shiprocketService.checkServiceability(pincode, weight, cod);
  if (carriers.length === 0) {
    throw new AppError("No delivery options available for this PIN code", 404);
  }

  // Find the cheapest carrier option
  const cheapest = carriers.reduce((prev, curr) => (prev.rate < curr.rate ? prev : curr));

  return sendSuccessResponse(res, 200, "Shipping estimate fetched successfully", {
    cheapestCarrier: cheapest.courier_name,
    shippingCost: cheapest.rate + (cod ? cheapest.cod : 0),
    estimatedDelivery: cheapest.etd,
    allCarriers: carriers,
  });
});

/**
 * Place a new Order (Customer checkout)
 * POST /api/customer/orders
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { items, paymentMethod, shippingAddress, couponCode } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError("No products provided for order", 400);
  }

  if (!shippingAddress || !shippingAddress.zipCode) {
    throw new AppError("Shipping address with ZIP code is required", 400);
  }

  // 1. Fetch products & variants, validate stock, and calculate subtotal
  let totalItemsPrice = 0;
  const orderItems: any[] = [];
  const stockToDeduct: { model: "Product" | "ProductVariant"; id: string; qty: number }[] = [];

  for (const item of items) {
    const { productId, variantId, quantity } = item;

    if (!productId || quantity <= 0) {
      throw new AppError("Invalid product reference or quantity", 400);
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      throw new AppError(`Product not found or inactive: ${productId}`, 404);
    }

    let unitPrice = product.price;
    let name = product.productName;
    let sku = product.skuCode || product.productCode;
    let img = product.image;

    // Check variant if provided
    if (variantId) {
      const variant = await ProductVariant.findById(variantId);
      if (!variant || variant.status !== "active") {
        throw new AppError(`Variant not found or inactive: ${variantId}`, 404);
      }
      if (variant.product.toString() !== productId) {
        throw new AppError("Variant does not match the product", 400);
      }
      unitPrice = variant.price;
      sku = variant.sku;
      if (variant.images && variant.images.length > 0) {
        img = variant.images[0];
      }
      
      // Stock check
      if (variant.stock < quantity) {
        throw new AppError(`Insufficient stock for variant ${sku}. Available: ${variant.stock}`, 400);
      }
      stockToDeduct.push({ model: "ProductVariant", id: variantId, qty: quantity });
    } else {
      // Stock check on parent product
      if (product.stock < quantity) {
        throw new AppError(`Insufficient stock for product ${name}. Available: ${product.stock}`, 400);
      }
      stockToDeduct.push({ model: "Product", id: productId, qty: quantity });
    }

    totalItemsPrice += unitPrice * quantity;
    orderItems.push({
      productId,
      variantId,
      quantity,
      price: unitPrice,
      productName: name,
      skuCode: sku,
      image: img,
    });
  }

  // 2. Query courier serviceability to find exact shipping charges
  let shippingCharges = 50; // Default flat fallback
  try {
    const carriers = await shiprocketService.checkServiceability(
      shippingAddress.zipCode,
      0.5 * orderItems.length,
      paymentMethod === "cod"
    );
    if (carriers.length > 0) {
      const cheapest = carriers.reduce((prev, curr) => (prev.rate < curr.rate ? prev : curr));
      shippingCharges = cheapest.rate + (paymentMethod === "cod" ? cheapest.cod : 0);
    }
  } catch (err) {
    console.warn("[OrderController] Shiprocket serviceability error, using flat shipping.");
  }

  // 3. Handle coupon validation & calculations
  let couponDiscount = 0;
  let validatedCoupon: any = null;

  if (couponCode) {
    const validationResult = await couponService.validateCoupon(
      couponCode,
      customerId,
      orderItems.map((item) => ({
        productId: item.productId.toString(),
        quantity: item.quantity,
        price: item.price,
      }))
    );

    if (validationResult.valid) {
      couponDiscount = validationResult.discount;
      validatedCoupon = validationResult;
    } else {
      throw new AppError(validationResult.message || "Invalid coupon code", 400);
    }
  }

  const netAmount = Math.max(0, totalItemsPrice + shippingCharges - couponDiscount);

  // 4. Deduct stock atomically
  for (const deduct of stockToDeduct) {
    await inventoryService.deductStock(deduct.model, deduct.id, deduct.qty, "ORDER_PLACE", "Stock deducted during checkout");
  }

  // Generate unique Order ID
  const orderId = `KDR-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  // 5. Razorpay integration for online payment
  let razorpayOrderId = "";
  let razorpayKeyId = "";

  if (paymentMethod === "online" && netAmount > 0) {
    try {
      const razorpay = getRazorpayInstance();
      const options = {
        amount: Math.round(netAmount * 100), // in paise
        currency: "INR",
        receipt: orderId,
      };
      const razorpayOrder = await razorpay.orders.create(options);
      razorpayOrderId = razorpayOrder.id;
      razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
    } catch (err: any) {
      // Restore stock on payment gateway setup failure
      for (const deduct of stockToDeduct) {
        await inventoryService.addStock(deduct.model, deduct.id, deduct.qty, "RETURN", "Stock restored due to payment setup error");
      }
      throw new AppError(`Failed to initialize payment gateway: ${err.message}`, 500);
    }
  }

  // 6. Create the order in database
  const order = await Order.create({
    orderId,
    customer: customerId,
    items: orderItems,
    totalItemsPrice,
    shippingCharges,
    couponCode: validatedCoupon ? validatedCoupon.couponCode : undefined,
    couponDiscount,
    netAmount,
    paymentMethod,
    paymentStatus: paymentMethod === "cod" ? "Pending" : "Pending", // Pending verification for online
    status: "Pending",
    shippingAddress,
    razorpayOrderId,
  });

  // Apply Coupon usage count in DB if applicable
  if (validatedCoupon && validatedCoupon.couponId) {
    await couponService.applyCoupon(validatedCoupon.couponId, customerId);
  }

  // Trigger WhatsApp for COD immediately
  if (paymentMethod === "cod") {
    try {
      const customerDoc = await Customer.findById(customerId);
      if (customerDoc) {
        sendWhatsAppOrderConfirmed(
          `${customerDoc.firstName} ${customerDoc.lastName}`,
          customerDoc.mobile,
          orderId,
          netAmount,
          "cod"
        );
      }
    } catch (whatsappErr) {
      console.error("[WhatsApp] Error sending confirmation:", whatsappErr);
    }
  }

  return sendSuccessResponse(res, 201, "Order placed successfully", {
    order,
    razorpayOrderId,
    razorpayKeyId,
  });
});

/**
 * Verify online payment and update order
 * POST /api/customer/orders/verify-payment
 */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    throw new AppError("All payment verification parameters are required", 400);
  }

  // Verify HMAC signature
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error("Razorpay secret key is not configured on server.");
  }

  const hmac = crypto.createHmac("sha256", keySecret);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generatedSignature = hmac.digest("hex");

  if (generatedSignature !== razorpay_signature) {
    // Update order status to failed
    await Order.findByIdAndUpdate(orderId, { paymentStatus: "Failed" });
    throw new AppError("Payment verification failed. Invalid signature.", 400);
  }

  // Update order status to Paid
  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      paymentStatus: "Paid",
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    },
    { new: true }
  );

  if (!order) {
    throw new AppError("Order not found during payment verification", 404);
  }

  // Send Whatsapp notification
  try {
    const customerDoc = await Customer.findById(order.customer);
    if (customerDoc) {
      sendWhatsAppOrderConfirmed(
        `${customerDoc.firstName} ${customerDoc.lastName}`,
        customerDoc.mobile,
        order.orderId,
        order.netAmount,
        "online"
      );
    }
  } catch (whatsappErr) {
    console.error("[WhatsApp] Error sending payment confirmation:", whatsappErr);
  }

  return sendSuccessResponse(res, 200, "Payment verified successfully", order);
});

/**
 * Get logged-in customer's order history
 * GET /api/customer/orders
 */
export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const orders = await Order.find({ customer: customerId }).sort({ createdAt: -1 });
  return sendSuccessResponse(res, 200, "Orders fetched successfully", orders);
});

/**
 * Get detailed customer order with live tracking
 * GET /api/customer/orders/:id
 */
export const getMyOrderById = asyncHandler(async (req: Request, res: Response) => {
  const customerId = (req as any).customerId;
  const { id } = req.params;

  const order = await Order.findOne({ _id: id, customer: customerId }).populate("items.productId", "productName slug image");
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  let trackingInfo = null;
  if (order.shiprocketAwbNumber) {
    trackingInfo = await shiprocketService.trackShipment(order.shiprocketAwbNumber);
  }

  return sendSuccessResponse(res, 200, "Order details fetched successfully", {
    order,
    tracking: trackingInfo,
  });
});


// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all orders for Admin dashboard
 * GET /api/orders
 */
export const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, paymentStatus, paymentMethod, search, page = "1", limit = "10" } = req.query;

  const filter: any = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (paymentMethod) filter.paymentMethod = paymentMethod;

  // Search by orderId or shippingAddress full name
  if (search && (search as string).trim()) {
    const s = (search as string).trim();
    filter.$or = [
      { orderId: new RegExp(s, "i") },
      { "shippingAddress.fullName": new RegExp(s, "i") },
      { "shippingAddress.phone": new RegExp(s, "i") },
    ];
  }

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .populate("customer", "firstName lastName email mobile")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  return sendSuccessResponse(res, 200, "Admin orders fetched successfully", {
    orders,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Get order details for Admin
 * GET /api/orders/:id
 */
export const getAdminOrderById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const order = await Order.findById(id)
    .populate("customer", "firstName lastName email mobile")
    .populate("items.productId", "productName slug image");

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  let trackingInfo = null;
  if (order.shiprocketAwbNumber) {
    trackingInfo = await shiprocketService.trackShipment(order.shiprocketAwbNumber);
  }

  return sendSuccessResponse(res, 200, "Order details fetched successfully", {
    order,
    tracking: trackingInfo,
  });
});

/**
 * Update order status manually
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, paymentStatus } = req.body;

  const updateFields: any = {};
  if (status) updateFields.status = status;
  if (paymentStatus) updateFields.paymentStatus = paymentStatus;

  const order = await Order.findByIdAndUpdate(id, updateFields, { new: true });
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // Notify customer of status change
  try {
    const customerDoc = await Customer.findById(order.customer);
    if (customerDoc && status) {
      sendWhatsAppOrderStatus(
        `${customerDoc.firstName} ${customerDoc.lastName}`,
        customerDoc.mobile,
        order.orderId,
        status
      );
    }
  } catch (whatsappErr) {
    console.error("[WhatsApp] Error sending status update:", whatsappErr);
  }

  return sendSuccessResponse(res, 200, "Order status updated successfully", order);
});

/**
 * Confirm and initiate Shiprocket booking (Full automation pipeline)
 * POST /api/orders/:id/confirm
 */
export const adminConfirmOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const order = await Order.findById(id).populate("customer", "firstName lastName email mobile");
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.status !== "Pending") {
    throw new AppError(`Order cannot be confirmed because it is already in ${order.status} state`, 400);
  }

  const customerDoc = order.customer as any;
  if (!customerDoc) {
    throw new AppError("Associated customer not found", 404);
  }

  // 1. Call Shiprocket Create Order API
  const itemsPayload = order.items.map((item) => ({
    name: item.productName,
    sku: item.skuCode || `KDR-PROD-${item.productId.toString().slice(-4)}`,
    units: item.quantity,
    selling_price: item.price,
  }));

  const shiprocketOrderData = {
    order_id: order.orderId,
    order_date: new Date(order.createdAt).toISOString().replace("T", " ").slice(0, 19),
    billing_customer_name: customerDoc.firstName,
    billing_last_name: customerDoc.lastName,
    billing_address: `${order.shippingAddress.houseNo || ""} ${order.shippingAddress.street}`.trim(),
    billing_city: order.shippingAddress.city,
    billing_pincode: order.shippingAddress.zipCode,
    billing_state: order.shippingAddress.state,
    billing_country: order.shippingAddress.country || "India",
    billing_email: customerDoc.email || "support@kidrootoys.co",
    billing_phone: customerDoc.mobile,
    shipping_is_billing: true,
    order_items: itemsPayload,
    payment_method: order.paymentMethod === "cod" ? ("COD" as const) : ("Prepaid" as const),
    sub_total: order.totalItemsPrice,
    shipping_charges: order.shippingCharges,
    total_discount: order.couponDiscount,
    weight: 0.5 * order.items.length,
    length: 15,
    width: 10,
    height: 10,
  };

  console.log(`[Shiprocket] Creating order in Shiprocket for ${order.orderId}...`);
  const srResponse = await shiprocketService.createOrder(shiprocketOrderData);
  if (!srResponse) {
    throw new AppError("Failed to create order inside Shiprocket. Check logs.", 522);
  }

  const { shiprocketOrderId, shipmentId } = srResponse;

  // 2. Select Courier Partner & Assign AWB
  console.log(`[Shiprocket] Finding courier partner and assigning AWB for shipment ${shipmentId}...`);
  const carriers = await shiprocketService.checkServiceability(
    order.shippingAddress.zipCode,
    0.5 * order.items.length,
    order.paymentMethod === "cod"
  );

  let selectedCourierId = undefined;
  let courierName = "Shiprocket Express";

  if (carriers.length > 0) {
    // Pick the highest rated partner
    const bestCourier = carriers.reduce((prev, curr) => (prev.rating > curr.rating ? prev : curr));
    selectedCourierId = bestCourier.courier_company_id;
    courierName = bestCourier.courier_name;
  }

  const awbResponse = await shiprocketService.assignAwb(shipmentId, selectedCourierId);
  if (!awbResponse) {
    throw new AppError("Failed to assign AWB via Shiprocket courier. Proceeding with order confirmed state.", 500);
  }

  const { awbNumber, courierName: actualCourier } = awbResponse;

  // 3. Generate documents (label, invoice, manifest) and schedule pickup
  console.log(`[Shiprocket] Generating documents and scheduling pickup...`);
  const labelUrl = await shiprocketService.generateLabel(shipmentId);
  const invoiceUrl = await shiprocketService.generateInvoice(shiprocketOrderId);
  const manifestUrl = await shiprocketService.generateManifest(shipmentId);
  
  // Schedule pickup
  await shiprocketService.schedulePickup(shipmentId);

  // 4. Update the DB order model
  order.status = "Confirmed";
  order.shiprocketOrderId = shiprocketOrderId;
  order.shiprocketShipmentId = shipmentId;
  order.shiprocketAwbNumber = awbNumber;
  order.shiprocketCourierCompany = actualCourier || courierName;
  order.shiprocketStatus = "AWB Assigned";
  if (labelUrl) order.shiprocketLabelUrl = labelUrl;
  if (invoiceUrl) order.shiprocketInvoiceUrl = invoiceUrl;
  if (manifestUrl) order.shiprocketManifestUrl = manifestUrl;

  await order.save();

  // 5. Send confirmation notifications via WhatsApp
  try {
    sendWhatsAppOrderStatus(
      `${customerDoc.firstName} ${customerDoc.lastName}`,
      customerDoc.mobile,
      order.orderId,
      "Confirmed"
    );
  } catch (whatsappErr) {
    console.error("[WhatsApp] Error sending order confirm notification:", whatsappErr);
  }

  return sendSuccessResponse(res, 200, "Order confirmed and shipped via Shiprocket successfully", order);
});
