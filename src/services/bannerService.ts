import Banner from "../models/banner";

class BannerService {
  async getAllBanners() {
    return Banner.find().sort({ order: 1, createdAt: -1 });
  }

  async getActiveBanners() {
    return Banner.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
  }

  async getBannerById(id: string) {
    return Banner.findById(id);
  }

  async createBanner(data: any) {
    return Banner.create(data);
  }

  async updateBanner(id: string, data: any) {
    return Banner.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteBanner(id: string) {
    return Banner.findByIdAndDelete(id);
  }
}

export const bannerService = new BannerService();
