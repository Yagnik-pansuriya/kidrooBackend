import Offer from "../models/offers";

class OfferService {
  async getAllOffers(search?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: regex },
        { subtitle: regex },
        { couponCode: regex },
        { offerTag: regex },
      ];
    }
    const offers = await Offer.find(filter).sort({ createdAt: -1 }).lean();
    return offers;
  }

  async getActiveOffers() {
    const now = new Date();
    // Fetch offers that are active and currently within valid dates
    const offers = await Offer.find({
      isActive: true,
      "validity.from": { $lte: now },
      "validity.to": { $gte: now }
    }).sort({ createdAt: -1 }).lean();
    return offers;
  }

  async getOfferById(id: string) {
    const offer = await Offer.findById(id).lean();
    return offer;
  }

  async createOffer(offerData: any) {
    const offer = await Offer.create(offerData);
    return offer;
  }

  async updateOffer(id: string, offerData: any) {
    // HIGH-6: runValidators ensures Mongoose schema validators run on update
    const offer = await Offer.findByIdAndUpdate(id, offerData, { new: true, runValidators: true });
    return offer;
  }

  async deleteOfferById(id: string) {
    const offer = await Offer.findByIdAndDelete(id);
    return offer;
  }
}

export const offerService = new OfferService();
