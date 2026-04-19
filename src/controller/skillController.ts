import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../utils/uploadToCloudinary";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";
import { sendSuccessResponse } from "../utils/apiResponse";
import { skillService } from "../services/skillService";
import mongoose from "mongoose";

/**
 * Get All Skills
 * GET /api/skills
 */
export const getAllSkills = asyncHandler(
  async (req: Request, res: Response) => {
    const cacheKey = "skills";

    const cachedSkills = await CacheService.get(cacheKey);
    if (cachedSkills) {
      return sendSuccessResponse(res, 200, "Skills fetched successfully", cachedSkills);
    }

    const skills = await skillService.getAllSkills();
    await CacheService.set(cacheKey, skills);

    return sendSuccessResponse(res, 200, "Skills fetched successfully", skills);
  },
);

/**
 * Get Skill by ID
 * GET /api/skills/:id
 */
export const getSkillById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid skill ID format", 400);
    }

    const cacheKey = `skill:${id}`;
    const cachedSkill = await CacheService.get(cacheKey);
    if (cachedSkill) {
      return sendSuccessResponse(res, 200, "Skill fetched successfully", cachedSkill);
    }

    const skill = await skillService.getSkillById(id);
    if (!skill) {
      throw new AppError("Skill not found", 404);
    }

    await CacheService.set(cacheKey, skill);
    return sendSuccessResponse(res, 200, "Skill fetched successfully", skill);
  },
);

/**
 * Create a new Skill
 * POST /api/skills (multipart — image field)
 */
export const createSkill = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, description } = req.body;

    if (!name || !description) {
      throw new AppError("Name and description are required", 400);
    }

    // Handle image upload
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    let imageUrl = req.body.image || "";

    if (files?.image && files.image.length > 0) {
      const file = files.image[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/skills",
          public_id: `skill-${Date.now()}`,
          resource_type: "image",
        });
        imageUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (error: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload skill image: ${error.message}`, 500);
      }
    }

    if (!imageUrl) {
      throw new AppError("Skill image is required", 400);
    }

    const skill = await skillService.createSkill({
      name,
      description,
      image: imageUrl,
    });

    await CacheService.del("skills");

    return sendSuccessResponse(res, 201, "Skill created successfully", skill);
  },
);

/**
 * Update a Skill
 * PUT /api/skills/:id (multipart — image field)
 */
export const updateSkill = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid skill ID format", 400);
    }

    const existingSkill = await skillService.getSkillById(id);
    if (!existingSkill) {
      throw new AppError("Skill not found", 404);
    }

    const { name, description } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    let imageUrl: string | undefined = undefined;
    let newImageUploaded = false;

    if (files?.image && files.image.length > 0) {
      newImageUploaded = true;
      const file = files.image[0];
      try {
        const result = await uploadToCloudinary(file.path, {
          folder: "kidroo/skills",
          public_id: `skill-${Date.now()}`,
          resource_type: "image",
        });
        imageUrl = result.url;
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (error: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new AppError(`Failed to upload skill image: ${error.message}`, 500);
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (imageUrl !== undefined) updateData.image = imageUrl;

    // Remove undefined fields
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key],
    );

    const skill = await skillService.updateSkill(id, updateData);

    // Delete old image from Cloudinary if a new one was uploaded
    if (newImageUploaded && existingSkill.image) {
      const publicId = extractPublicId(existingSkill.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (e) {}
      }
    }

    await CacheService.del("skills");
    await CacheService.del(`skill:${id}`);

    return sendSuccessResponse(res, 200, "Skill updated successfully", skill);
  },
);

/**
 * Delete a Skill
 * DELETE /api/skills/:id
 */
export const deleteSkill = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid skill ID format", 400);
    }

    const skill = await skillService.getSkillById(id);
    if (!skill) {
      throw new AppError("Skill not found", 404);
    }

    // Delete image from Cloudinary
    if (skill.image) {
      const publicId = extractPublicId(skill.image);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, "image");
        } catch (error) {
          console.error(`Failed to delete skill image ${publicId} from Cloudinary:`, error);
        }
      }
    }

    await skillService.deleteSkillById(id);

    await CacheService.del("skills");
    await CacheService.del(`skill:${id}`);

    return sendSuccessResponse(res, 200, "Skill deleted successfully", null);
  },
);
