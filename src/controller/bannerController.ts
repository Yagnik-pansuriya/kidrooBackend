import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/uploadToCloudinary";
import fs from "fs";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { bannerService } from "../services/bannerService";
import mongoose from "mongoose";

// Helper to extract Cloudinary public_id from URL
const extractPublicId = (url: string) => {
  try {
    const uploadIndex = url.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    const afterUpload = url.substring(uploadIndex + 8);
    const withoutVersion = afterUpload.replace(/^v\d+\//, "");
    const withoutExtension = withoutVersion.substring(0, withoutVersion.lastIndexOf("."));
    return withoutExtension || withoutVersion;
  } catch(e) { return null; }
};

/**
 * GET /api/banners
 */
export const getAllBanners = async (req: Request, res: Response) => {
  const { activeOnly } = req.query;
  const banners = activeOnly === "true"
    ? await bannerService.getActiveBanners()
    : await bannerService.getAllBanners();
  return sendSuccessResponse(res, 200, "Banners fetched successfully", banners);
};

/**
 * GET /api/banners/:id
 */
export const getBannerById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!mongoose.isValidObjectId(id)) {
    return sendErrorResponse(res, 400, "Invalid banner ID");
  }
  const banner = await bannerService.getBannerById(id);
  if (!banner) return sendErrorResponse(res, 404, "Banner not found");
  return sendSuccessResponse(res, 200, "Banner fetched successfully", banner);
};

/**
 * POST /api/banners
 */
export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  const { tag, title, highlightText, italicText, afterText, description, buttonText, buttonUrl, isActive, order } = req.body;

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

  const { tag, title, highlightText, italicText, afterText, description, buttonText, buttonUrl, isActive, order } = req.body;

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

      // Cleanup old image
      if (existing.image) {
        const oldId = extractPublicId(existing.image);
        if (oldId) {
          try { await deleteFromCloudinary(oldId, "image"); } catch(e) {}
        }
      }
    } catch (err: any) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new AppError(`Image upload failed: ${err.message}`, 500);
    }
  }

  const updateData: any = { tag, title, highlightText, italicText, afterText, description, buttonText, buttonUrl };

  if (isActive !== undefined) updateData.isActive = isActive === "true" || isActive === true;
  if (order !== undefined) updateData.order = Number(order);
  if (imageUrl) updateData.image = imageUrl;

  // Remove undefined keys
  Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

  const banner = await bannerService.updateBanner(id, updateData);
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

  // Cleanup image
  if (banner.image) {
    const publicId = extractPublicId(banner.image);
    if (publicId) {
      try { await deleteFromCloudinary(publicId, "image"); } catch(e) {}
    }
  }

  await bannerService.deleteBanner(id);
  return sendSuccessResponse(res, 200, "Banner deleted successfully", null);
});
