import mongoose from "mongoose";

interface ICategory extends mongoose.Document {
  catagoryName: string;
  slug?: string;
  icon?: string;
  image?: string;
  count?: number;
  position?: number;
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

})

const Category = mongoose.model<ICategory>("Category", categorySchema);

export default Category;