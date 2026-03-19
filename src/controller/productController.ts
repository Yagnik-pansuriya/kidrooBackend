// src/controller/productController.ts
import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import fs from "fs";
import path from "path";

// Assuming you have a Product model
// import Product from "../models/product";

/**
 * Create a new product with image uploads
 *
 * Expected form data:
 * - name: string
 * - description: string
 * - price: number
 * - category: string
 * - images: file[] (multiple image files)
 */
export const createProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, description, price, category } = req.body;

    // Validate required fields
    if (!name || !price || !category) {
      throw new AppError(
        "Please provide all required fields: name, price, category",
        400,
      );
    }

    // ========================================
    // CLOUD UPLOAD SECTION
    // ========================================

    let imageUrls: string[] = [];

    try {
      // Get files from multer middleware
      const files = req.files as Express.Multer.File[] | undefined;

      if (files && files.length > 0) {
        console.log(`📤 Uploading ${files.length} images to Cloudinary...`);

        // Upload each image to Cloudinary
        for (const file of files) {
          try {
            const result = await uploadToCloudinary(file.path, {
              folder: "kidroo/products", // Organize in folders
              public_id: `${name}-${Date.now()}`, // Unique name
              resource_type: "image",
              quality: "auto",
              width: 800, // Optional: resize for optimization
              crop: "limit",
            });

            // Store the secure URL
            imageUrls.push(result.url);
            console.log(`✅ Uploaded: ${result.url}`);

            // Delete temporary local file after upload
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (uploadError) {
            console.error(
              `❌ Failed to upload image ${file.originalname}:`,
              uploadError,
            );

            // Clean up on error
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }

            throw new AppError(
              `Failed to upload image: ${file.originalname}`,
              500,
            );
          }
        }
      }
    } catch (error: any) {
      // Clean up any remaining files
      const files = req.files as Express.Multer.File[] | undefined;
      if (files) {
        files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      throw error;
    }

    // ========================================
    // DATABASE SECTION
    // ========================================

    // Create product object
    const productData = {
      name,
      description,
      price: parseFloat(price),
      category,
      images: imageUrls, // Array of Cloudinary URLs
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to database
    // const product = await Product.create(productData);

    // For now, just return the data
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: productData,
    });
  },
);

/**
 * Update product with optional new images
 */
export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, price, category, removeImages } = req.body;

    let imageUrls: string[] = [];

    // Upload new images if provided
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const result = await uploadToCloudinary(file.path, {
            folder: "kidroo/products",
            public_id: `${name || "product"}-${Date.now()}`,
            resource_type: "image",
            quality: "auto",
          });

          imageUrls.push(result.url);

          // Clean up temp file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          throw new AppError("Failed to upload image", 500);
        }
      }
    }

    // Update product
    // const product = await Product.findByIdAndUpdate(
    //   id,
    //   {
    //     name,
    //     description,
    //     price,
    //     category,
    //     ...(imageUrls.length > 0 && { images: imageUrls }), // Only update if new images
    //     updatedAt: new Date(),
    //   },
    //   { new: true }
    // );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      // data: product,
    });
  },
);

/**
 * Delete product and cleanup images from Cloudinary
 */
export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Get product first to get image URLs
    // const product = await Product.findById(id);

    // if (!product) {
    //   throw new AppError("Product not found", 404);
    // }

    // Delete images from Cloudinary
    // if (product.images && product.images.length > 0) {
    //   for (const imageUrl of product.images) {
    //     try {
    //       // Extract public_id from URL
    //       const publicId = imageUrl.split("/").pop()?.split(".")[0];
    //       if (publicId) {
    //         await cloudinary.uploader.destroy(publicId);
    //       }
    //     } catch (error) {
    //       console.error("Failed to delete image from Cloudinary:", error);
    //     }
    //   }
    // }

    // Delete from database
    // await Product.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  },
);
