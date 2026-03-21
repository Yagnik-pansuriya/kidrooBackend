import mongoose from "mongoose";

export interface IProduct {
  productName: string,
  slug: string,
  description: string,
  price: number,
  originalPrice: number,
  discountPercentage: number,
  stock: number,
  category: mongoose.Schema.Types.ObjectId,
  image: string,
  images: string[],
  ratings: number,
  numReviews: number,
  featured: boolean,
  newArrival: boolean,
  bestSeller: boolean,
  ageRange: {
    from: number,
    to:number
  },
  tags: string[],
  isActive: boolean,
  
}


const productSchema = new mongoose.Schema<IProduct>({
  productName: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
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
    required: true,
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
    required: true,
  },
  numReviews: {
    type: Number,
    required: true,
  },
  featured: {
    type: Boolean,
    required: true,
  },
  newArrival: {
    type: Boolean,
    required: true,
  },
  bestSeller: {
    type: Boolean,
    required: true,
  },
  ageRange: {
    from: {
      type: Number,
      required: true,
    },
    to: {
      type: Number,
      required: true,
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
})

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;