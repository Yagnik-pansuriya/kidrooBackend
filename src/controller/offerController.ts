import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendSuccessResponse } from "../utils/apiResponse";
import { offerService } from "../services/offerService";
import mongoose from "mongoose";

/**
 * Get All Offers (Admin)
 * GET /api/offers
 */
export const getAllOffers = asyncHandler(
  async (req: Request, res: Response) => {
    const { search } = req.query;
    const searchTerm = typeof search === "string" ? search : undefined;

    if (!searchTerm) {
      const cached = await CacheService.get("offers:all");
      if (cached) {
        return sendSuccessResponse(res, 200, "Offers fetched successfully", cached);
      }
    }

    const offers = await offerService.getAllOffers(searchTerm);

    if (!searchTerm) {
      await CacheService.set("offers:all", offers);
    }

    return sendSuccessResponse(res, 200, "Offers fetched successfully", offers);
  }
);

/**
 * Get Offers by Page (Public / User-facing)
 * GET /api/offers/page/:page
 */
export const getOffersByPage = asyncHandler(
  async (req: Request, res: Response) => {
    const page = req.params.page as string;
    const section = req.query.section as string | undefined;
    const allowedPages = ["home", "shop", "product", "offers", "custom"];

    if (!allowedPages.includes(page)) {
      throw new AppError(`Invalid page. Must be one of: ${allowedPages.join(", ")}`, 400);
    }

    const cacheKey = `offers:page:${page}${section ? `:${section}` : ""}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return sendSuccessResponse(res, 200, "Offers fetched successfully", cached);
    }

    const offers = await offerService.getOffersByPage(page, section);
    await CacheService.set(cacheKey, offers, 300); // 5 min cache

    return sendSuccessResponse(res, 200, "Offers fetched successfully", offers);
  }
);

/**
 * Get ALL active offers (Public — for /offers page)
 * GET /api/offers/active
 */
export const getActiveOffers = asyncHandler(
  async (req: Request, res: Response) => {
    const cacheKey = "offers:active:all";
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return sendSuccessResponse(res, 200, "Active offers fetched successfully", cached);
    }

    const offers = await offerService.getActiveOffers();
    await CacheService.set(cacheKey, offers, 300);

    return sendSuccessResponse(res, 200, "Active offers fetched successfully", offers);
  }
);

/**
 * Get Offer by ID (Admin)
 * GET /api/offers/:id
 */
export const getOfferById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid offer ID format", 400);
    }

    const cacheKey = `offer:${id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return sendSuccessResponse(res, 200, "Offer fetched successfully", cached);
    }

    const offer = await offerService.getOfferById(id);
    if (!offer) {
      throw new AppError("Offer not found", 404);
    }

    await CacheService.set(cacheKey, offer);

    return sendSuccessResponse(res, 200, "Offer fetched successfully", offer);
  }
);

/**
 * Create a new offer with images
 * POST /api/offers
 */
export const createOffer = asyncHandler(
  async (req: Request, res: Response) => {
    let {
      title,
      subtitle,
      description,
      displayType,
      placement,
      styling,
      targetUrl,
      validity,
      isActive,
    } = req.body;

    if (!title) throw new AppError("title is required", 400);

    const allowedTypes = ["single-banner", "slider", "top-banner", "promo-section"];
    if (!displayType || !allowedTypes.includes(displayType)) {
      throw new AppError(`displayType must be one of: ${allowedTypes.join(", ")}`, 400);
    }

    // Parse JSON strings from FormData
    if (typeof placement === "string") {
      try { placement = JSON.parse(placement); } catch { throw new AppError("Invalid placement format", 400); }
    }
    if (typeof styling === "string") {
      try { styling = JSON.parse(styling); } catch { throw new AppError("Invalid styling format", 400); }
    }
    if (typeof validity === "string") {
      try { validity = JSON.parse(validity); } catch { throw new AppError("Invalid validity format", 400); }
    }

    if (!placement || !placement.page) {
      throw new AppError("placement.page is required", 400);
    }
    if (!validity || !validity.from || !validity.to) {
      throw new AppError("validity.from and validity.to are required", 400);
    }

    // Upload images
    let imageEntries: { url: string; altText: string; link: string }[] = [];
    const files = req.files as Express.Multer.File[] | undefined;

    if (files && files.length > 0) {
      if (displayType !== "slider" && files.length > 1) {
        files.forEach((f) => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
        throw new AppError("Only 1 image allowed for this display type", 400);
      }

      // Parse per-image metadata if provided
      let imageAltTexts: string[] = [];
      let imageLinks: string[] = [];
      try {
        if (req.body.imageAltTexts) imageAltTexts = JSON.parse(req.body.imageAltTexts);
        if (req.body.imageLinks) imageLinks = JSON.parse(req.body.imageLinks);
      } catch { /* ignore parse errors for metadata */ }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/offers",
            public_id: `offer-${Date.now()}-${i}`,
            resource_type: "image",
            quality: "auto",
          });
          imageEntries.push({
            url: result.url,
            altText: imageAltTexts[i] || "",
            link: imageLinks[i] || "",
          });
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (err: any) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(`Failed to upload image: ${err.message}`, 500);
        }
      }
    }

    const offer = await offerService.createOffer({
      title,
      subtitle,
      description,
      displayType,
      placement: {
        page: placement.page,
        section: placement.section || "main",
        position: placement.position !== undefined ? Number(placement.position) : 0,
      },
      images: imageEntries,
      styling: styling || {},
      targetUrl,
      validity,
      isActive: isActive !== undefined ? isActive === "true" || isActive === true : true,
    });

    await CacheService.del("offers:all");
    await CacheService.delPattern("offers:page:*");

    return sendSuccessResponse(res, 201, "Offer created successfully", offer);
  }
);

