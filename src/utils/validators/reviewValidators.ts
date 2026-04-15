import { z } from "zod";

/**
 * HIGH-8: Zod schemas for review submission.
 * Enforces correct types and ranges — prevents NaN ratings and empty fields.
 */

export const addReviewSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters"),
    rating: z.coerce
      .number()
      .int("Rating must be a whole number")
      .min(1, "Rating must be at least 1")
      .max(5, "Rating must be at most 5"),
    title: z
      .string()
      .min(3, "Review title must be at least 3 characters")
      .max(120, "Review title must be at most 120 characters"),
    comment: z
      .string()
      .min(10, "Comment must be at least 10 characters")
      .max(1000, "Comment must be at most 1000 characters"),
  }),
  params: z.object({
    productId: z
      .string()
      .refine((id) => /^[a-f\d]{24}$/i.test(id), "Invalid product ID format"),
  }),
});
