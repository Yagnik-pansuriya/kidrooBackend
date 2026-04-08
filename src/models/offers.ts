import mongoose from "mongoose";


interface IOffer extends mongoose.Document {
  title: string;
  subtitle?: string;
  description?: string;
  image?:[string];
  discountPercentage?: number;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  type: "slider" | "fullscreen-poster" | "post" | "buyable";
  targetUrl?: string;
  couponCode?: string;
  validity?: {
    from: Date;
    to: Date;
  };
  bgColor?: string;
  textColor?: string;
  offerTag?: string;
  offerCategory?: "all-deals" | "flash-sale" | "clearance";
  isFeatured?: boolean;
  couponDescription?: string;
}

const offerSchema = new mongoose.Schema<IOffer>({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
  },
  description: {
    type: String,
  },
  image: {
    type: [String],
  },
  discountPercentage: {
    type: Number,
  },
  validity: {
    from: {
      type: Date,
      required: true, 
    },
    to: {
      type: Date,
      required: true,
    },
  },
  isActive: {
    type: Boolean,
    default: true,  
  },
  type: {
    type: String,
    enum: ["slider", "fullscreen-poster", "post", "buyable"],
    required: true,
  },
  targetUrl: {
    type: String,
  },
  couponCode: {
    type: String,
  },
  bgColor: {
    type: String,
  },
  textColor: {
    type: String,
  },
  offerTag: {
    type: String,
  },
  offerCategory: {
    type: String,
    enum: ["all-deals", "flash-sale", "clearance"],
    default: "all-deals",
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  couponDescription: {
    type: String,
  },

},{ timestamps: true });

const Offer = mongoose.model<IOffer>("Offer", offerSchema);

export default Offer;