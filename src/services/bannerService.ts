import Banner from "../models/banner";

class BannerService {
  async getAllBanners() {
    return Banner.find().sort({ order: 1, createdAt: -1 }).lean();
  }

  async getActiveBanners() {
    return Banner.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean();
  }

  async getBannerById(id: string) {
    return Banner.findById(id).lean();
  }

  async createBanner(data: any) {
    return Banner.create(data);
  }

  async updateBanner(id: string, data: any) {
    // HIGH-6: runValidators ensures Mongoose schema validators run on update
    return Banner.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async deleteBanner(id: string) {
    return Banner.findByIdAndDelete(id);
  }
}

export const bannerService = new BannerService();
