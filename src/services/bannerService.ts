import Banner from "../models/banner";

class BannerService {
  async getAllBanners(search?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: regex },
        { tag: regex },
        { highlightText: regex },
        { description: regex },
      ];
    }
    return Banner.find(filter).sort({ order: 1, createdAt: -1 }).lean();
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
