import mongoose from "mongoose";

// ── Product snapshot sub-document ─────────────────────────────
interface IOrderProduct {
  productId: mongoose.Schema.Types.ObjectId;
  variantId?: mongoose.Schema.Types.ObjectId;
  productName: string;
  productImage: string;
  variantName?: string;
  quantity: number;
  price: number;           // unit price at time of purchase
  originalPrice: number;   // MRP at time of purchase
}

// ── Shipping address snapshot ─────────────────────────────────
interface IShippingAddress {
  fullName: string;
  phone: string;
  houseNo: string;
  street: string;
  landmark?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// ── Main Order interface ──────────────────────────────────────
interface IOrder extends mongoose.Document {
  orderId: string;
  customerId: mongoose.Schema.Types.ObjectId;
  products: IOrderProduct[];

  // Pricing
  subTotal: number;
  tax: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;

  // Payment
  paymentMethod: "online" | "cod";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";

  // Razorpay (online payment only)
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

  // Shipping
  shippingAddress: IShippingAddress;

  // Status
  orderStatus: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

  // Timestamps
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ── Order Schema ──────────────────────────────────────────────
const orderSchema = new mongoose.Schema<IOrder>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ProductVariant",
        },
        productName: {
          type: String,
          required: true,
        },
        productImage: {
          type: String,
          required: true,
        },
        variantName: {
          type: String,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        originalPrice: {
          type: Number,
          required: true,
        },
      },
    ],

    // ── Pricing ───────────────────────────────────────────────
    subTotal: {
      type: Number,
      required: true,
    },
    tax: {
      type: Number,
      required: true,
      default: 0,
    },
    shippingCost: {
      type: Number,
      required: true,
      default: 0,
    },
    discount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },

    // ── Payment ───────────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ["online", "cod"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    // ── Razorpay fields (online payment only) ─────────────────
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },

    // ── Shipping Address (snapshot) ───────────────────────────
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      houseNo: { type: String },
      street: { type: String, required: true },
      landmark: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, default: "India" },
    },

    // ── Order Status ──────────────────────────────────────────
    orderStatus: {
      type: String,
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },

    paidAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────────
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ razorpayOrderId: 1 });

// Ensure virtuals included in JSON
orderSchema.set("toJSON", { virtuals: true });
orderSchema.set("toObject", { virtuals: true });

const Order = mongoose.model<IOrder>("Order", orderSchema);
export default Order;
