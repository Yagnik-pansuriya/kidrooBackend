import Category from "../models/categories";

class CategoryService {
  async getAllCategories() {
    const categories = await Category.find().sort({ position: 1, _id: 1 });
    return categories;
  }

  async getCategoryById(id: string) {
    const category = await Category.findById(id);
    return category;
  }

  async createCategory(categoryData: any) {
    // Auto-assign position if not provided
    if (categoryData.position === undefined || categoryData.position === null) {
      const maxPos = await Category.findOne().sort({ position: -1 }).select("position").lean();
      categoryData.position = (maxPos?.position ?? -1) + 1;
    }
    const category = await Category.create(categoryData);
    return category;
  }

  async updateCategory(id: string, categoryData: any) {
    const category = await Category.findByIdAndUpdate(id, categoryData, {
      new: true,
      runValidators: true,
    });
    return category;
  }

  async deleteCategoryById(id: string) {
    const category = await Category.findByIdAndDelete(id);
    return category;
  }

  /**
   * Bulk reorder categories.
   * Accepts array of { id, position }.
   */
  async reorderCategories(items: { id: string; position: number }[]) {
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { position: item.position } },
      },
    }));
    await Category.bulkWrite(bulkOps);
    return await this.getAllCategories();
  }
}

export const categoryService = new CategoryService();
