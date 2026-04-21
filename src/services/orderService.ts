import crypto from "crypto";
import Order from "../models/order";
import Product from "../models/products";
import Customer from "../models/customer";
import ProductVariant from "../models/variants";
import { getRazorpayInstance } from "../config/razorpay";
import AppError from "../utils/appError";
import SiteSettings from "../models/siteSettings";
import { CacheService } from "./redisCacheService";
import { redis } from "../config/redis";
import {
  sendOrderConfirmationWhatsApp,
  sendOrderStatusWhatsApp,
} from "./msg91WhatsappService";

class OrderService {
  /**
   * Generate a human-readable order ID: KDR-YYYYMMDD-XXXXX
   */
  /**
   * Generate a human-readable order ID: KDR-YYYYMMDD-XXXXX
   * CRIT-1 FIX: Uses Redis INCR for atomic, race-condition-free sequence generation.
   * Falls back to timestamp+random if Redis is unavailable.
   */
  async generateOrderId(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    const redisKey = `order:seq:${dateStr}`;

    try {
      // Atomic increment — guaranteed unique even under concurrency
      const seq = await redis.incr(redisKey);
      // Expire the key at midnight so it resets daily (TTL = 26 hours for safety)
      await redis.expire(redisKey, 26 * 60 * 60);
      return `KDR-${dateStr}-${String(seq).padStart(5, "0")}`;
    } catch {
      // Fallback: timestamp + random suffix (still better than countDocuments)
      const fallback = `${Date.now()}-${Math.floor(Math.random() * 999)}`;
      return `KDR-${dateStr}-F${fallback.slice(-8)}`;
    }
  }

  /**
   * Validate products and calculate pricing from DB (never trust frontend prices)
   */
  async validateAndCalculate(
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ) {
    const productSnapshots: any[] = [];
    let subTotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        throw new AppError(`Product not found: ${item.productId}`, 400);
      }
      if (!product.isActive) {
        throw new AppError(`Product "${product.productName}" is no longer available`, 400);
      }

      // Build the snapshot
      const snapshot: any = {
        productId: product._id,
        productName: product.productName,
        productImage: product.image,
        quantity: item.quantity,
        price: product.price,
        originalPrice: product.originalPrice,
      };

      // Resolve the variant — either the one explicitly specified, or the default variant
      let resolvedVariant: any = null;

      if (item.variantId) {
        resolvedVariant = await ProductVariant.findById(item.variantId);
      } else {
        // No variantId sent — look up the default variant for this product
        resolvedVariant = await ProductVariant.findOne({
          product: product._id,
          isDefault: true,
        });
      }

      if (resolvedVariant) {
        const v = resolvedVariant;
        snapshot.variantId = v._id;
        // Build variant name from attributes (e.g. "Red / Small")
        const attrs = v.attributes || {};
        snapshot.variantName = Object.values(attrs).join(" / ") || v.sku || "";
        snapshot.price = v.price;
        snapshot.originalPrice = v.originalPrice || product.originalPrice;
        snapshot.productImage = v.images?.[0] || product.image;

        // Check variant stock
        if (v.stock < item.quantity) {
          throw new AppError(
            `Insufficient stock for "${product.productName}". Available: ${v.stock}, Requested: ${item.quantity}`,
            400
          );
        }
      } else {
        // No variant found at all — fall back to product-level stock
        if (product.stock < item.quantity) {
          throw new AppError(
            `Insufficient stock for "${product.productName}". Available: ${product.stock}, Requested: ${item.quantity}`,
            400
          );
        }
      }

