import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { productService } from "../services/productService";
import mongoose from "mongoose";
import Product from "../models/products";

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
        "product fetched SuccessFully",
        cachedProducts,
      );
    }

    const products = await productService.getAllProducts(req.query);

    await CacheService.set(cacheKey, products);

    return sendSuccessResponse(
      res,
      200,
      "product fetched SuccessFully",
      products,
    );
  },
);

export const getProductById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      return sendErrorResponse(res, 400, "Invalid product ID format");
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

    const product = await productService.getProductById(id);
    if (!product) {
      return sendErrorResponse(res, 404, "Product not found");
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
      images,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
    } = req.body;

    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = tags.split(",");
      }
    }

    if (typeof ageRange === "string") {
      try {
        ageRange = JSON.parse(ageRange);
      } catch {}
    }

    if (category && !mongoose.isValidObjectId(category)) {
      throw new AppError("Invalid category ID", 400);
    }

    // slug unique
    const existingSlug = await Product.findOne({ slug });

    if (existingSlug) {
      throw new AppError("Slug already exists", 400);
    }

    // discount calculate
    const discountPercentage =
      originalPrice > 0
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0;

    // stock rule
    if (hasVariants) {
      stock = 0;
    }

    let imageUrls: string[] = [];

    const files = req.files as Express.Multer.File[];

    if (files?.length) {
      for (const file of files) {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/products",
        });

        imageUrls.push(result.url);

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    if (!imageUrls.length) {
      throw new AppError("Image required", 400);
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
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
      hasVariants,
    });

    await CacheService.delPattern("products:*");

    return sendSuccessResponse(res, 201, "Product created", product);
  },
);

export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    const existingProduct = await productService.getProductById(id);
    if (!existingProduct) {
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        files.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }
      throw new AppError("Product not found", 404);
    }

    let {
      productName,
      slug,
      description,
      price,
      originalPrice,
      discountPercentage,
      stock,
      category,
      image,
      images,
      ratings,
      numReviews,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
    } = req.body;

    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = tags.split(",");
      }
    }
    if (typeof ageRange === "string") {
      try {
        ageRange = JSON.parse(ageRange);
      } catch {}
    }
    if (typeof images === "string") {
      try {
        images = JSON.parse(images);
      } catch {}
    }

    if (category && !mongoose.isValidObjectId(category)) {
      throw new AppError("Invalid category ID format", 400);
    }

    let imageUrls: string[] = [];
    const files = req.files as Express.Multer.File[] | undefined;

    let hasNewImages = false;

    if (files && files.length > 0) {
      hasNewImages = true;
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/products",
            public_id: `${slug || "product"}-${Date.now()}`,
            resource_type: "image",
            quality: "auto",
          });
          imageUrls.push(result.url);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (error: any) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(
            `Failed to upload replacement image: ${error.message}`,
            500,
          );
        }
      }
    }

    const updateData: any = {
      productName,
      slug,
      description,
      price,
      originalPrice,
      discountPercentage,
      stock,
      category,
      ratings,
      numReviews,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
    };

    if (imageUrls.length > 0) {
      updateData.image = imageUrls[0];
      updateData.images = imageUrls;
    } else {
      if (image !== undefined) updateData.image = image;
      if (images !== undefined) updateData.images = images;
    }

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key],
    );

    const product = await productService.updateProduct(id, updateData);

    if (
      hasNewImages &&
      existingProduct.images &&
      existingProduct.images.length > 0
    ) {
      for (const oldImgUrl of existingProduct.images) {
        const publicId = extractPublicId(oldImgUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch (e) {
            console.error(`Failed to cleanup old image ${publicId}`);
          }
        }
      }
    } else if (hasNewImages && existingProduct.image) {
      const publicId = extractPublicId(existingProduct.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (e) {
          console.error(`Failed to cleanup old image ${publicId}`);
        }
      }
    }

    await CacheService.delPattern("products:*");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(
      res,
      200,
      "Product updated successfully",
      product,
    );
  },
);

export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    const product = await productService.getProductById(id);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
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
    } else if (product.image) {
      const publicId = extractPublicId(product.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (error) {
          console.error(
            `Failed to delete main image ${publicId} from Cloudinary:`,
            error,
          );
        }
      }
    }
    await productService.deleteProductById(id);

    await CacheService.delPattern("products:*");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(res, 200, "Product deleted successfully", null);
  },
);
