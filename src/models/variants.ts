import mongoose, { Document, Schema } from "mongoose";

export interface IProductVariant extends Document {
  product: mongoose.Types.ObjectId;

  sku: string;
  barcode?: string;

  attributes: Record<string, string>;
  // example: { Color: "Red", Size: "Small", Edition: "Deluxe" }

  price: number;
  originalPrice?: number;

  stock: number;
  lowStockAlert?: number;

  images?: string[];

  weight?: number; // for shipping
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };

  status: "active" | "inactive" | "out_of_stock";

  isDefault: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariant>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    barcode: {
      type: String,
      trim: true,
    },

    attributes: {
      type: Map,
      of: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    originalPrice: {
      type: Number,
      min: 0,
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowStockAlert: {
      type: Number,
      default: 2,
    },

    images: {
      type: [String],
    },

    weight: {
      type: Number,
    },

    dimensions: {
      length: Number,
      width: Number,
      height: Number,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "out_of_stock"],
      default: "active",
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

productVariantSchema.index({ product: 1, attributes: 1 }, { unique: true });

const ProductVariant = mongoose.model<IProductVariant>(
  "ProductVariant",
  productVariantSchema,
);

export default ProductVariant;
