import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import ProductVariant from "../models/variants";
import fs from "fs";
import Product from "../models/products";
import { sendSuccessResponse, sendErrorResponse } from "../utils/apiResponse";
import mongoose from "mongoose";
import { CacheService } from "../services/redisCacheService";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/uploadToCloudinary";

const extractPublicId = (url: string) => {
  try {
    const uploadIndex = url.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    const afterUpload = url.substring(uploadIndex + 8);
    const withoutVersion = afterUpload.replace(/^v\d+\//, "");
    const withoutExtension = withoutVersion.substring(
      0,
      withoutVersion.lastIndexOf("."),
    );
    return withoutExtension || withoutVersion;
  } catch (e) {
    return null;
  }
};

export const getVariantsByProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError("Invalid product ID", 400);
    }

    const variants = await ProductVariant.find({
      product: productId as any,
      isActive: true,
    });
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
    const { productId } = req.params;

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

    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError("Invalid product ID", 400);
    }

    const product = await Product.findById(productId);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // SKU unique
    const existingSku = await ProductVariant.findOne({ sku });

    if (existingSku) {
      throw new AppError(`SKU ${sku} already exists`, 400);
    }

    // upload images
    let imageUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/variants",
          resource_type: "image",
        });

        imageUrls.push(result.url);

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // prevent duplicate attributes for same product
    const existingVariant = await ProductVariant.findOne({
      product: productId,
      attributes,
    });

    if (existingVariant) {
      throw new AppError("Variant with same attributes already exists", 400);
    }

    const variant = await ProductVariant.create({
      product: productId as string,

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

    // mark product hasVariants and add variant to product's variants array
    if (!product.hasVariants) {
      product.hasVariants = true;
      product.stock = 0; // important
    }
    product.variants = product.variants || [];
    product.variants.push(variant._id as any);
    await product.save();

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 201, "Variant created", variant);
  },
);

export const updateVariant = asyncHandler(
  async (req: Request, res: Response) => {
    const { variantId } = req.params;

    if (!mongoose.isValidObjectId(variantId)) {
      throw new AppError("Invalid variant ID", 400);
    }

    // Explicitly prevent stock update from this route if you want to force InventoryTransaction usage.
    // However, for admin panel simple editing, we'll allow it. But a warning is placed.
    const { stock, ...updateData } = req.body;

    const variant = await ProductVariant.findByIdAndUpdate(
      variantId,
      updateData, // Note: not updating stock here
      { new: true },
    );

    if (!variant) {
      throw new AppError("Variant not found", 404);
    }

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
    const { variantId } = req.params;

    if (!mongoose.isValidObjectId(variantId)) {
      throw new AppError("Invalid variant ID", 400);
    }

    const variant = await ProductVariant.findById(variantId);

    if (!variant) {
      throw new AppError("Variant not found", 404);
    }

    // Get the product to update its variants array
    const product = await Product.findById(variant.product);

    if (product) {
      // Remove variant ID from product's variants array
      product.variants =
        product.variants?.filter((id) => id.toString() !== variantId) || [];

      // If no variants left, set hasVariants to false
      if (product.variants.length === 0) {
        product.hasVariants = false;
      }

      await product.save();
    }

    // Delete the variant
    await ProductVariant.findByIdAndDelete(variantId);

    // Delete variant images from Cloudinary
    if (variant.images && variant.images.length > 0) {
      for (const imageUrl of variant.images) {
        const publicId = extractPublicId(imageUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch (error) {
            console.error(
              `Failed to delete image ${publicId} from Cloudinary:`,
              error,
            );
          }
        }
      }
    }

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 200, "Variant deleted successfully", null);
  },
);