      subTotal += snapshot.price * snapshot.quantity;
      productSnapshots.push(snapshot);
    }

    // Shipping: free if subtotal >= 500, else ₹50
    const shippingCost = subTotal >= 500 ? 0 : 50;
    const tax = 0; // No tax calculation for now
    const discount = 0;
    const totalAmount = subTotal + tax + shippingCost - discount;

    return { productSnapshots, subTotal, tax, shippingCost, discount, totalAmount };
  }

  /**
   * Create a Razorpay order for online payment
   */
  async createRazorpayOrder(amount: number, receipt: string) {
    try {
      const razorpayOrder = await getRazorpayInstance().orders.create({
        amount: Math.round(amount * 100), // Convert to paise (₹1 = 100 paise)
        currency: "INR",
        receipt: receipt,
      });
      return razorpayOrder;
    } catch (error: any) {
      console.error("Razorpay order creation failed:", error);
      throw new AppError("Failed to create payment order. Please try again.", 500);
    }
  }

  /**
   * Verify Razorpay payment signature using HMAC SHA256
   */
  verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ): boolean {
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(body)
      .digest("hex");
    return expectedSignature === razorpaySignature;
  }

  /**
   * Create a new order (handles both online and COD)
   */
  async createOrder(data: {
    customerId: string;
    items: Array<{ productId: string; variantId?: string; quantity: number }>;
    paymentMethod: "online" | "cod";
    shippingAddress: any;
  }) {
    // 1. Check if payment method is allowed
    const settings = await SiteSettings.findOne();
    if (data.paymentMethod === "online" && !settings?.paymentMethods?.onlinePayment) {
      throw new AppError("Online payment is currently not available", 400);
    }
    if (data.paymentMethod === "cod" && !settings?.paymentMethods?.cashOnDelivery) {
      throw new AppError("Cash on Delivery is currently not available", 400);
    }

    // 2. Validate products, stock, and calculate totals from DB
    const { productSnapshots, subTotal, tax, shippingCost, discount, totalAmount } =
      await this.validateAndCalculate(data.items);

    // 3. Generate order ID
    const orderId = await this.generateOrderId();

    // 4. Handle based on payment method
    if (data.paymentMethod === "online") {
      // Create Razorpay order first
      const razorpayOrder = await this.createRazorpayOrder(totalAmount, orderId);

      // Save order with pending status
      const order = await Order.create({
        orderId,
        customerId: data.customerId as any,
        products: productSnapshots,
        subTotal,
        tax,
        shippingCost,
        discount,
        totalAmount,
        paymentMethod: "online",
        paymentStatus: "pending",
        orderStatus: "pending",
        razorpayOrderId: razorpayOrder.id,
        shippingAddress: data.shippingAddress,
      });

      return {
        order,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        amount: totalAmount,
      };
    } else {
      // COD: Create order and decrement stock immediately
      const order = await Order.create({
        orderId,
        customerId: data.customerId as any,
        products: productSnapshots,
        subTotal,
        tax,
        shippingCost,
        discount,
        totalAmount,
        paymentMethod: "cod",
        paymentStatus: "pending",
        orderStatus: "confirmed",
        shippingAddress: data.shippingAddress,
      });

      // Decrement stock for COD orders
      await this.decrementStock(productSnapshots);

      // Update customer order history
      const codCustomer = await Customer.findByIdAndUpdate(
        data.customerId,
        { $push: { orderHistory: { orderId: order._id, orderDate: new Date() } } },
        { new: false } // return original (pre-update) is fine — we just need the name
      );

      // ── WhatsApp: order confirmation (fire-and-forget) ─────────────────
      const codPhone = data.shippingAddress?.phone ?? codCustomer?.mobile ?? "";
      const codName = codCustomer
        ? `${codCustomer.firstName} ${codCustomer.lastName}`.trim()
        : data.shippingAddress?.fullName ?? "Customer";
      if (codPhone) {
        sendOrderConfirmationWhatsApp(
          codPhone,
          codName,
          order.orderId,
          totalAmount,
          "cod"
        ).catch((e) =>
          console.error("[WhatsApp] COD confirmation send failed:", e?.message)
        );
      }

      return { order };
    }
  }

  /**
   * Verify payment and finalize online order
   */
  async verifyAndCompletePayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    orderId: string;
  }) {
    // Find the order
    const order = await Order.findById(data.orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (order.paymentStatus === "paid") {
      throw new AppError("Payment already verified", 400);
    }

    // Verify the signature
    const isValid = this.verifyPaymentSignature(
      data.razorpay_order_id,
      data.razorpay_payment_id,
      data.razorpay_signature
    );

    if (!isValid) {
      // Mark payment as failed
      order.paymentStatus = "failed";
      await order.save();
      throw new AppError("Payment verification failed. Invalid signature.", 400);
    }

    // Update order with payment details
    order.razorpayPaymentId = data.razorpay_payment_id;
    order.razorpaySignature = data.razorpay_signature;
    order.paymentStatus = "paid";
    order.orderStatus = "confirmed";
    order.paidAt = new Date();
    await order.save();

    // Decrement stock after successful payment
    await this.decrementStock(order.products);

    // Update customer order history
    const onlineCustomer = await Customer.findByIdAndUpdate(
      order.customerId,
      { $push: { orderHistory: { orderId: order._id, orderDate: new Date() } } },
      { new: false }
    );

    // ── WhatsApp: order confirmation (fire-and-forget) ─────────────────
    const onlinePhone =
      order.shippingAddress?.phone ?? onlineCustomer?.mobile ?? "";
    const onlineName = onlineCustomer
      ? `${onlineCustomer.firstName} ${onlineCustomer.lastName}`.trim()
      : order.shippingAddress?.fullName ?? "Customer";
    if (onlinePhone) {
      sendOrderConfirmationWhatsApp(
        onlinePhone,
        onlineName,
        order.orderId,
        order.totalAmount,
        "online"
      ).catch((e) =>
        console.error("[WhatsApp] Online confirmation send failed:", e?.message)
      );
    }

    return order;
  }

  /**
   * Decrement product stock after successful order.
   * HIGH-1 FIX: Uses atomic conditional findOneAndUpdate ($inc only if stock >= quantity)
   * to eliminate the race condition between stock validation and decrement.
   */
  async decrementStock(products: any[]) {
    const affectedProductIds = new Set<string>();

    for (const item of products) {
      if (item.variantId) {
        // Atomic: decrement only if sufficient stock remains (prevents overselling)
        const updated = await ProductVariant.findOneAndUpdate(
          { _id: item.variantId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true }
        );
        if (!updated) {
          throw new AppError(
            `Insufficient stock for "${item.productName}". The item may have sold out during checkout.`,
            409
          );
        }
        affectedProductIds.add(String(item.productId));
        continue;
      }

      // Product-level stock (no variant)
      const updated = await Product.findOneAndUpdate(
        { _id: item.productId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );
      if (!updated) {
        throw new AppError(
          `Insufficient stock for "${item.productName}". The item may have sold out during checkout.`,
          409
        );
      }

      affectedProductIds.add(String(item.productId));
    }

    for (const productId of affectedProductIds) {
      await this.syncProductStock(productId);
      // MED-3 FIX: Clear both admin and public cache keys (split by isAdmin context)
      await CacheService.del(`product:${productId}:admin`);
      await CacheService.del(`product:${productId}:public`);
    }

    await CacheService.delPattern("products:page:*");
  }

  /**
   * Keep parent product stock aligned with its variants.
   * If a product uses variants, product.stock should mirror the total variant stock.
   */
  async syncProductStock(productId: string) {
    const product = await Product.findById(productId).select("hasVariants");
    if (!product) return;

    if (!product.hasVariants) return;

    const stockSummary = await ProductVariant.aggregate([
      { $match: { product: product._id } },
      { $group: { _id: null, totalStock: { $sum: "$stock" } } },
    ]);

    const totalStock = stockSummary[0]?.totalStock ?? 0;

    await Product.findByIdAndUpdate(productId, {
      $set: { stock: totalStock },
    });
  }

  /**
   * Get all orders for a customer with pagination
   * MED-2 FIX: Added page/limit to prevent full collection scan
   */
  async getCustomerOrders(customerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find({ customerId: customerId as any })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customerId: customerId as any }),
    ]);
    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single order by ID (for customer — validates ownership)
   */
  async getCustomerOrderById(orderId: string, customerId: string) {
    const order = await Order.findOne({ _id: orderId, customerId: customerId as any }).lean();
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    return order;
  }

  /**
   * Admin: Get all orders with filtering & pagination
   */
  async getAllOrders(filters: {
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query: any = {};

    if (filters.status && filters.status !== "all") {
      query.orderStatus = filters.status;
    }
    if (filters.paymentStatus && filters.paymentStatus !== "all") {
      query.paymentStatus = filters.paymentStatus;
    }
    if (filters.paymentMethod && filters.paymentMethod !== "all") {
      query.paymentMethod = filters.paymentMethod;
    }
    if (filters.search) {
      query.$or = [
        { orderId: { $regex: filters.search, $options: "i" } },
        { "shippingAddress.fullName": { $regex: filters.search, $options: "i" } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customerId", "firstName lastName email mobile")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: Get single order detail
   */
  async getOrderById(orderId: string) {
    const order = await Order.findById(orderId)
      .populate("customerId", "firstName lastName email mobile")
      .lean();
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    return order;
  }

  /**
   * Admin: Update order status
   */
  async updateOrderStatus(orderId: string, orderStatus: string, paymentStatus?: string) {
    const update: any = { orderStatus };
    if (paymentStatus) {
      update.paymentStatus = paymentStatus;
    }
    const order = await Order.findByIdAndUpdate(orderId, update, {
      new: true,
      runValidators: true,
    })
      .populate<{ customerId: { firstName: string; lastName: string; mobile: string } }>(
        "customerId",
        "firstName lastName mobile"
      )
      .lean();
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    // ── WhatsApp: order status update (fire-and-forget) ──────────────────
    try {
      const customer = order.customerId as any;
      const statusPhone: string =
        customer?.mobile ?? order.shippingAddress?.phone ?? "";
      const statusName: string = customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : order.shippingAddress?.fullName ?? "Customer";
      if (statusPhone) {
        sendOrderStatusWhatsApp(
          statusPhone,
          statusName,
          order.orderId,
          orderStatus
        ).catch((e) =>
          console.error("[WhatsApp] Status update send failed:", e?.message)
        );
      }
    } catch (e: any) {
      console.error("[WhatsApp] Status notification error:", e?.message);
    }

    return order;
  }
}

export const orderService = new OrderService();
