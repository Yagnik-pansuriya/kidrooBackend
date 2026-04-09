import Category from "../models/categories";

class CategoryService {
  async getAllCategories() {
    const categories = await Category.find().lean();
    return categories;
  }

  async getCategoryById(id: string) {
    const category = await Category.findById(id).lean();
    return category;
  }

  async createCategory(categoryData: any) {
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
}

export const categoryService = new CategoryService();
