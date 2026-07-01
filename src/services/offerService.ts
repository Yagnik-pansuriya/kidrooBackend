import Offer from "../models/offers";

class OfferService {
  async getAllOffers(search?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: regex },
        { subtitle: regex },
        { description: regex },
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
    return Offer.find(filter).sort({ "placement.position": 1 }).lean();
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
    return Offer.findByIdAndDelete(id);
  }

  async reorderOffers(page: string, orderedIds: string[]) {
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { "placement.position": index } },
      },
    }));
    if (ops.length > 0) {
      await Offer.bulkWrite(ops);
    }
    return Offer.find({ "placement.page": page } as any).sort({ "placement.position": 1 }).lean();
  }
}

export const offerService = new OfferService();
