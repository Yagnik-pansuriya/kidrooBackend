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
      attributes,
      price,
      originalPrice,
      stock,
      lowStockAlert,
      weight,
      dimensions,
      status,
      isDefault,
    } = req.body;

    const files = req.files as Express.Multer.File[] | undefined;

    // Check if product exists first (redundant as service does it but good for early exit/validation)
    const product = await productService.getProductById(productId);
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Upload images
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/variants",
            resource_type: "image",
          });
          imageUrls.push(result.url);
        } catch (error) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw error;
        }
      }
    }

    const variant = await variantService.createVariant({
      product: productId as any,
      sku,
      barcode,
      attributes,
      price,
      originalPrice,
      stock,
      lowStockAlert,
      weight,
      dimensions,
      images: imageUrls,
      status: status || "active",
      isDefault: isDefault || false,
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

    const files = req.files as Express.Multer.File[] | undefined;
    let imageUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/variants",
            resource_type: "image",
          });
          imageUrls.push(result.url);
        } catch (error) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw error;
        }
      }

      // Cleanup old images
      if (existingVariant.images?.length) {
        for (const imgUrl of existingVariant.images) {
          const publicId = extractPublicId(imgUrl);
          if (publicId) await deleteFromCloudinary(publicId, "image");
        }
      }
    }

    const finalUpdateData: any = {
      ...updateData,
      attributes,
      dimensions,
    };

    if (imageUrls.length > 0) {
      finalUpdateData.images = imageUrls;
    }

    // Explicitly prevent stock update here if desired, but as per current flow:
    // if (stock !== undefined) finalUpdateData.stock = stock;

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
