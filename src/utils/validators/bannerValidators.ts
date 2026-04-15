import { z } from "zod";

/**
 * HIGH-7: Zod schemas for banner endpoints.
 * Prevents unvalidated data from reaching the controller/service layer.
 */

export const createBannerSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required").max(200),
    tag: z.string().max(100).optional(),
    highlightText: z.string().max(200).optional(),
    italicText: z.string().max(200).optional(),
    afterText: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    buttonText: z.string().max(100).optional(),
    buttonUrl: z
      .string()
      .refine((v) => !v || v === "" || /^https?:\/\/.+/.test(v), "Invalid URL format")
      .optional(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
    order: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateBannerSchema = z.object({
  body: createBannerSchema.shape.body.partial(),
});
