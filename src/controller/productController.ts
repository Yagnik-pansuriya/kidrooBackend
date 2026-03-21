// src/controller/productController.ts
import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendErrorResponse, sendSuccessResponse } from "../utils/apiResponse";
import { productService } from "../services/productService";
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
 * Get All Products
 * GET /api/auth/products
 */
export const getAllProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const cacheKey = "products";

    const cachedProducts = await CacheService.get(cacheKey)

    if (cachedProducts) {
      return sendSuccessResponse(res, 200, "product fetched SuccessFully", cachedProducts);
    }

    const products = await productService.getAllProducts()

    await CacheService.set(cacheKey, products)

    return sendSuccessResponse(res, 200, "product fetched SuccessFully", products);
  }
);

export const getProductById = asyncHandler(
  async (req: Request, res: Response) => {

    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      return sendErrorResponse(res, 400, "Invalid product ID format");
    }

    const cacheKey = `product:${id}`

    const cachedProduct = await CacheService.get(cacheKey)

    if (cachedProduct) {
      return sendSuccessResponse(res, 200, "product fetched SuccessFully", cachedProduct);
    }

    const product = await productService.getProductById(id)
  if(!product){
    return sendErrorResponse(res, 404, "Product not found");
  }

    await CacheService.set(cacheKey, product)

    return sendSuccessResponse(res, 200, "product fetched SuccessFully", product);
  }
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

    // Optional string to object/array parsing in case of form-data
    if (typeof tags === "string") {
      try { tags = JSON.parse(tags); } catch { tags = tags.split(","); }
    }
    if (typeof ageRange === "string") {
      try { ageRange = JSON.parse(ageRange); } catch {}
    }
    if (typeof images === "string") {
      try { images = JSON.parse(images); } catch {}
    }

    if (category && !mongoose.isValidObjectId(category)) {
      throw new AppError("Invalid category ID format", 400);
    }

    let imageUrls: string[] = [];

    // Get files from multer middleware
    const files = req.files as Express.Multer.File[] | undefined;

    if (files && files.length > 0) {
      console.log(`[INFO] Uploading ${files.length} images to Cloudinary...`);

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
        } catch (uploadError: any) {
          console.error(`[ERROR] Failed to upload image ${file.originalname}:`, uploadError.message);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          throw new AppError(`Failed to upload image ${file.originalname}: ${uploadError.message}`, 500);
        }
      }
    }

    // Assign URLs correctly
    const finalImage = imageUrls.length > 0 ? imageUrls[0] : image;
    const finalImages = imageUrls.length > 0 ? imageUrls : images;

    if (!finalImage) {
      throw new AppError("At least one image is required for the product", 400);
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
      image: finalImage,
      images: finalImages,
      ratings,
      numReviews,
      featured,
      newArrival,
      bestSeller,
      ageRange,
      tags,
      isActive,
    });

    await CacheService.del("products");

    return sendSuccessResponse(
      res,
      201,
      "Product created successfully",
      product
    );
  }
);

/**
 * Update product with optional new images
 */
export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid product ID format", 400);
    }

    // Fetch existing product to cleanup old images if replacing
    const existingProduct = await productService.getProductById(id);
    if (!existingProduct) {
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
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

    // Parse stringified arrays/objects
    if (typeof tags === "string") {
      try { tags = JSON.parse(tags); } catch { tags = tags.split(","); }
    }
    if (typeof ageRange === "string") {
      try { ageRange = JSON.parse(ageRange); } catch {}
    }
    if (typeof images === "string") {
      try { images = JSON.parse(images); } catch {}
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
          throw new AppError(`Failed to upload replacement image: ${error.message}`, 500);
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

    // If new images were uploaded, override existing images
    if (imageUrls.length > 0) {
      updateData.image = imageUrls[0];
      updateData.images = imageUrls;
    } else {
      if (image !== undefined) updateData.image = image;
      if (images !== undefined) updateData.images = images;
    }

    // Clean up undefined fields dynamically
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const product = await productService.updateProduct(id, updateData);

    // Delete OLD images from Cloudinary ONLY IF we successfully uploaded NEW images and updated DB
    if (hasNewImages && existingProduct.images && existingProduct.images.length > 0) {
      for (const oldImgUrl of existingProduct.images) {
        const publicId = extractPublicId(oldImgUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch(e) { console.error(`Failed to cleanup old image ${publicId}`); }
        }
      }
    } else if (hasNewImages && existingProduct.image) {
      const publicId = extractPublicId(existingProduct.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch(e) { console.error(`Failed to cleanup old image ${publicId}`); }
      }
    }

    await CacheService.del("products");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(res, 200, "Product updated successfully", product);
  }
);

/**
 * Delete product and cleanup images from Cloudinary
 */
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

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
        const publicId = extractPublicId(imageUrl);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, "image");
          } catch (error) {
            console.error(`Failed to delete image ${publicId} from Cloudinary:`, error);
          }
        }
      }
    } else if (product.image) {
      const publicId = extractPublicId(product.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (error) {
          console.error(`Failed to delete main image ${publicId} from Cloudinary:`, error);
        }
      }
    }

    // Delete from database
    await productService.deleteProductById(id);

    await CacheService.del("products");
    await CacheService.del(`product:${id}`);

    return sendSuccessResponse(res, 200, "Product deleted successfully", null);
  }
);