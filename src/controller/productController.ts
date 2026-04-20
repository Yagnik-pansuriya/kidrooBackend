import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendSuccessResponse } from "../utils/apiResponse";
import { productService } from "../services/productService";
import { variantService } from "../services/variantService";
import mongoose from "mongoose";
import Product from "../models/products";

/**
 * Get All Products
 * GET /api/auth/products
 */
export const getAllProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, ...filters } = req.query;
    const cacheKey = `products:page:${page}:limit:${limit}:${JSON.stringify(filters)}`;

    const cachedProducts = await CacheService.get(cacheKey);
    if (cachedProducts) {
      return sendSuccessResponse(
        res,
        200,
        "Products fetched successfully",
        cachedProducts,
      );
    }

    const products = await productService.getAllProducts(req.query);
    await CacheService.set(cacheKey, products);

    return sendSuccessResponse(
      res,
      200,
      "Products fetched successfully",
      products,
    );
  },
);

export const getProductFilters = asyncHandler(
  async (req: Request, res: Response) => {
    // LOW-6 FIX: Cache the heavy facet aggregation for 5 minutes
    const CACHE_KEY = "products:filters";
    const cached = await CacheService.get(CACHE_KEY);
    if (cached) {
      return sendSuccessResponse(res, 200, "Filters fetched successfully", cached);
    }

    const filters = await productService.getProductFilters();
    await CacheService.set(CACHE_KEY, filters, 300); // 5-minute TTL
    return sendSuccessResponse(
      res,
      200,
      "Filters fetched successfully",
      filters,
    );
  },
);

export const getProductById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    // MED-3 FIX: Separate cache keys for admin (sees all variants) vs public (active only)
    const isAdmin = (req as any).user?.role === "admin";
    const cacheKey = `product:${id}:${isAdmin ? "admin" : "public"}`;
    const cachedProduct = await CacheService.get(cacheKey);
    if (cachedProduct) {
      return sendSuccessResponse(
        res,
        200,
        "product fetched SuccessFully",
        cachedProduct,
      );
    }

    const product = await productService.getProductById(id, isAdmin);
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    await CacheService.set(cacheKey, product);

    return sendSuccessResponse(
      res,
      200,
      "product fetched SuccessFully",
      product,
    );
  },
);

/**
 * Create a new product
 */
export const createProduct = asyncHandler(
  async (req: Request, res: Response) => {
    let {
      productName,
      slug,
      description,
      price,
      originalPrice,
      stock,
      category: legacyCategoryCreate,
      categories: rawCategoriesCreate,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
      youtubeUrl,
      hasWarranty,
      warrantyPeriod,
      warrantyType,
      hasGuarantee,
      guaranteePeriod,
      guaranteeTerms,
      skills: rawSkillsCreate,
    } = req.body;

    // Normalize: legacy single 'category' → array; new 'categories' array → use directly
    const resolvedCategoriesCreate = (() => {
      const raw = rawCategoriesCreate;
      const legacy = legacyCategoryCreate;
      if (raw !== undefined) {
        const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(",").map((s: string) => s.trim()) : [raw]);
        return arr.filter(Boolean);
      }
      if (legacy) return [legacy];
      return [];
    })();

    // Normalize skills array
    const resolvedSkillsCreate = (() => {
      if (rawSkillsCreate !== undefined) {
        const arr = Array.isArray(rawSkillsCreate) ? rawSkillsCreate : (typeof rawSkillsCreate === "string" ? rawSkillsCreate.split(",").map((s: string) => s.trim()) : [rawSkillsCreate]);
        return arr.filter(Boolean);
      }
      return [];
    })();


    // Parse JSON fields if they are strings (from form-data)
    const parseField = (field: any) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch {
          return field.includes(",") ? field.split(",") : field;
        }
      }
      return field;
    };

    tags = parseField(tags);
    ageRange = parseField(ageRange);

    if (resolvedCategoriesCreate.length > 0) {
      for (const catId of resolvedCategoriesCreate) {
        if (catId && !mongoose.isValidObjectId(catId)) {
          throw new AppError(`Invalid category ID: ${catId}`, 400);
        }
      }
    }

    // Slug unique check
    const existingSlug = await Product.findOne({ slug });
    if (existingSlug) {
      throw new AppError("Slug already exists", 400);
    }

    // Safe number helper: empty string, null, undefined all → 0
    const safeNum = (v: any): number => {
      if (v === '' || v === null || v === undefined) return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const parsedPrice = safeNum(price);
    const parsedOriginalPrice = originalPrice ? safeNum(originalPrice) : parsedPrice;
    let parsedStock = safeNum(stock);
    
    // Check final hasVariants
    const finalHasVariants = hasVariants === undefined ? true : (hasVariants === "true" || hasVariants === true);

    // Discount calculate
    const discountPercentage =
      parsedOriginalPrice > 0 && parsedOriginalPrice > parsedPrice
        ? Math.round(((parsedOriginalPrice - parsedPrice) / parsedOriginalPrice) * 100)
        : 0;

    // Stock rule: if hasVariants, stock is handled by variants
    if (finalHasVariants) parsedStock = 0;

    // Handle image uploads
    const files = req.files as Express.Multer.File[];
    let imageUrls: string[] = [];

    if (files?.length) {
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/products",
          });
          imageUrls.push(result.url);
        } catch (error) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw error;
        }
      }
    }

    if (!imageUrls.length) {
      throw new AppError("At least one image is required", 400);
    }

    const product = await productService.createProduct({
      productName,
      slug,
      description,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      discountPercentage,
      stock: parsedStock,
      categories: resolvedCategoriesCreate,
      image: imageUrls[0],
      images: imageUrls,
      ratings: 0,
      numReviews: 0,
      featured: featured === "true" || featured === true,
      newArrival: newArrival === "true" || newArrival === true,
      bestSeller: bestSeller === "true" || bestSeller === true,
      ageRange,
      tags,
      isActive: isActive === "true" || isActive === true,
      hasVariants: finalHasVariants,
      youtubeUrl: youtubeUrl || '',
      hasWarranty: hasWarranty === "true" || hasWarranty === true,
      warrantyPeriod: warrantyPeriod ? safeNum(warrantyPeriod) : undefined,
      warrantyType: warrantyType,
      hasGuarantee: hasGuarantee === "true" || hasGuarantee === true,
      guaranteePeriod: guaranteePeriod ? safeNum(guaranteePeriod) : undefined,
      guaranteeTerms: guaranteeTerms,
      skills: resolvedSkillsCreate,
    } as any);

    // ── Auto-create a default variant ──────────────────────────────
    const autoSku = `${(slug || productName || "PROD").toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 20)}-DEFAULT`;
    await variantService.createVariant({
      product: product._id as any,
      sku: autoSku,
      attributes: new Map([["Type", "Default"]]) as any,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      stock: safeNum(stock), // Variant gets the actual stock amount
      images: imageUrls,
      status: "active",
      isDefault: true,
      youtubeUrl: youtubeUrl || '',
    });

    await CacheService.delPattern("products:page:*");

    // Re-fetch with variants populated so the response includes the auto-created variant
    const populatedProduct = await productService.getProductById(
      (product._id as any).toString(),
      true
    );

    return sendSuccessResponse(res, 201, "Product created", populatedProduct);
  },
);

