import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendSuccessResponse } from "../utils/apiResponse";
import { offerService } from "../services/offerService";
import { parseOfferDate } from "../utils/istDate";
import Offer from "../models/offers";
import mongoose from "mongoose";

type OfferImage = { url: string; altText: string; link: string };

const DISPLAY_TYPES = ["single-banner", "slider", "top-banner", "promo-section"];
const PUBLIC_CACHE_TTL = 120; // seconds — scheduled offers go live within 2 minutes

// ── Helpers ─────────────────────────────────────────────────────

const removeTempFiles = (files?: Express.Multer.File[]) => {
  files?.forEach((f) => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
};

const parseJsonField = (value: any, name: string) => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new AppError(`Invalid ${name} format`, 400); }
};

const parseStringArray = (value: any): string[] => {
  try {
    const arr = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(arr) ? arr.map((v) => (typeof v === "string" ? v : "")) : [];
  } catch {
    return [];
  }
};

const parseValidity = (validity: any) => {
  const from = parseOfferDate(validity?.from, "start");
  const to = parseOfferDate(validity?.to, "end");
  if (!from || !to) throw new AppError("validity.from and validity.to must be valid dates", 400);
  if (to <= from) throw new AppError("Offer end date must be after its start date", 400);
  return { from, to };
};

const toBool = (v: any) => v === true || v === "true";

const uploadOfferImages = async (files: Express.Multer.File[], altTexts: string[], links: string[]) => {
  const uploaded: OfferImage[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const result = await uploadToCloudinary(files[i].path, {
        folder: "kidroo/offers",
        public_id: `offer-${Date.now()}-${i}`,
        resource_type: "image",
        quality: "auto",
      });
      uploaded.push({ url: result.url, altText: altTexts[i] || "", link: links[i] || "" });
    }
  } catch (err: any) {
    // Don't leave half a batch orphaned in Cloudinary
    await deleteImagesIfUnused(uploaded.map((u) => u.url));
    throw new AppError(`Failed to upload image: ${err.message}`, 500);
  } finally {
    removeTempFiles(files);
  }
  return uploaded;
};

/** Delete Cloudinary images unless another offer (e.g. a duplicate) still uses them */
const deleteImagesIfUnused = async (urls: string[]) => {
  for (const url of urls) {
    if (!url) continue;
    const stillUsed = await Offer.exists({ "images.url": url });
    if (stillUsed) continue;
    const publicId = extractPublicId(url);
    if (publicId) {
      try { await deleteFromCloudinary(publicId, "image"); } catch { /* ignore */ }
    }
  }
};

const invalidateOfferCache = async (id?: string) => {
  await Promise.all([
    CacheService.del("offers:all"),
    CacheService.del("offers:active:all"),
    CacheService.delPattern("offers:page:*"),
    id ? CacheService.del(`offer:${id}`) : Promise.resolve(),
  ]);
};

const pickContent = (body: any) => {
  const data: any = {};
  for (const key of ["title", "subtitle", "description", "badgeText", "ctaText", "targetUrl"]) {
    if (body[key] !== undefined) data[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
  }
  return data;
};

const normalizePlacement = (placement: any) => ({
  page: placement.page,
  section: placement.section || "main",
  position: placement.position !== undefined ? Math.max(0, Number(placement.position) || 0) : 1,
});

// ── Public ──────────────────────────────────────────────────────

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
    await CacheService.set(cacheKey, offers, PUBLIC_CACHE_TTL);

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
    await CacheService.set(cacheKey, offers, PUBLIC_CACHE_TTL);

    return sendSuccessResponse(res, 200, "Active offers fetched successfully", offers);
  }
);

/**
 * Record storefront impressions / clicks (batched by the client)
 * POST /api/offers/track
 */
export const trackOfferEvents = asyncHandler(
  async (req: Request, res: Response) => {
    const tracked = await offerService.trackEvents(req.body.events);
    return sendSuccessResponse(res, 200, "Events recorded", { tracked });
  }
);

// ── Admin ───────────────────────────────────────────────────────

/**
 * Get All Offers (Admin) — not cached so view/click counters stay live
 * GET /api/offers
 */
export const getAllOffers = asyncHandler(
  async (req: Request, res: Response) => {
    const { search } = req.query;
    const offers = await offerService.getAllOffers(typeof search === "string" ? search : undefined);
    return sendSuccessResponse(res, 200, "Offers fetched successfully", offers);
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

    const offer = await offerService.getOfferById(id);
    if (!offer) {
      throw new AppError("Offer not found", 404);
    }

    return sendSuccessResponse(res, 200, "Offer fetched successfully", offer);
  }
);

/**
 * Create a new offer with images
 * POST /api/offers
 */
