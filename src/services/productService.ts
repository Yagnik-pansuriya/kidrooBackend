import Product, { IProduct } from "../models/products";
import { paginateQuery } from "../utils/common/paginateQuarry";
import { deleteFromCloudinary, extractPublicId } from "../utils/uploadToCloudinary";
import mongoose from "mongoose";


class ProductService {
  async getAllProducts(query: any = {}) {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      skill,
      isActive,
      sort
    } = query;

    const filter: any = {};

    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { seoKeywords: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      filter.categories = { $in: [category] };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    }

    if (featured !== undefined) filter.featured = featured === "true" || featured === true;
    if (newArrival !== undefined) filter.newArrival = newArrival === "true" || newArrival === true;
    if (bestSeller !== undefined) filter.bestSeller = bestSeller === "true" || bestSeller === true;
    if (isActive !== undefined) filter.isActive = isActive === "true" || isActive === true;

    if (ageRange !== undefined && ageRange !== '') filter.ageRange = { $in: [ageRange] };
    if (skill !== undefined && skill !== '') filter.skills = { $in: [skill] };

    return await paginateQuery({
      model: Product,
      query: query,
      filter: filter,
      sort: sort || { position: 1, createdAt: -1 },
      populate: ["categories", "skills"]
    });
  }

  async getProductFilters() {
    const stats = await Product.aggregate([
      {
        $facet: {
          priceRange: [
            { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } }
          ],
          // MED-1 FIX: Use $categories (array field) — old $category was a single ref and is now removed
          categories: [
            { $unwind: "$categories" },
            { $group: { _id: "$categories", count: { $sum: 1 } } },
            { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "details" } },
            { $unwind: "$details" },
            { $project: { _id: 1, name: "$details.catagoryName", count: 1 } }
          ],
          tags: [
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
          ],
          counts: [
            {
              $group: {
                _id: null,
                featured: { $sum: { $cond: ["$featured", 1, 0] } },
                newArrival: { $sum: { $cond: ["$newArrival", 1, 0] } },
                bestSeller: { $sum: { $cond: ["$bestSeller", 1, 0] } }
              }
            }
          ]
        }
      }
    ]);

    const result = stats[0];
    return {
      priceRange: result.priceRange[0] || { min: 0, max: 0 },
      categories: result.categories,
      tags: result.tags.map((t: any) => t._id),
      counts: result.counts[0] || { featured: 0, newArrival: 0, bestSeller: 0 }
    };
  }

  async getProductById(idOrSlug: string, isAdmin: boolean = false) {
    const filter = mongoose.Types.ObjectId.isValid(idOrSlug)
      ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }
      : { slug: idOrSlug };

    const product = await Product.findOne(filter).populate("categories").populate("skills").lean();
    return product;
  }

  /**
   * Get products sharing the same product code (related/grouped products)
   */
  async getProductsByProductCode(productCode: string, excludeId?: string) {
    const filter: any = { productCode, isActive: true };
    if (excludeId) filter._id = { $ne: excludeId };
    return await Product.find(filter)
      .populate("categories")
      .populate("skills")
      .sort({ position: 1 })
      .lean();
  }

  async createProduct(productData: IProduct) {
    // Auto-assign position if not provided (append at end)
    if ((productData as any).position === undefined || (productData as any).position === null) {
      const maxPos = await Product.findOne().sort({ position: -1 }).select("position").lean();
      (productData as any).position = (maxPos?.position ?? -1) + 1;
    }
    const product = await Product.create(productData)
    return product
  }

  async updateProduct(id: string, productData: Partial<IProduct>) {
    // HIGH-6: runValidators ensures Mongoose schema validators run on update
    const product = await Product.findByIdAndUpdate(id, productData, { new: true, runValidators: true })
    return product
  }

  async deleteProductById(id: string) {
    const product = await Product.findById(id);
    if (!product) return null;

    // Delete all images from Cloudinary
    if (product.images && product.images.length > 0) {
      for (const imgUrl of product.images) {
        try {
          const pId = extractPublicId(imgUrl);
          if (pId) await deleteFromCloudinary(pId, "image");
        } catch (err) {
          console.error(`Failed to delete Cloudinary image: ${imgUrl}`, err);
        }
      }
    } else if (product.image) {
      try {
        const pId = extractPublicId(product.image);
        if (pId) await deleteFromCloudinary(pId, "image");
      } catch (err) {
        console.error(`Failed to delete Cloudinary image: ${product.image}`, err);
      }
    }

    // Delete product document
    return await Product.findByIdAndDelete(id);
  }
}

export const productService = new ProductService()