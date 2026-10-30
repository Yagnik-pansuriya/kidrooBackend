import mongoose, { Document, Schema } from "mongoose";

// ── Cart item sub-document ──────────────────────────────────────
export interface ICartItem {
  product: mongoose.Types.ObjectId;
  variant?: mongoose.Types.ObjectId | null;
  quantity: number;
  addedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: Schema.Types.ObjectId, ref: "ProductVariant", default: null },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Cart Interface ──────────────────────────────────────────────
export interface ICart extends Document {
  customer: mongoose.Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Cart Schema (one cart per customer) ─────────────────────────
const cartSchema = new Schema<ICart>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: {
        validator: (v: ICartItem[]) => v.length <= 50,
        message: "A cart can contain a maximum of 50 items",
      },
    },
  },
  { timestamps: true }
);

cartSchema.index({ updatedAt: -1 });

const Cart = mongoose.model<ICart>("Cart", cartSchema);

export default Cart;
