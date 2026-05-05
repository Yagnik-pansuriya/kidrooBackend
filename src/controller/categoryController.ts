import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { categoryService } from "../services/categoryService";
import mongoose from "mongoose";

/**
 * Get All Categories
 * GET /api/categories
 */
export const getAllCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const cacheKey = "categories";

    const cachedCategories = await CacheService.get(cacheKey);

    if (cachedCategories) {
      return sendSuccessResponse(res, 200, "Categories fetched successfully", cachedCategories);
    }

    const categories = await categoryService.getAllCategories();

    await CacheService.set(cacheKey, categories);

    return sendSuccessResponse(res, 200, "Categories fetched successfully", categories);
  }
);

export const getCategoryById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      return sendErrorResponse(res, 400, "Invalid category ID format");
    }

    const cacheKey = `category:${id}`;

    const cachedCategory = await CacheService.get(cacheKey);

    if (cachedCategory) {
      return sendSuccessResponse(res, 200, "Category fetched successfully", cachedCategory);
    }

    const category = await categoryService.getCategoryById(id);
    
    if(!category) {
      return sendErrorResponse(res, 404, "Category not found");
    }

    await CacheService.set(cacheKey, category);

    return sendSuccessResponse(res, 200, "Category fetched successfully", category);
  }
);

/**
 * Get category by slug
 * GET /api/categories/slug/:slug
 */
export const getCategoryBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;

    if (!slug || !slug.trim()) {
      return sendErrorResponse(res, 400, "Slug is required");
    }

    const cacheKey = `category:slug:${slug}`;

    const cachedCategory = await CacheService.get(cacheKey);

    if (cachedCategory) {
      return sendSuccessResponse(res, 200, "Category fetched successfully", cachedCategory);
    }

    const category = await categoryService.getCategoryBySlug(slug);

    if (!category) {
      return sendErrorResponse(res, 404, "Category not found");
    }

    await CacheService.set(cacheKey, category);

    return sendSuccessResponse(res, 200, "Category fetched successfully", category);
  }
);

/**
 * Create a new category
 */
export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    let {
      catagoryName,
      slug,
      count,
      icon, 
      image 
    } = req.body;

    let imageUrl = image;
    let iconUrl = icon;

    // files from multer upload.fields
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    if (files?.image && files.image.length > 0) {
      const file = files.image[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/categories",
          public_id: `${slug || "category"}-img-${Date.now()}`,
          resource_type: "image",
        });
        imageUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (uploadError: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload category image: ${uploadError.message}`, 500);
      }
    }

    if (files?.icon && files.icon.length > 0) {
      const file = files.icon[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/categories/icons",
          public_id: `${slug || "category"}-icon-${Date.now()}`,
          resource_type: "image",
        });
        iconUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (uploadError: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload category icon: ${uploadError.message}`, 500);
      }
    }

    const category = await categoryService.createCategory({
      catagoryName,
      slug,
      count: count ? Number(count) : 0,
      icon: iconUrl,
      image: imageUrl,
    });

    // clear cache
    await CacheService.del("categories");

    return sendSuccessResponse(res, 201, "Category created successfully", category);
  }
);

/**
 * Update category with optional new image/icon
 */
export const updateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }

    const existingCategory = await categoryService.getCategoryById(id);
    if (!existingCategory) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (files?.image && files.image.length > 0 && fs.existsSync(files.image[0].path)) fs.unlinkSync(files.image[0].path);
      if (files?.icon && files.icon.length > 0 && fs.existsSync(files.icon[0].path)) fs.unlinkSync(files.icon[0].path);
      throw new AppError("Category not found", 404);
    }

    let {
      catagoryName,
      slug,
      count,
      icon, 
      image 
    } = req.body;

    let imageUrl = image;
    let iconUrl = icon;
    let newImageUploaded = false;
    let newIconUploaded = false;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    if (files?.image && files.image.length > 0) {
      newImageUploaded = true;
      const file = files.image[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/categories",
          public_id: `${slug || "category"}-img-${Date.now()}`,
          resource_type: "image",
        });
        imageUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (error: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload new category image: ${error.message}`, 500);
      }
    }

    if (files?.icon && files.icon.length > 0) {
      newIconUploaded = true;
      const file = files.icon[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/categories/icons",
          public_id: `${slug || "category"}-icon-${Date.now()}`,
          resource_type: "image",
        });
        iconUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (error: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload new category icon: ${error.message}`, 500);
      }
    }

    const updateData: any = {
      catagoryName,
      slug,
    };

    if (count !== undefined) {
      const n = Number(count);
      updateData.count = isNaN(n) ? 0 : n;
    }
    if (imageUrl !== undefined) updateData.image = imageUrl;
    if (iconUrl !== undefined) updateData.icon = iconUrl;

    // Clean up undefined fields dynamically
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const category = await categoryService.updateCategory(id, updateData);

    // Delete OLD images from Cloudinary ONLY IF we successfully uploaded NEW images and updated DB
    if (newImageUploaded && existingCategory.image) {
      const publicId = extractPublicId(existingCategory.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch(e) {}
      }
    }
    if (newIconUploaded && existingCategory.icon) {
      const publicId = extractPublicId(existingCategory.icon);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch(e) {}
      }
    }

    // clear cache
    await CacheService.del("categories");
    await CacheService.del(`category:${id}`);
    if (existingCategory.slug) {
      await CacheService.del(`category:slug:${existingCategory.slug}`);
    }
    if (slug && slug !== existingCategory.slug) {
      await CacheService.del(`category:slug:${slug}`);
    }

    return sendSuccessResponse(res, 200, "Category updated successfully", category);
  }
);

