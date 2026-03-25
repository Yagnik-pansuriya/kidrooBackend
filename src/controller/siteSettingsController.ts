import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { siteSettingsService } from "../services/siteSettingsService";
import { sendSuccessResponse, sendErrorResponse } from "../utils/apiResponse";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/uploadToCloudinary";
import fs from "fs";

/**
 * Extract public ID from Cloudinary URL
 */
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
 * Get Site Settings
 * GET /api/v1/site-settings
 */
export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await siteSettingsService.getSettings();
  return sendSuccessResponse(res, 200, "Settings fetched successfully", settings);
});

/**
 * Update Site Settings
 * PUT /api/v1/site-settings
 */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const existingSettings = await siteSettingsService.getSettings();
  let { siteName, tagline, contactEmail, contactPhone, themeColors } = req.body;

  // Smartly handle themeColors: parse if string, and ensure it's an object
  let parsedThemeColors = themeColors;
  if (typeof themeColors === "string") {
    try {
      parsedThemeColors = JSON.parse(themeColors);
    } catch (e) {
      console.warn("Failed to parse themeColors JSON, using existing or defaults");
      parsedThemeColors = existingSettings.themeColors;
    }
  }

  // Ensure we have a valid object for themeColors, otherwise fallback to existing
  if (!parsedThemeColors || typeof parsedThemeColors !== "object") {
    parsedThemeColors = existingSettings.themeColors;
  }

  let logoUrl = existingSettings.logo;
  const file = req.file;

  if (file) {
    // Upload new logo
    const result = await uploadToCloudinary(file.path, {
      folder: "kidroo/site-settings",
    });
    logoUrl = result.url;

    // Delete old logo from Cloudinary if it exists
    if (existingSettings.logo) {
      const oldPublicId = extractPublicId(existingSettings.logo);
      if (oldPublicId) {
        try {
          await deleteFromCloudinary(oldPublicId, "image");
        } catch (error) {
          console.error(`Failed to delete old logo ${oldPublicId} from Cloudinary:`, error);
        }
      }
    }

    // Clean up local file (although uploadToCloudinary already does this, safety check)
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }

  const updatedSettings = await siteSettingsService.updateSettings({
    siteName,
    tagline,
    contactEmail,
    contactPhone,
    themeColors: parsedThemeColors,
    logo: logoUrl || "",
  });

  return sendSuccessResponse(res, 200, "Settings updated successfully", updatedSettings);
});
