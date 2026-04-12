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

    // Non-admin users see everything except explicitly hidden (inactive) variants
    if (!isAdmin) {
      filter.status = { $ne: "inactive" };
    }

    // .lean() returns plain JS objects — attributes (now Mixed type) comes back as-is
    const variants = await ProductVariant.find(filter)
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    console.log(`Fetched ${variants.length} variants for product ${productId} (isAdmin: ${isAdmin})`);
    return variants;
  }


  async getVariantById(id: string) {
    return await ProductVariant.findById(id).lean();
  }


  async createVariant(variantData: Partial<IProductVariant>) {
    // NOTE: No MongoDB transactions here — Atlas M0 (free tier) does NOT support
    // multi-document transactions. We use sequential operations instead.

    // 1. Create the variant document
    const created = await ProductVariant.create(variantData);

    // 2. Update the parent product (non-critical — variant is already saved)
    try {
      await Product.findByIdAndUpdate(
        variantData.product,
        {
          $set:      { hasVariants: true },
          $addToSet: { variants: created._id },
        },
        { new: false }
      );
    } catch (productUpdateError) {
      // The variant IS saved — log but don't fail the whole request
      console.warn(
        `Variant ${created._id} created but failed to update product variants array:`,
        (productUpdateError as Error).message
      );
    }

    return created;
  }



  async updateVariant(id: string, updateData: Partial<IProductVariant> & { stock?: any }) {
    // stock is destructured separately in the controller — re-include it here
    // if it was passed in updateData
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
    // NOTE: No transactions — Atlas M0 does not support multi-document transactions.

    const variant = await ProductVariant.findById(id);
    if (!variant) {
      throw new AppError("Variant not found", 404);
    }

    // 1. Remove from Product's variants array using atomic $pull
    const remainingVariants = await ProductVariant.countDocuments({
      product: variant.product,
      _id: { $ne: variant._id },
    });

    await Product.findByIdAndUpdate(variant.product, {
      $pull: { variants: variant._id },
      ...(remainingVariants === 0 ? { $set: { hasVariants: false } } : {}),
    });

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
    await ProductVariant.findByIdAndDelete(id);
    return true;
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
