import mongoose from "mongoose";

export interface IProduct {
  productName: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number;
  discountPercentage?: number;
  stock: number;
  category?: mongoose.Schema.Types.ObjectId;
  image: string;
  images: string[];
  ratings?: number;
  numReviews?: number;
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  ageRange?: {
    from?: number;
    to?: number;
  };
  tags: string[];
  isActive: boolean;
  hasVariants?: boolean;
  variants?: mongoose.Schema.Types.ObjectId[]; // Add this line
}

const productSchema = new mongoose.Schema<IProduct>(
  {
    productName: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    discountPercentage: {
      type: Number,
      required: false,
      default: 0,
    },
    stock: {
      type: Number,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    image: {
      type: String,
      required: true,
    },
    images: {
      type: [String],
      required: true,
    },
    ratings: {
      type: Number,
      required: false,
      default: 0,
    },
    numReviews: {
      type: Number,
      required: false,
      default: 0,
    },
    featured: {
      type: Boolean,
      required: false,
      default: false,
    },
    newArrival: {
      type: Boolean,
      required: false,
      default: false,
    },
    bestSeller: {
      type: Boolean,
      required: false,
      default: false,
    },
    ageRange: {
      from: {
        type: Number,
        required: false,
      },
      to: {
        type: Number,
        required: false,
      },
    },
    tags: {
      type: [String],
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
    },
    hasVariants: {
      type: Boolean,
      required: true,
      default: false,
    },
    variants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
      },
    ],
  },
  { timestamps: true },
);

// Ensure virtuals are included when converting document to JSON
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;
