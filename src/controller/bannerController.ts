import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId, // MED-2: use centralized helper, removed local duplicate
} from "../utils/uploadToCloudinary";
import fs from "fs";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { bannerService } from "../services/bannerService";
import { CacheService } from "../services/redisCacheService";
import mongoose from "mongoose";

const CACHE_ALL = "banners:all";
const CACHE_ACTIVE = "banners:active";
const cacheKey = (id: string) => `banner:${id}`;

/**
 * GET /api/banners
 * CRIT-4: wrapped in asyncHandler. LOW-8: Redis caching added.
 */
export const getAllBanners = asyncHandler(async (req: Request, res: Response) => {
  const { activeOnly } = req.query;
  const key = activeOnly === "true" ? CACHE_ACTIVE : CACHE_ALL;

  const cached = await CacheService.get(key);
  if (cached) {
    return sendSuccessResponse(res, 200, "Banners fetched successfully", cached);
  }

  const banners =
    activeOnly === "true" ? await bannerService.getActiveBanners() : await bannerService.getAllBanners();

  await CacheService.set(key, banners, 300);
  return sendSuccessResponse(res, 200, "Banners fetched successfully", banners);
});

/**
 * GET /api/banners/:id
 * CRIT-4: wrapped in asyncHandler. LOW-8: Redis caching added.
 */
export const getBannerById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!mongoose.isValidObjectId(id)) {
    return sendErrorResponse(res, 400, "Invalid banner ID");
  }

  const cached = await CacheService.get(cacheKey(id));
  if (cached) {
    return sendSuccessResponse(res, 200, "Banner fetched successfully", cached);
  }

  const banner = await bannerService.getBannerById(id);
  if (!banner) return sendErrorResponse(res, 404, "Banner not found");

  await CacheService.set(cacheKey(id), banner, 300);
  return sendSuccessResponse(res, 200, "Banner fetched successfully", banner);
});

/**
 * POST /api/banners
 * HIGH-7: Now validated by Zod schema in route.
 */
export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  const {
    tag, title, highlightText, italicText, afterText,
    description, buttonText, buttonUrl, isActive, order,
  } = req.body;

  if (!title) throw new AppError("Title is required", 400);

  let imageUrl = "";
  const file = req.file as Express.Multer.File | undefined;
  if (file) {
    try {
      const result = await uploadToCloudinary(file.path, {
        folder: "kidroo/banners",
        public_id: `banner-${Date.now()}`,
        resource_type: "image",
        quality: "auto",
      });
      imageUrl = result.url;
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (err: any) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new AppError(`Image upload failed: ${err.message}`, 500);
    }
  }

  const banner = await bannerService.createBanner({
    tag, title, highlightText, italicText, afterText, description,
    buttonText, buttonUrl,
    isActive: isActive === "true" || isActive === true,
    order: order ? Number(order) : 0,
    image: imageUrl || undefined,
  });

  // Invalidate caches
  await CacheService.del(CACHE_ALL);
  await CacheService.del(CACHE_ACTIVE);

  return sendSuccessResponse(res, 201, "Banner created successfully", banner);
});

/**
 * PUT /api/banners/:id
 */
export const updateBanner = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid banner ID", 400);

  const existing = await bannerService.getBannerById(id);
  if (!existing) throw new AppError("Banner not found", 404);

  const {
    tag, title, highlightText, italicText, afterText,
    description, buttonText, buttonUrl, isActive, order,
  } = req.body;

  let imageUrl: string | undefined;
  const file = req.file as Express.Multer.File | undefined;
  if (file) {
    try {
      const result = await uploadToCloudinary(file.path, {
        folder: "kidroo/banners",
        public_id: `banner-${Date.now()}`,
        resource_type: "image",
        quality: "auto",
      });
      imageUrl = result.url;
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

      if (existing.image) {
        const oldId = extractPublicId(existing.image);
        if (oldId) {
          try { await deleteFromCloudinary(oldId, "image"); } catch {}
        }
      }
    } catch (err: any) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new AppError(`Image upload failed: ${err.message}`, 500);
    }
  }

  const updateData: any = {
    tag, title, highlightText, italicText, afterText, description, buttonText, buttonUrl,
  };

  if (isActive !== undefined) updateData.isActive = isActive === "true" || isActive === true;
  if (order !== undefined) {
    const n = Number(order);
    updateData.order = isNaN(n) ? 0 : n;
  }
  if (imageUrl) updateData.image = imageUrl;

  Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

  const banner = await bannerService.updateBanner(id, updateData);

  // Invalidate caches
  await CacheService.del(CACHE_ALL);
  await CacheService.del(CACHE_ACTIVE);
  await CacheService.del(cacheKey(id));

  return sendSuccessResponse(res, 200, "Banner updated successfully", banner);
});

/**
 * DELETE /api/banners/:id
 */
export const deleteBanner = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid banner ID", 400);

  const banner = await bannerService.getBannerById(id);
  if (!banner) throw new AppError("Banner not found", 404);

  if (banner.image) {
    const publicId = extractPublicId(banner.image);
    if (publicId) {
      try { await deleteFromCloudinary(publicId, "image"); } catch {}
    }
  }

  await bannerService.deleteBanner(id);

  await CacheService.del(CACHE_ALL);
  await CacheService.del(CACHE_ACTIVE);
  await CacheService.del(cacheKey(id));

  return sendSuccessResponse(res, 200, "Banner deleted successfully", null);
});
