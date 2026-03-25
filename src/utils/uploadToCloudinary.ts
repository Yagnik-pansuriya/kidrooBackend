import cloudinary from "../config/cloudinary";
import AppError from "./appError";
import fs from "fs";
import path from "path";

interface UploadOptions {
  folder?: string;
  public_id?: string;
  resource_type?: "image" | "auto" | "video" | "raw";
  width?: number;
  height?: number;
  crop?: string;
  quality?: string | number;
}

/**
 * Upload file to Cloudinary
 * @param filePath - Local file path to upload
 * @param options - Cloudinary upload options
 * @returns Upload result with secure URL and public ID
 */
export const uploadToCloudinary = async (
  filePath: string,
  options: UploadOptions = {},
) => {
  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError(`File not found: ${filePath}`, 400);
    }

    // Default options
    const uploadOptions: any = {
      folder: options.folder || "kidroo",
      public_id: options.public_id,
      resource_type: options.resource_type || "auto",
      width: options.width,
      height: options.height,
      crop: options.crop || "limit",
      quality: options.quality || "auto",
    };

    // Remove undefined properties
    Object.keys(uploadOptions).forEach(
      (key) => uploadOptions[key] === undefined && delete uploadOptions[key],
    );

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);

    // Delete temporary file after upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      size: result.bytes,
      format: result.format,
    };
  } catch (error: any) {
    // Clean up temporary file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    throw new AppError(
      `Error uploading file to Cloudinary: ${error.message}`,
      500,
    );
  }
};

/**
 * Delete file from Cloudinary
 * @param publicId - Public ID of the file
 * @param resourceType - Resource type (image, video, raw, etc)
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: string = "image",
) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    if (result.result === "ok" || result.result === "not found") {
      return {
        success: true,
        message: result.result === "ok" ? "File deleted successfully" : "File already deleted or not found",
      };
    } else {
      console.error(`Cloudinary deletion error for ${publicId}:`, result);
      return {
        success: false,
        message: `Failed to delete file: ${result.result}`,
      };
    }
  } catch (error: any) {
    console.error(`Error deleting file from Cloudinary (${publicId}):`, error.message);
    // Don't throw for cleanup operations, just return status
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Get Cloudinary URL with transformations
 * @param publicId - Public ID of the file
 * @param transformations - Transformation options
 */
export const getCloudinaryUrl = (
  publicId: string,
  transformations?: {
    width?: number;
    height?: number;
    crop?: string;
    gravity?: string;
    quality?: string;
  },
) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    throw new AppError("Cloudinary cloud name not configured", 500);
  }

  const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;

  if (!transformations) {
    return `${baseUrl}/${publicId}`;
  }

  // Build transformation string
  const transformationParts = [];

  if (transformations.width)
    transformationParts.push(`w_${transformations.width}`);
  if (transformations.height)
    transformationParts.push(`h_${transformations.height}`);
  if (transformations.crop)
    transformationParts.push(`c_${transformations.crop}`);
  if (transformations.gravity)
    transformationParts.push(`g_${transformations.gravity}`);
  if (transformations.quality)
    transformationParts.push(`q_${transformations.quality}`);

  const transformationString = transformationParts.join(",");

  return `${baseUrl}/${transformationString}/${publicId}`;
};

/**
 * Extract public ID from Cloudinary URL
 * @param url - Cloudinary URL
 * @returns Public ID or null if not found
 */
export const extractPublicId = (url: string) => {
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
