import crypto from "crypto";
import Order from "../models/order";
import Product from "../models/products";
import Customer from "../models/customer";
import razorpayInstance from "../config/razorpay";
import AppError from "../utils/appError";
import SiteSettings from "../models/siteSettings";

class OrderService {
  /**
   * Generate a human-readable order ID: KDR-YYYYMMDD-XXXXX
   */
  async generateOrderId(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    // Count today's orders to generate a sequential number
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayCount = await Order.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    const seq = String(todayCount + 1).padStart(5, "0");
    return `KDR-${dateStr}-${seq}`;
  }

  /**
   * Validate products and calculate pricing from DB (never trust frontend prices)
   */
  async validateAndCalculate(
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ) {
    const productSnapshots: any[] = [];
    let subTotal = 0;

    const ProductVariant = (await import("../models/variants")).default;

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
      const razorpayOrder = await razorpayInstance.orders.create({
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
      await Customer.findByIdAndUpdate(data.customerId, {
        $push: { orderHistory: { orderId: order._id, orderDate: new Date() } },
      });

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
    await Customer.findByIdAndUpdate(order.customerId, {
      $push: { orderHistory: { orderId: order._id, orderDate: new Date() } },
    });

    return order;
  }

  /**
   * Decrement product stock after successful order
   */
  async decrementStock(products: any[]) {
    for (const item of products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });

      // Also decrement variant stock if applicable
      if (item.variantId) {
        const ProductVariant = (await import("../models/variants")).default;
        await ProductVariant.findByIdAndUpdate(item.variantId, {
          $inc: { stock: -item.quantity },
        });
      }
    }
  }

  /**
   * Get all orders for a customer
   */
  async getCustomerOrders(customerId: string) {
    return Order.find({ customerId: customerId as any })
      .sort({ createdAt: -1 })
      .lean();
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
    }).lean();
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    return order;
  }
}

export const orderService = new OrderService();
