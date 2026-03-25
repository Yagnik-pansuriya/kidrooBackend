import mongoose from "mongoose";

export interface ISiteSettings {
  siteName: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  logo: string;
  themeColors: {
    primary: string;
    hover: string;
    header: string;
    footer: string;
  };
}

const siteSettingsSchema = new mongoose.Schema<ISiteSettings>(
  {
    siteName: {
      type: String,
      required: true,
      default: "Kidroo Toys",
    },
    tagline: {
      type: String,
      required: true,
      default: "Where Imagination Comes to Play! 🎈",
    },
    contactEmail: {
      type: String,
      required: true,
      default: "hello@kidrootoys.com",
    },
    contactPhone: {
      type: String,
      required: true,
      default: "+91 1800 123 4567",
    },
    logo: {
      type: String,
      required: false,
      default: "",
    },
    themeColors: {
      primary: {
        type: String,
        required: true,
        default: "#FF6B35",
      },
      hover: {
        type: String,
        required: true,
        default: "#E55A25",
      },
      header: {
        type: String,
        required: true,
        default: "#000000",
      },
      footer: {
        type: String,
        required: true,
        default: "#031268",
      },
    },
  },
  { timestamps: true },
);

// Ensure only one settings document exists
siteSettingsSchema.set("toJSON", { virtuals: true });
siteSettingsSchema.set("toObject", { virtuals: true });

const SiteSettings = mongoose.model<ISiteSettings>("SiteSettings", siteSettingsSchema);

export default SiteSettings;
