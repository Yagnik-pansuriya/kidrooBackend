import mongoose from "mongoose";

interface IOfferImage {
  url: string;
  altText?: string;
  link?: string;
}

interface IOfferPlacement {
  page: "home" | "shop" | "product" | "offers" | "custom";
  section?: string;
  position: number;
}

interface IOfferStyling {
  bgColor?: string;
  textColor?: string;
  overlayOpacity?: number;
}

interface IOffer extends mongoose.Document {
  title: string;
  subtitle?: string;
  description?: string;
  displayType: "single-banner" | "slider" | "top-banner" | "promo-section";
  placement: IOfferPlacement;
  images: IOfferImage[];
  styling: IOfferStyling;
  targetUrl?: string;
  validity: {
    from: Date;
    to: Date;
  };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const offerImageSchema = new mongoose.Schema<IOfferImage>(
  {
    url: { type: String, required: true },
    altText: { type: String, default: "" },
    link: { type: String, default: "" },
  },
  { _id: false }
);

const offerSchema = new mongoose.Schema<IOffer>(
  {
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
    displayType: {
      type: String,
      enum: ["single-banner", "slider", "top-banner", "promo-section"],
      required: true,
    },
    placement: {
      page: {
        type: String,
        enum: ["home", "shop", "product", "offers", "custom"],
        required: true,
      },
      section: {
        type: String,
        default: "main",
      },
      position: {
        type: Number,
        default: 0,
      },
    },
    images: {
      type: [offerImageSchema],
      default: [],
    },
    styling: {
      bgColor: { type: String, default: "#FF6B35" },
      textColor: { type: String, default: "#FFFFFF" },
      overlayOpacity: { type: Number, default: 0, min: 0, max: 1 },
    },
    targetUrl: {
      type: String,
    },
    validity: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound index for fast page-based lookups sorted by position
offerSchema.index({ "placement.page": 1, "placement.position": 1 });
offerSchema.index({ isActive: 1 });

const Offer = mongoose.model<IOffer>("Offer", offerSchema);

export default Offer;