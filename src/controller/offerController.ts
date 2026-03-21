import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { offerService } from "../services/offerService";
import mongoose from "mongoose";

// Helper to extract Cloudinary public_id from secure URL
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
 * Get All Offers
 * GET /api/offers
 */
export const getAllOffers = async (req: Request, res: Response) => {
  const { activeOnly } = req.query;
  const cacheKey = activeOnly === "true" ? "offers:active" : "offers:all";

  const cachedOffers = await CacheService.get(cacheKey);

  if (cachedOffers) {
    return sendSuccessResponse(res, 200, "Offers fetched successfully", cachedOffers);
  }

  let offers;
  if (activeOnly === "true") {
    offers = await offerService.getActiveOffers();
  } else {
    offers = await offerService.getAllOffers();
  }

  await CacheService.set(cacheKey, offers);

  return sendSuccessResponse(res, 200, "Offers fetched successfully", offers);
};

export const getOfferById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  
  if (!mongoose.isValidObjectId(id)) {
    return sendErrorResponse(res, 400, "Invalid offer ID format");
  }

  const cacheKey = `offer:${id}`;
  const cachedOffer = await CacheService.get(cacheKey);

  if (cachedOffer) {
    return sendSuccessResponse(res, 200, "Offer fetched successfully", cachedOffer);
  }

  const offer = await offerService.getOfferById(id);
  if (!offer) {
    return sendErrorResponse(res, 404, "Offer not found");
  }

  await CacheService.set(cacheKey, offer);

  return sendSuccessResponse(res, 200, "Offer fetched successfully", offer);
};

/**
 * Create a new offer
 */
export const createOffer = asyncHandler(
  async (req: Request, res: Response) => {
    let {
      title,
      subtitle,
      description,
      discountPercentage,
      validity,
      isActive,
      type,
      targetUrl,
      couponCode,
      bgColor,
      textColor
    } = req.body;

    // Type validation
    const allowedTypes = ["slider", "fullscreen-poster", "post", "buyable"];
    if (!type || !allowedTypes.includes(type)) {
      throw new AppError(`type must be one of: ${allowedTypes.join(", ")}`, 400);
    }

    if (!title) {
        throw new AppError("title is required", 400);
    }

    // Parse validity if it's sent as a stringified JSON
    if (typeof validity === "string") {
      try { validity = JSON.parse(validity); } catch { throw new AppError("Invalid validity format, must be valid JSON", 400); }
    }

    if (!validity || !validity.from || !validity.to) {
        throw new AppError("validity.from and validity.to are required", 400);
    }

    let imageUrls: string[] = [];

    // Get files from multer middleware
    const files = req.files as Express.Multer.File[] | undefined;

    if (files && files.length > 0) {
      console.log(`[INFO] Uploading ${files.length} images to Cloudinary...`);

      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/offers",
            public_id: `offer-${Date.now()}`,
            resource_type: "image",
            quality: "auto",
          });

          imageUrls.push(result.url);

          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (uploadError: any) {
          console.error(`[ERROR] Failed to upload image ${file.originalname}:`, uploadError.message);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(`Failed to upload image: ${uploadError.message}`, 500);
        }
      }
    }

    const offer = await offerService.createOffer({
      title,
      subtitle,
      description,
      discountPercentage,
      validity,
      isActive: isActive !== undefined ? isActive === "true" || isActive === true : true,
      type,
      targetUrl,
      couponCode,
      bgColor,
      textColor,
      image: imageUrls.length > 0 ? imageUrls : undefined,
    });

    await CacheService.del("offers:all");
    await CacheService.del("offers:active");

    return sendSuccessResponse(
      res,
      201,
      "Offer created successfully",
      offer
    );
  }
);

/**
 * Update offer with optional new images
 */
export const updateOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid offer ID format", 400);
    }

    // Fetch existing offer to cleanup old images if replacing
    const existingOffer = await offerService.getOfferById(id);
    if (!existingOffer) {
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      }
      throw new AppError("Offer not found", 404);
    }

    let {
      title,
      subtitle,
      description,
      discountPercentage,
      validity,
      isActive,
      type,
      targetUrl,
      couponCode,
      bgColor,
      textColor
    } = req.body;

    const allowedTypes = ["slider", "fullscreen-poster", "post", "buyable"];
    if (type && !allowedTypes.includes(type)) {
      throw new AppError(`type must be one of: ${allowedTypes.join(", ")}`, 400);
    }

    if (typeof validity === "string") {
      try { validity = JSON.parse(validity); } catch { throw new AppError("Invalid validity format, must be JSON", 400); }
    }

    let imageUrls: string[] = [];
    const files = req.files as Express.Multer.File[] | undefined;
    let hasNewImages = false;

    if (files && files.length > 0) {
      hasNewImages = true;
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/offers",
            public_id: `offer-${Date.now()}`,
            resource_type: "image",
            quality: "auto",
          });
          imageUrls.push(result.url);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (error: any) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(`Failed to upload replacement image: ${error.message}`, 500);
        }
      }
    }

    const updateData: any = {
      title,
      subtitle,
      description,
      discountPercentage,
      validity,
      type,
      targetUrl,
      couponCode,
      bgColor,
      textColor,
    };

    if (isActive !== undefined) {
      updateData.isActive = isActive === "true" || isActive === true;
    }

    if (imageUrls.length > 0) {
      updateData.image = imageUrls;
    }

    // Clean up undefined fields dynamically
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const offer = await offerService.updateOffer(id, updateData);

    // Delete OLD images from Cloudinary ONLY IF we successfully uploaded NEW images and updated DB
    if (hasNewImages && existingOffer.image && Array.isArray(existingOffer.image) && existingOffer.image.length > 0) {
      for (const oldImgUrl of existingOffer.image) {
        const publicId = extractPublicId(oldImgUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch(e) { console.error(`Failed to cleanup old image ${publicId}`); }
        }
      }
    }

    await CacheService.del("offers:all");
    await CacheService.del("offers:active");
    await CacheService.del(`offer:${id}`);

    return sendSuccessResponse(res, 200, "Offer updated successfully", offer);
  }
);

/**
 * Delete offer and cleanup images from Cloudinary
 */
export const deleteOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid offer ID format", 400);
    }

    const offer = await offerService.getOfferById(id);

    if (!offer) {
      throw new AppError("Offer not found", 404);
    }

    // Delete images from Cloudinary
    if (offer.image && Array.isArray(offer.image) && offer.image.length > 0) {
      for (const imageUrl of offer.image) {
        const publicId = extractPublicId(imageUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch (error) {
            console.error(`Failed to delete image ${publicId} from Cloudinary:`, error);
          }
        }
      }
    }

    await offerService.deleteOfferById(id);

    await CacheService.del("offers:all");
    await CacheService.del("offers:active");
    await CacheService.del(`offer:${id}`);

    return sendSuccessResponse(res, 200, "Offer deleted successfully", null);
  }
);
