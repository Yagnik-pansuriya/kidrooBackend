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
    const filters = await productService.getProductFilters();
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

    const cacheKey = `product:${id}`;
    const cachedProduct = await CacheService.get(cacheKey);
    if (cachedProduct) {
      return sendSuccessResponse(
        res,
        200,
        "product fetched SuccessFully",
        cachedProduct,
      );
    }

    const isAdmin = (req as any).user?.role === "admin";
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
      category,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
      youtubeUrl,
    } = req.body;

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

    if (category && !mongoose.isValidObjectId(category)) {
      throw new AppError("Invalid category ID", 400);
    }

    // Slug unique check
    const existingSlug = await Product.findOne({ slug });
    if (existingSlug) {
      throw new AppError("Slug already exists", 400);
    }

    // Discount calculate
    const discountPercentage =
      originalPrice > 0
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0;

    // Stock rule: if hasVariants, stock is handled by variants
    if (hasVariants) stock = 0;

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
      price,
      originalPrice,
      discountPercentage,
      stock,
      category,
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
      hasVariants: true,
      youtubeUrl: youtubeUrl || '',
    } as any);

    // ── Auto-create a default variant ──────────────────────────────
    const autoSku = `${(slug || productName || "PROD").toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 20)}-DEFAULT`;
    await variantService.createVariant({
      product: product._id as any,
      sku: autoSku,
      attributes: new Map([["Type", "Default"]]) as any,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      stock: Number(stock) || 0,
      images: imageUrls,
      status: "active",
      isDefault: true,
      youtubeUrl: youtubeUrl || '',
    });

    await CacheService.delPattern("products:*");

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
      category,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
      youtubeUrl,
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

    if (category && !mongoose.isValidObjectId(category)) {
      throw new AppError("Invalid category ID format", 400);
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

    const updateData: any = {
      productName,
      slug,
      description,
      price,
      originalPrice,
      stock,
      category,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
      youtubeUrl,
    };

    if (imageUrls.length > 0) {
      updateData.image = imageUrls[0];
      updateData.images = imageUrls;
    }

    // Calculate discount if prices changed
    if (price !== undefined || originalPrice !== undefined) {
      const p = price ?? existingProduct.price;
      const op = originalPrice ?? existingProduct.originalPrice;
      updateData.discountPercentage = op > 0 ? Math.round(((op - p) / op) * 100) : 0;
    }

    // Enforce variants rule
    if (hasVariants === true || hasVariants === "true") updateData.stock = 0;

    const product = await productService.updateProduct(id, updateData);

    await CacheService.delPattern("products:*");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(res, 200, "Product updated successfully", product);
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

    await CacheService.delPattern("products:*");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(res, 200, "Product deleted successfully", null);
  },
);