/**
 * Update offer
 * PUT /api/offers/:id
 */
export const updateOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid offer ID format", 400);
    }

    const existingOffer = await offerService.getOfferById(id);
    if (!existingOffer) {
      const files = req.files as Express.Multer.File[] | undefined;
      if (files) files.forEach((f) => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      throw new AppError("Offer not found", 404);
    }

    let {
      title,
      subtitle,
      description,
      displayType,
      placement,
      styling,
      targetUrl,
      validity,
      isActive,
    } = req.body;

    // Parse JSON strings
    if (typeof placement === "string") {
      try { placement = JSON.parse(placement); } catch { throw new AppError("Invalid placement format", 400); }
    }
    if (typeof styling === "string") {
      try { styling = JSON.parse(styling); } catch { throw new AppError("Invalid styling format", 400); }
    }
    if (typeof validity === "string") {
      try { validity = JSON.parse(validity); } catch { throw new AppError("Invalid validity format", 400); }
    }

    // Upload new images if provided
    let imageEntries: { url: string; altText: string; link: string }[] | undefined;
    const files = req.files as Express.Multer.File[] | undefined;

    if (files && files.length > 0) {
      const currentType = displayType || existingOffer.displayType;
      if (currentType !== "slider" && files.length > 1) {
        files.forEach((f) => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
        throw new AppError("Only 1 image allowed for this display type", 400);
      }

      let imageAltTexts: string[] = [];
      let imageLinks: string[] = [];
      try {
        if (req.body.imageAltTexts) imageAltTexts = JSON.parse(req.body.imageAltTexts);
        if (req.body.imageLinks) imageLinks = JSON.parse(req.body.imageLinks);
      } catch { /* ignore */ }

      imageEntries = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/offers",
            public_id: `offer-${Date.now()}-${i}`,
            resource_type: "image",
            quality: "auto",
          });
          imageEntries.push({
            url: result.url,
            altText: imageAltTexts[i] || "",
            link: imageLinks[i] || "",
          });
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (err: any) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(`Failed to upload image: ${err.message}`, 500);
        }
      }
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (description !== undefined) updateData.description = description;
    if (displayType !== undefined) updateData.displayType = displayType;
    if (placement) updateData.placement = placement;
    if (styling) updateData.styling = styling;
    if (targetUrl !== undefined) updateData.targetUrl = targetUrl;
    if (validity) updateData.validity = validity;
    if (isActive !== undefined) updateData.isActive = isActive === "true" || isActive === true;
    if (imageEntries) updateData.images = imageEntries;

    const offer = await offerService.updateOffer(id, updateData);

    // Cleanup old images from Cloudinary if replaced
    if (imageEntries && existingOffer.images && existingOffer.images.length > 0) {
      for (const oldImg of existingOffer.images) {
        const publicId = extractPublicId((oldImg as any).url || oldImg);
        if (publicId) {
          try { await deleteFromCloudinary(publicId, "image"); } catch { /* ignore */ }
        }
      }
    }

    await CacheService.del("offers:all");
    await CacheService.del(`offer:${id}`);
    await CacheService.delPattern("offers:page:*");

    return sendSuccessResponse(res, 200, "Offer updated successfully", offer);
  }
);

/**
 * Reorder offers on a page
 * PUT /api/offers/reorder
 */
export const reorderOffers = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, orderedIds } = req.body;

    if (!page || !Array.isArray(orderedIds)) {
      throw new AppError("page and orderedIds[] are required", 400);
    }

    const offers = await offerService.reorderOffers(page, orderedIds);

    await CacheService.del("offers:all");
    await CacheService.delPattern("offers:page:*");

    return sendSuccessResponse(res, 200, "Offers reordered successfully", offers);
  }
);

/**
 * Delete offer
 * DELETE /api/offers/:id
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

    // Cleanup images from Cloudinary
    if (offer.images && offer.images.length > 0) {
      for (const img of offer.images) {
        const publicId = extractPublicId((img as any).url || img);
        if (publicId) {
          try { await deleteFromCloudinary(publicId, "image"); } catch { /* ignore */ }
        }
      }
    }

    await offerService.deleteOfferById(id);

    await CacheService.del("offers:all");
    await CacheService.del(`offer:${id}`);
    await CacheService.delPattern("offers:page:*");

    return sendSuccessResponse(res, 200, "Offer deleted successfully", null);
  }
);
