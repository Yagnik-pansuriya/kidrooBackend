import mongoose from "mongoose";

/**
 * One document per offer per day (IST), holding that day's view / click counts.
 * Keeps writes cheap ($inc on an upserted doc) and makes timeframe charts a simple range query.
 */
interface IOfferDailyStat extends mongoose.Document {
  offer: mongoose.Types.ObjectId;
  day: string; // YYYY-MM-DD in Asia/Kolkata
  impressions: number;
  clicks: number;
}

const offerDailyStatSchema = new mongoose.Schema<IOfferDailyStat>(
  {
    offer: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", required: true },
    day: { type: String, required: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: false }
);

offerDailyStatSchema.index({ offer: 1, day: 1 }, { unique: true });
offerDailyStatSchema.index({ day: 1 });

const OfferDailyStat = mongoose.model<IOfferDailyStat>("OfferDailyStat", offerDailyStatSchema);

export default OfferDailyStat;
