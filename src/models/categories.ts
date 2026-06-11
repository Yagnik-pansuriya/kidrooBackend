import mongoose from "mongoose";

interface ICategory extends mongoose.Document {
  catagoryName: string;
  slug?: string;
  description?: string;
  icon?: string;
  image?: string;
  count?: number;
  position?: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const categorySchema = new mongoose.Schema<ICategory>({
  catagoryName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  icon: {
    type: String,
  },
  image: {

    type: String,
  },
  count: {
    type: Number,
    default: 0,
  },
  position: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },

}, { timestamps: true })

const Category = mongoose.model<ICategory>("Category", categorySchema);

export default Category;