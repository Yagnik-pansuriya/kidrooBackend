import mongoose from "mongoose";

interface IBanner extends mongoose.Document {
  tag: string;
  title: string;
  highlightText: string;
  italicText: string;
  afterText: string;
  description: string;
  image: string;
  buttonText: string;
  buttonUrl: string;
  isActive: boolean;
  order: number;
}

const bannerSchema = new mongoose.Schema<IBanner>({
  tag: {
    type: String,
    default: "KIDS NEED TOYS",
  },
  title: {
    type: String,
    required: true,
  },
  highlightText: {
    type: String,
    default: "",
  },
  italicText: {
    type: String,
    default: "",
  },
  afterText: {
    type: String,
    default: "",
  },
  description: {
    type: String,
  },
  image: {
    type: String,
  },
  buttonText: {
    type: String,
    default: "Shop Now",
  },
  buttonUrl: {
    type: String,
    default: "/shop",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

const Banner = mongoose.model<IBanner>("Banner", bannerSchema);

export default Banner;
