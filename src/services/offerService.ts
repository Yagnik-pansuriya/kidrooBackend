import Offer from "../models/offers";

class OfferService {
  async getAllOffers() {
    const offers = await Offer.find().sort({ createdAt: -1 }).lean();
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
    const offer = await Offer.findByIdAndUpdate(id, offerData, { new: true });
    return offer;
  }

  async deleteOfferById(id: string) {
    const offer = await Offer.findByIdAndDelete(id);
    return offer;
  }
}

export const offerService = new OfferService();