export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    const isAdmin = (req as any).user?.role === "admin";
    const existingProduct = await productService.getProductById(id, isAdmin);
    if (!existingProduct) {
      throw new AppError("Product not found", 404);
    }

    let {
      productName,
      slug,
      description,
      price,
      originalPrice,
      stock,
      category: legacyCategoryUpdate,
      categories: rawCategoriesUpdate,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
      youtubeUrl,
      hasWarranty,
      warrantyPeriod,
      warrantyType,
      hasGuarantee,
      guaranteePeriod,
      guaranteeTerms,
      skills: rawSkillsUpdate,
    } = req.body;

    // Parse JSON fields
    const parseField = (field: any) => {
      if (typeof field === "string") {
        try { return JSON.parse(field); } catch { return field; }
      }
      return field;
    };

    tags = parseField(tags);
    ageRange = parseField(ageRange);

    // Normalize categories for update
    const parseCategories = (raw: any, legacy: any): string[] | undefined => {
      if (raw !== undefined) {
        const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(",").map((s: string) => s.trim()) : [raw]);
        return arr.filter(Boolean);
      }
      if (legacy !== undefined) return [legacy];
      return undefined;
    };
    const resolvedCategoriesUpdate = parseCategories(rawCategoriesUpdate, legacyCategoryUpdate);

    if (resolvedCategoriesUpdate) {
      for (const catId of resolvedCategoriesUpdate) {
        if (catId && !mongoose.isValidObjectId(catId)) {
          throw new AppError(`Invalid category ID format: ${catId}`, 400);
        }
      }
    }

    const files = req.files as Express.Multer.File[] | undefined;
    let imageUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/products",
            public_id: `${slug || "product"}-${Date.now()}`,
          });
          imageUrls.push(result.url);
        } catch (error) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw error;
        }
      }

      // If we have new images, cleanup old ones
      if (existingProduct.images?.length) {
        for (const imgUrl of existingProduct.images) {
          const publicId = extractPublicId(imgUrl);
          if (publicId) await deleteFromCloudinary(publicId, "image");
        }
      }
    }

    // Safe number helper: empty string, null, undefined all → 0
    const safeNum = (v: any): number => {
      if (v === '' || v === null || v === undefined) return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const updateData: any = {
      productName,
      slug,
      description,
      ageRange,
      tags,
      youtubeUrl,
      warrantyType,
      guaranteeTerms,
    };

    if (resolvedCategoriesUpdate !== undefined) updateData.categories = resolvedCategoriesUpdate;

    // Normalize skills for update
    if (rawSkillsUpdate !== undefined) {
      const arr = Array.isArray(rawSkillsUpdate) ? rawSkillsUpdate : (typeof rawSkillsUpdate === "string" ? rawSkillsUpdate.split(",").map((s: string) => s.trim()) : [rawSkillsUpdate]);
      updateData.skills = arr.filter(Boolean);
    }

    if (featured !== undefined) updateData.featured = featured === "true" || featured === true;
    if (newArrival !== undefined) updateData.newArrival = newArrival === "true" || newArrival === true;
    if (bestSeller !== undefined) updateData.bestSeller = bestSeller === "true" || bestSeller === true;
    if (isActive !== undefined) updateData.isActive = isActive === "true" || isActive === true;
    if (hasVariants !== undefined) updateData.hasVariants = hasVariants === "true" || hasVariants === true;
    if (stock !== undefined) updateData.stock = safeNum(stock);

    if (hasWarranty !== undefined) updateData.hasWarranty = hasWarranty === "true" || hasWarranty === true;
    if (warrantyPeriod !== undefined) updateData.warrantyPeriod = safeNum(warrantyPeriod);
    if (hasGuarantee !== undefined) updateData.hasGuarantee = hasGuarantee === "true" || hasGuarantee === true;
    if (guaranteePeriod !== undefined) updateData.guaranteePeriod = safeNum(guaranteePeriod);

    if (imageUrls.length > 0) {
      updateData.image = imageUrls[0];
      updateData.images = imageUrls;
    }

    // Replace undefined variables with properties from req.body or existing Product if needed, particularly for pricing
    if (price !== undefined || originalPrice !== undefined) {
      const p = price !== undefined ? safeNum(price) : existingProduct.price;
      const op = originalPrice !== undefined ? safeNum(originalPrice) : existingProduct.originalPrice;
      updateData.price = p;
      updateData.originalPrice = op;
      updateData.discountPercentage = op > 0 && op > p ? Math.round(((op - p) / op) * 100) : 0;
    }

    // Enforce variants rule
    const finalHasVariants = hasVariants !== undefined ? updateData.hasVariants : existingProduct.hasVariants;
    if (finalHasVariants) updateData.stock = 0;

    // Clean up undefined fields so they don't overwrite existing values in MongoDB
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    // CRITICAL: Never overwrite the variants array during product update.
    // Variants are managed exclusively by variant CRUD endpoints and syncDefaultVariant.
    delete updateData.variants;

    const product = await productService.updateProduct(id, updateData);

    // Sync default variant with parent product data
    // Default variants are fully dependent on the product — they cannot be edited independently
    if (finalHasVariants) {
      const variantSyncData: any = {};
      if (price !== undefined) variantSyncData.price = safeNum(price);
      if (originalPrice !== undefined) variantSyncData.originalPrice = safeNum(originalPrice);
      if (stock !== undefined) variantSyncData.stock = safeNum(stock);
      if (imageUrls.length > 0) variantSyncData.images = imageUrls;
      if (youtubeUrl !== undefined) variantSyncData.youtubeUrl = youtubeUrl;
      if (isActive !== undefined) {
        variantSyncData.status = (isActive === "true" || isActive === true) ? "active" : "inactive";
      }

      if (Object.keys(variantSyncData).length > 0) {
        await variantService.syncDefaultVariant(id, variantSyncData);
      }
    }

    await CacheService.delPattern("products:page:*");
    await CacheService.del(`product:${id}:admin`);
    await CacheService.del(`product:${id}:public`);
    await CacheService.del("products:filters");

    // Re-fetch with populated variants/categories so the response
    // includes updated variant stock values for the frontend
    const populatedProduct = await productService.getProductById(id, true);

    return sendSuccessResponse(res, 200, "Product updated successfully", populatedProduct);
  },
);

export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    const deleted = await productService.deleteProductById(id);
    if (!deleted) {
      throw new AppError("Product not found", 404);
    }

    await CacheService.delPattern("products:page:*");
    await CacheService.del(`product:${id}:admin`);
    await CacheService.del(`product:${id}:public`);
    await CacheService.del("products:filters");

    return sendSuccessResponse(res, 200, "Product deleted successfully", null);
  },
);

/**
 * Reorder products (bulk position update)
 * PUT /api/products/reorder
 * MED-5 FIX: Validate each item.id as ObjectId and item.position as non-negative integer
 */
export const reorderProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Items array is required", 400);
    }

    // Validate every item before bulk write
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.id || !mongoose.isValidObjectId(item.id)) {
        throw new AppError(`Invalid product ID at index ${i}: "${item.id}"`, 400);
      }
      const pos = Number(item.position);
      if (!Number.isInteger(pos) || pos < 0) {
        throw new AppError(`position at index ${i} must be a non-negative integer`, 400);
      }
    }

    const bulkOps = items.map((item: any) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { position: Number(item.position) } },
      },
    }));

    await Product.bulkWrite(bulkOps);
    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 200, "Products reordered successfully", null);
  },
);