export const createOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const { displayType, isActive } = req.body;

    let placement: any;
    let styling: any;
    let validity: { from: Date; to: Date };
    try {
      if (!DISPLAY_TYPES.includes(displayType)) {
        throw new AppError(`displayType must be one of: ${DISPLAY_TYPES.join(", ")}`, 400);
      }
      placement = parseJsonField(req.body.placement, "placement");
      styling = parseJsonField(req.body.styling, "styling");
      validity = parseValidity(parseJsonField(req.body.validity, "validity"));
      if (!placement?.page) throw new AppError("placement.page is required", 400);
      if (displayType !== "slider" && files.length > 1) {
        throw new AppError("Only 1 image allowed for this display type — choose Slider for multiple images", 400);
      }
    } catch (err) {
      removeTempFiles(files);
      throw err;
    }

    const images = files.length
      ? await uploadOfferImages(files, parseStringArray(req.body.imageAltTexts), parseStringArray(req.body.imageLinks))
      : [];

    const offer = await offerService.createOffer({
      ...pickContent(req.body),
      displayType,
      placement: normalizePlacement(placement),
      images,
      styling: styling || {},
      validity,
      isActive: isActive !== undefined ? toBool(isActive) : true,
    });

    await invalidateOfferCache();

    return sendSuccessResponse(res, 201, "Offer created successfully", offer);
  }
);

/**
 * Update offer
 * PUT /api/offers/:id
 *
 * Images: `existingImages` (JSON [{url, altText, link}]) lists the current images to keep, in order,
 * with edited alt/link; uploaded files are appended after them. Omit `existingImages` to keep all.
 */
export const updateOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const files = (req.files as Express.Multer.File[] | undefined) || [];

    if (!mongoose.isValidObjectId(id)) {
      removeTempFiles(files);
      throw new AppError("Invalid offer ID format", 400);
    }

    const existingOffer = await offerService.getOfferById(id);
    if (!existingOffer) {
      removeTempFiles(files);
      throw new AppError("Offer not found", 404);
    }

    const updateData: any = pickContent(req.body);
    const currentImages: OfferImage[] = (existingOffer.images || []).map((img: any) =>
      typeof img === "string" ? { url: img, altText: "", link: "" } : img
    );
    let keptImages = currentImages;

    try {
      const { displayType, isActive } = req.body;
      if (displayType !== undefined) {
        if (!DISPLAY_TYPES.includes(displayType)) {
          throw new AppError(`displayType must be one of: ${DISPLAY_TYPES.join(", ")}`, 400);
        }
        updateData.displayType = displayType;
      }
      if (req.body.placement !== undefined) {
        const placement = parseJsonField(req.body.placement, "placement");
        if (!placement?.page) throw new AppError("placement.page is required", 400);
        updateData.placement = normalizePlacement(placement);
      }
      if (req.body.styling !== undefined) updateData.styling = parseJsonField(req.body.styling, "styling");
      if (req.body.validity !== undefined) updateData.validity = parseValidity(parseJsonField(req.body.validity, "validity"));
      if (isActive !== undefined) updateData.isActive = toBool(isActive);

      if (req.body.existingImages !== undefined) {
        const requested = parseJsonField(req.body.existingImages, "existingImages");
        if (!Array.isArray(requested)) throw new AppError("existingImages must be an array", 400);
        // Only URLs already on this offer may be kept — no injecting arbitrary images
        const byUrl = new Map(currentImages.map((img) => [img.url, img]));
        keptImages = requested
          .filter((r: any) => r && byUrl.has(r.url))
          .map((r: any) => ({
            url: r.url,
            altText: typeof r.altText === "string" ? r.altText : byUrl.get(r.url)!.altText || "",
            link: typeof r.link === "string" ? r.link : byUrl.get(r.url)!.link || "",
          }));
      }

      const finalType = updateData.displayType || existingOffer.displayType;
      if (finalType !== "slider" && keptImages.length + files.length > 1) {
        throw new AppError("Only 1 image allowed for this display type — remove the current image or choose Slider", 400);
      }
    } catch (err) {
      removeTempFiles(files);
      throw err;
    }

    const newImages = files.length
      ? await uploadOfferImages(files, parseStringArray(req.body.imageAltTexts), parseStringArray(req.body.imageLinks))
      : [];

    const imagesChanged = req.body.existingImages !== undefined || newImages.length > 0;
    if (imagesChanged) updateData.images = [...keptImages, ...newImages];

    const offer = await offerService.updateOffer(id, updateData);

    if (imagesChanged) {
      const keptUrls = new Set(keptImages.map((i) => i.url));
      await deleteImagesIfUnused(currentImages.filter((i) => !keptUrls.has(i.url)).map((i) => i.url));
    }

    await invalidateOfferCache(id);

    return sendSuccessResponse(res, 200, "Offer updated successfully", offer);
  }
);

/**
 * Duplicate an offer as an inactive draft (shares the same images)
 * POST /api/offers/:id/duplicate
 */
export const duplicateOffer = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid offer ID format", 400);
    }

    const source: any = await offerService.getOfferById(id);
    if (!source) throw new AppError("Offer not found", 404);

    const { _id, createdAt, updatedAt, __v, stats, ...rest } = source;
    const copy = await offerService.createOffer({
      ...rest,
      title: `${source.title} (Copy)`.slice(0, 120),
      isActive: false,
      stats: { impressions: 0, clicks: 0 },
    });

    await invalidateOfferCache();

    return sendSuccessResponse(res, 201, "Offer duplicated as an inactive draft", copy);
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

    await invalidateOfferCache();

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

    await offerService.deleteOfferById(id);

    // After the delete, so a duplicate sharing these images keeps them
    await deleteImagesIfUnused((offer.images || []).map((img: any) => img?.url || img));

    await invalidateOfferCache(id);

    return sendSuccessResponse(res, 200, "Offer deleted successfully", null);
  }
);
