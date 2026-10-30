import mongoose from "mongoose";
import Offer from "../models/offers";
import OfferDailyStat from "../models/offerDailyStat";
import { istDayKey } from "../utils/istDate";

// Counters are admin-only; keep them out of public payloads
const PUBLIC_FIELDS = "-stats -__v";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class OfferService {
  async getAllOffers(search?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { title: regex },
        { subtitle: regex },
        { description: regex },
        { badgeText: regex },
        { "placement.page": regex },
      ];
    }
    return Offer.find(filter).sort({ "placement.page": 1, "placement.position": 1, createdAt: -1 }).lean();
  }

  async getOffersByPage(page: string, section?: string) {
    const now = new Date();
    const filter: any = {
      "placement.page": page,
      isActive: true,
      "validity.from": { $lte: now },
      "validity.to": { $gte: now },
    };
    if (section) {
      filter["placement.section"] = section;
    }
    return Offer.find(filter).select(PUBLIC_FIELDS).sort({ "placement.position": 1, createdAt: -1 }).lean();
  }

  /**
   * Get ALL active offers (for the public offers page).
   * Returns offers from all pages that are active and within validity dates.
   */
  async getActiveOffers() {
    const now = new Date();
    return Offer.find({
      isActive: true,
      "validity.from": { $lte: now },
      "validity.to": { $gte: now },
    })
      .select(PUBLIC_FIELDS)
      .sort({ "placement.position": 1, createdAt: -1 })
      .lean();
  }

  async getOfferById(id: string) {
    return Offer.findById(id).lean();
  }

  async createOffer(data: any) {
    return Offer.create(data);
  }

  async updateOffer(id: string, data: any) {
    return Offer.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async deleteOfferById(id: string) {
    await OfferDailyStat.deleteMany({ offer: id });
    return Offer.findByIdAndDelete(id);
  }

  async reorderOffers(page: string, orderedIds: string[]) {
    const ops = orderedIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { "placement.position": index + 1 } },
        },
      }));
    if (ops.length > 0) {
      await Offer.bulkWrite(ops);
    }
    return Offer.find({ "placement.page": page } as any).sort({ "placement.position": 1 }).lean();
  }

  /**
   * Record storefront views / clicks. Events are pre-aggregated per offer so a batch
   * of 20 impressions costs one write per offer, and ids that aren't real offers are dropped.
   */
  async trackEvents(events: { id: string; type: "impression" | "click" }[]) {
    const totals = new Map<string, { impressions: number; clicks: number }>();
    for (const e of events) {
      const t = totals.get(e.id) || { impressions: 0, clicks: 0 };
      if (e.type === "click") t.clicks += 1;
      else t.impressions += 1;
      totals.set(e.id, t);
    }

    const existing = await Offer.find({ _id: { $in: [...totals.keys()] } }).select("_id").lean();
    if (existing.length === 0) return 0;

    const day = istDayKey();
    const offerOps: any[] = [];
    const dailyOps: any[] = [];
    for (const { _id } of existing) {
      const t = totals.get(String(_id))!;
      const inc = { impressions: t.impressions, clicks: t.clicks };
      offerOps.push({
        updateOne: { filter: { _id }, update: { $inc: { "stats.impressions": inc.impressions, "stats.clicks": inc.clicks } } },
      });
      dailyOps.push({
        updateOne: { filter: { offer: _id, day }, update: { $inc: inc }, upsert: true },
      });
    }
    await Promise.all([Offer.bulkWrite(offerOps), OfferDailyStat.bulkWrite(dailyOps)]);
    return existing.length;
  }
}

export const offerService = new OfferService();