/**
 * Delete category and cleanup images from Cloudinary
 */
export const deleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid category ID format", 400);
    }

    const category = await categoryService.getCategoryById(id);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    // Delete image from Cloudinary
    if (category.image) {
      const publicId = extractPublicId(category.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (error) {
          console.error(`Failed to delete category image ${publicId} from Cloudinary:`, error);
        }
      }
    }

    // Delete icon from Cloudinary
    if (category.icon) {
      const publicId = extractPublicId(category.icon);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (error) {
          console.error(`Failed to delete category icon ${publicId} from Cloudinary:`, error);
        }
      }
    }

    // Delete from database
    await categoryService.deleteCategoryById(id);

    // Normalize positions after delete to close gaps (0, 1, 2, 3, …)
    const Category = (await import("../models/categories")).default;
    const remaining = await Category.find({})
      .select("_id")
      .sort({ position: 1, _id: 1 })
      .lean();

    if (remaining.length > 0) {
      const bulkOps = remaining.map((c: any, i: number) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { position: i } },
        },
      }));
      await Category.bulkWrite(bulkOps);
    }

    // clear cache
    await CacheService.del("categories");
    await CacheService.del(`category:${id}`);
    if (category.slug) {
      await CacheService.del(`category:slug:${category.slug}`);
    }

    return sendSuccessResponse(res, 200, "Category deleted successfully", null);
  }
);

/**
 * Reorder categories (bulk position update)
 * PUT /api/categories/reorder
 */
export const reorderCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Items array is required", 400);
    }

    const categories = await categoryService.reorderCategories(items);

    // clear cache
    await CacheService.del("categories");

    return sendSuccessResponse(res, 200, "Categories reordered successfully", categories);
  }
);

/**
 * Move a single category to a specific global position
 * PUT /api/categories/move-position
 * Body: { id: string, targetPosition: number }
 *
 * Uses a "fetch all → remove → insert → normalize" approach to guarantee
 * sequential, gap-free, duplicate-free positions.
 */
export const moveCategoryPosition = asyncHandler(
  async (req: Request, res: Response) => {
    const { id, targetPosition } = req.body;

    if (!id || !mongoose.isValidObjectId(id)) {
      throw new AppError("Valid category ID is required", 400);
    }

    const pos = Number(targetPosition);
    if (!Number.isInteger(pos) || pos < 0) {
      throw new AppError("targetPosition must be a non-negative integer", 400);
    }

    const Category = (await import("../models/categories")).default;

    // 1. Get ALL categories sorted by current position
    const allCategories = await Category.find({})
      .select("_id position")
      .sort({ position: 1, _id: 1 })
      .lean();

    // 2. Find the moving item and remove it from the array
    const currentIdx = allCategories.findIndex(
      (c: any) => c._id.toString() === id
    );
    if (currentIdx === -1) {
      throw new AppError("Category not found", 404);
    }

    const [movingItem] = allCategories.splice(currentIdx, 1);

    // 3. Clamp target position to valid range (0 to remaining length)
    const clampedPos = Math.min(pos, allCategories.length);

    // 4. Insert at the target position
    allCategories.splice(clampedPos, 0, movingItem);

    // 5. Bulk update ALL positions to 0, 1, 2, 3, …
    const bulkOps = allCategories.map((c: any, i: number) => ({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { position: i } },
      },
    }));

    await Category.bulkWrite(bulkOps);

    // Clear cache
    await CacheService.del("categories");

    // Return updated list
    const updatedCategories = await categoryService.getAllCategories();
    return sendSuccessResponse(res, 200, "Category moved successfully", updatedCategories);
  }
);
