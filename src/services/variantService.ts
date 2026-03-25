import ProductVariant, { IProductVariant } from "../models/variants";
import Product from "../models/products";
import mongoose from "mongoose";
import AppError from "../utils/appError";
import { deleteFromCloudinary, extractPublicId } from "../utils/uploadToCloudinary";

class VariantService {
  async getVariantsByProductId(productId: string, isAdmin: boolean = false) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError("Invalid product ID format", 400);
    }

    const filter: any = { product: new mongoose.Types.ObjectId(productId) };
    
    // If not admin, only show active variants
    if (!isAdmin) {
      filter.status = "active";
    }

    const variants = await ProductVariant.find(filter);
    console.log(`Fetched ${variants.length} variants for product ${productId} (isAdmin: ${isAdmin})`);
    
    return variants;
  }

  async getVariantById(id: string) {
    return await ProductVariant.findById(id);
  }

  async createVariant(variantData: Partial<IProductVariant>) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const variant = await ProductVariant.create([variantData], { session });
      const createdVariant = variant[0];

      const product = await Product.findById(variantData.product).session(session);
      if (!product) {
        throw new AppError("Product not found", 404);
      }

      // Update product metadata
      if (!product.hasVariants) {
        product.hasVariants = true;
        product.stock = 0; // If it has variants, base product stock should be 0 or managed by variants
      }
      
      product.variants = product.variants || [];
      product.variants.push(createdVariant._id as any);
      await product.save({ session });

      await session.commitTransaction();
      return createdVariant;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async updateVariant(id: string, updateData: Partial<IProductVariant>) {
    const variant = await ProductVariant.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!variant) {
      throw new AppError("Variant not found", 404);
    }
    return variant;
  }

  async deleteVariantById(id: string) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const variant = await ProductVariant.findById(id).session(session);
      if (!variant) {
        throw new AppError("Variant not found", 404);
      }

      // 1. Remove from Product's variants array
      const product = await Product.findById(variant.product).session(session);
      if (product) {
        product.variants = product.variants?.filter(
          (vId) => vId.toString() !== id
        ) || [];
        
        if (product.variants.length === 0) {
          product.hasVariants = false;
        }
        await product.save({ session });
      }

      // 2. Delete variant images from Cloudinary
      if (variant.images && variant.images.length > 0) {
        for (const imageUrl of variant.images) {
          const publicId = extractPublicId(imageUrl);
          if (publicId) {
            try {
              await deleteFromCloudinary(publicId, "image");
            } catch (error) {
              console.error(`Failed to delete variant image ${publicId}:`, error);
            }
          }
        }
      }

      // 3. Delete the variant document
      await ProductVariant.findByIdAndDelete(id).session(session);

      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async deleteVariantsByProductId(productId: string) {
    const variants = await ProductVariant.find({ product: productId });
    for (const variant of variants) {
      // Delete images
      if (variant.images && variant.images.length > 0) {
        for (const imageUrl of variant.images) {
          const publicId = extractPublicId(imageUrl);
          if (publicId) {
            await deleteFromCloudinary(publicId, "image");
          }
        }
      }
    }
    await ProductVariant.deleteMany({ product: productId });
  }
}

export const variantService = new VariantService();
