import mongoose, { Document, Schema } from "mongoose";

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
  productName: string;
  skuCode?: string;
  image?: string;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  houseNo?: string;
  street: string;
  landmark?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface IOrder extends Document {
  orderId: string; // Friendly customer-facing Order ID
  customer: mongoose.Types.ObjectId;
  items: IOrderItem[];
  
  // Financial metrics
  totalItemsPrice: number;
  shippingCharges: number;
  couponCode?: string;
  couponDiscount: number;
  netAmount: number;
  
  // Payment info
  paymentMethod: "online" | "cod";
  paymentStatus: "Pending" | "Paid" | "Failed";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

  // Shipping & Tracking Status
  status: "Pending" | "Confirmed" | "Shipped" | "Delivered" | "Cancelled";
  
  shippingAddress: IShippingAddress;
  billingAddress?: IShippingAddress;
  
  // Shiprocket fulfillment metadata
  shiprocketOrderId?: string;
  shiprocketShipmentId?: string;
  shiprocketAwbNumber?: string;
  shiprocketCourierCompany?: string;
  shiprocketCourierRating?: string;
  shiprocketStatus?: string;
  shiprocketLabelUrl?: string;
  shiprocketInvoiceUrl?: string;
  shiprocketManifestUrl?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  productName: { type: String, required: true },
  skuCode: { type: String },
  image: { type: String },
});

const shippingAddressSchema = new Schema<IShippingAddress>({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  houseNo: { type: String },
  street: { type: String, required: true },
  landmark: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, default: "India" },
});

const orderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    items: [orderItemSchema],
    totalItemsPrice: { type: Number, required: true, min: 0 },
    shippingCharges: { type: Number, required: true, default: 0 },
    couponCode: { type: String },
    couponDiscount: { type: Number, required: true, default: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ["online", "cod"], default: "online" },
    paymentStatus: { type: String, enum: ["Pending", "Paid", "Failed"], default: "Pending" },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    status: { 
      type: String, 
      enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"], 
      default: "Pending",
      index: true 
    },
    shippingAddress: { type: shippingAddressSchema, required: true },
    billingAddress: { type: shippingAddressSchema },
    shiprocketOrderId: { type: String },
    shiprocketShipmentId: { type: String },
    shiprocketAwbNumber: { type: String },
    shiprocketCourierCompany: { type: String },
    shiprocketCourierRating: { type: String },
    shiprocketStatus: { type: String },
    shiprocketLabelUrl: { type: String },
    shiprocketInvoiceUrl: { type: String },
    shiprocketManifestUrl: { type: String },
  },
  { timestamps: true }
);

// Indexes for common queries
orderSchema.index({ createdAt: -1 });

const Order = mongoose.model<IOrder>("Order", orderSchema);

export default Order;
