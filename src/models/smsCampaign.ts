import mongoose, { Schema, Document } from "mongoose";

// ── Campaign recipient result sub-doc ──────────────────────────
interface ICampaignRecipient {
  customerId: mongoose.Types.ObjectId;
  mobile: string;
  name: string;
  status: "sent" | "delivered" | "failed";
}

// ── Main interface ──────────────────────────────────────────────
export interface ISmsCampaign extends Document {
  name: string;
  message: string;
  channel: "whatsapp";   // Always WhatsApp for now; extend for SMS later
  kind: "broadcast" | "offer" | "cart";
  offer?: mongoose.Types.ObjectId;
  targetGroup: "all" | "repeat" | "high_value" | "new" | "at_risk" | "custom";
  targetLabel: string;
  targetIds: mongoose.Types.ObjectId[];
  status: "draft" | "sending" | "sent" | "failed" | "scheduled";
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────
const smsCampaignSchema = new Schema<ISmsCampaign>(
  {
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 1024 },
    channel: { type: String, enum: ["whatsapp"], default: "whatsapp" },
    // broadcast = free-text promo, offer = offer alert, cart = 1:1 cart reminder
    kind: { type: String, enum: ["broadcast", "offer", "cart"], default: "broadcast" },
    offer: { type: Schema.Types.ObjectId, ref: "Offer" },
    targetGroup: {
      type: String,
      enum: ["all", "repeat", "high_value", "new", "at_risk", "custom"],
      default: "all",
    },
    targetLabel: { type: String, default: "All Customers" },
    targetIds: [{ type: Schema.Types.ObjectId, ref: "Customer" }],
    status: {
      type: String,
      enum: ["draft", "sending", "sent", "failed", "scheduled"],
      default: "draft",
    },
    sentCount:      { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    failedCount:    { type: Number, default: 0 },
    sentAt:         { type: Date },
  },
  { timestamps: true }
);

smsCampaignSchema.index({ createdAt: -1 });
smsCampaignSchema.index({ status: 1 });
smsCampaignSchema.index({ offer: 1, createdAt: -1 });
smsCampaignSchema.index({ kind: 1, targetIds: 1, createdAt: -1 });

const SmsCampaign = mongoose.model<ISmsCampaign>("SmsCampaign", smsCampaignSchema);
export default SmsCampaign;
