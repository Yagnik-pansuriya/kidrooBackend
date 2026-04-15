import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { variantService } from "../services/variantService";
import { productService } from "../services/productService";
import { sendSuccessResponse } from "../utils/apiResponse";
import mongoose from "mongoose";
import { CacheService } from "../services/redisCacheService";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../utils/uploadToCloudinary";
import fs from "fs";

export const getVariantsByProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const productId = req.params.productId as string;

    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError("Invalid product ID", 400);
    }

    // Check if requester is admin
    const isAdmin = (req as any).user?.role === "admin";

    const variants = await variantService.getVariantsByProductId(productId, isAdmin);
    
    return sendSuccessResponse(
      res,
      200,
      "Variants fetched successfully",
      variants,
    );
  },
);

export const createVariant = asyncHandler(
  async (req: Request, res: Response) => {
    const productId = req.params.productId as string;

    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError("Invalid product ID", 400);
    }

    const {
      sku,
      barcode,
      price,
      originalPrice,
      stock,
      lowStockAlert,
      weight,
      status,
      isDefault,
      youtubeUrl,
    } = req.body;

    // FormData sends objects as JSON strings — parse them back safely
    const parseJsonField = (field: any) => {
      if (field === undefined || field === null || field === "") return undefined;
      if (typeof field === "object") return field; // already parsed
      if (typeof field === "string") {
        try { return JSON.parse(field); } catch { return undefined; }
      }
      return undefined;
    };

    const attributes = parseJsonField(req.body.attributes);
    const dimensions = parseJsonField(req.body.dimensions);

    // Validate attributes
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
      throw new AppError(
        "attributes is required and must be a JSON object, e.g. {\"Color\":\"Red\",\"Size\":\"Large\"}",
        400
      );
    }

    // Sanitize status — only allow valid enum values
    const validStatuses = ["active", "inactive", "out_of_stock"];
    const safeStatus = validStatuses.includes(status) ? status : "active";

    const files = req.files as Express.Multer.File[] | undefined;

    // Check if product exists first
    const product = await productService.getProductById(productId);
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Upload all images to Cloudinary in PARALLEL (faster, no sequential timeout risk)
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      imageUrls = await Promise.all(
        files.map(async (file) => {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/variants",
            resource_type: "image",
          });
          return result.url;
        })
      );
    }

    const variant = await variantService.createVariant({
      product: productId as any,
      sku: String(sku || "").trim().toUpperCase(),
      barcode,
      attributes,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      stock: stock !== undefined ? Number(stock) : 0,
      lowStockAlert: lowStockAlert ? Number(lowStockAlert) : undefined,
      weight: weight ? Number(weight) : undefined,
      dimensions,
      images: imageUrls,
      status: safeStatus,
      isDefault: isDefault === "true" || isDefault === true,
      youtubeUrl: youtubeUrl || '',
    });

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 201, "Variant created", variant);
  },
);


export const updateVariant = asyncHandler(
  async (req: Request, res: Response) => {
    const variantId = req.params.variantId as string;

    if (!mongoose.isValidObjectId(variantId)) {
      throw new AppError("Invalid variant ID", 400);
    }

    let { stock, attributes, dimensions, ...updateData } = req.body;

    const parseField = (field: any) => {
      if (typeof field === "string") {
        try { return JSON.parse(field); } catch { return field; }
      }
      return field;
    };

    attributes = parseField(attributes);
    dimensions = parseField(dimensions);

    const existingVariant = await variantService.getVariantById(variantId);
    if (!existingVariant) {
      throw new AppError("Variant not found", 404);
    }

    // Upload all new images to Cloudinary in PARALLEL
    const files = req.files as Express.Multer.File[] | undefined;
    let newImageUrls: string[] = [];
    if (files && files.length > 0) {

      newImageUrls = await Promise.all(
        files.map(async (file) => {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/variants",
            resource_type: "image",
          });
          return result.url;
        })
      );
    }

    // Parse existing image URLs the client wants to KEEP
    const parseJsonField = (field: any) => {
      if (!field) return null;
      if (Array.isArray(field)) return field;
      if (typeof field === "string") {
        try { return JSON.parse(field); } catch { return null; }
      }
      return null;
    };
    const existingImages: string[] | null = parseJsonField(req.body.existingImages);

    // Decide the final images array
    let finalImages: string[] | undefined;
    if (existingImages !== null) {
      // Client sent explicit keep list — merge with new uploads
      finalImages = [...existingImages, ...newImageUrls];
    } else if (newImageUrls.length > 0) {
      // No keep list but new files uploaded — replace (old behaviour)
      finalImages = newImageUrls;
    }
    // else: no changes to images at all

    // Delete from Cloudinary any old images that are NOT in the keep list
    if (existingVariant.images?.length && existingImages !== null) {
      for (const imgUrl of existingVariant.images) {
        if (!existingImages.includes(imgUrl)) {
          const publicId = extractPublicId(imgUrl);
          if (publicId) {
            try { await deleteFromCloudinary(publicId, "image"); }
            catch (e) { console.warn("Could not delete old image:", imgUrl); }
          }
        }
      }
    } else if (newImageUrls.length > 0 && existingVariant.images?.length) {
      // Old behaviour: full replacement — delete all old images
      for (const imgUrl of existingVariant.images) {
        const publicId = extractPublicId(imgUrl);
        if (publicId) await deleteFromCloudinary(publicId, "image");
      }
    }



    // Sanitize status if provided
    const validStatuses = ["active", "inactive", "out_of_stock"];
    if (updateData.status && !validStatuses.includes(updateData.status)) {
      updateData.status = "active";
    }

    if (updateData.price !== undefined) updateData.price = Number(updateData.price);
    if (updateData.originalPrice !== undefined) updateData.originalPrice = Number(updateData.originalPrice);
    if (stock !== undefined) updateData.stock = Number(stock);
    if (updateData.lowStockAlert !== undefined) updateData.lowStockAlert = Number(updateData.lowStockAlert);
    if (updateData.weight !== undefined) updateData.weight = Number(updateData.weight);
    if (updateData.isDefault !== undefined) updateData.isDefault = updateData.isDefault === "true" || updateData.isDefault === true;

    const finalUpdateData: any = {
      ...updateData,
      stock,       // include stock if provided
      attributes,
      dimensions,
    };

    if (stock !== undefined) {
      finalUpdateData.stock = Number(stock);
    }

    if (finalImages && finalImages.length > 0) {
      finalUpdateData.images = finalImages;
    }

    const variant = await variantService.updateVariant(variantId, finalUpdateData);

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(
      res,
      200,
      "Variant updated successfully",
      variant,
    );
  },
);

export const deleteVariant = asyncHandler(
  async (req: Request, res: Response) => {
    const variantId = req.params.variantId as string;

    if (!mongoose.isValidObjectId(variantId)) {
      throw new AppError("Invalid variant ID", 400);
    }

    await variantService.deleteVariantById(variantId);

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 200, "Variant deleted successfully", null);
  },
);
