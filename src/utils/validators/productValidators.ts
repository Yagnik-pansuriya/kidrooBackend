import { z } from "zod";

const booleanPreprocess = (val: any) => {
  if (typeof val === "string") return val === "true";
  return Boolean(val);
};

const addWarrantyGuaranteeValidation = (
  schema: z.ZodTypeAny,
) =>
  schema.superRefine((data: any, ctx) => {
    if (data.hasWarranty) {
      if (!data.warrantyPeriod || data.warrantyPeriod <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Warranty period is required and must be greater than 0 when hasWarranty is true",
          path: ["warrantyPeriod"],
        });
      }
      if (!data.warrantyType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Warranty type is required when hasWarranty is true",
          path: ["warrantyType"],
        });
      }
    }
    if (data.hasGuarantee) {
      if (!data.guaranteePeriod || data.guaranteePeriod <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Guarantee period is required and must be greater than 0 when hasGuarantee is true",
          path: ["guaranteePeriod"],
        });
      }
    }
  });

const productBodySchema = z.object({
  productName: z.string().min(1, "Product name is required"),
  slug: z.string().optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  originalPrice: z.coerce.number().min(0).optional(),
  // discountPercentage is auto-calculated — not writable
  // ratings and numReviews are system-managed — not writable
  stock: z.coerce.number().min(0).optional(),
  // Accept single category string (legacy) OR array of category IDs
  category: z.string().optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  // MED-9/LOW-4 FIX: skills was missing — ObjectId strings
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  featured: z.preprocess(booleanPreprocess, z.boolean().optional()),
  newArrival: z.preprocess(booleanPreprocess, z.boolean().optional()),
  bestSeller: z.preprocess(booleanPreprocess, z.boolean().optional()),
  isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
  hasVariants: z.preprocess(booleanPreprocess, z.boolean().optional()),
  youtubeUrl: z.string().optional(),
  ageRange: z.any().optional(),
  tags: z.any().optional(),
  hasWarranty: z.preprocess(booleanPreprocess, z.boolean().optional()),
  // LOW-3 FIX: min(1) enforced at Zod level (not only in superRefine)
  warrantyPeriod: z.coerce.number().min(1, "Warranty period must be at least 1").optional(),
  warrantyType: z.enum(["manufacturer", "seller"]).optional(),
  hasGuarantee: z.preprocess(booleanPreprocess, z.boolean().optional()),
  // LOW-3 FIX: min(1) enforced at Zod level
  guaranteePeriod: z.coerce.number().min(1, "Guarantee period must be at least 1").optional(),
  guaranteeTerms: z.string().optional(),
});

const updateProductBodySchema = z.object({
  productName: z.string().min(1, "Product name is required").optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive").optional(),
  originalPrice: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().min(0).optional(),
  category: z.string().optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  // MED-9/LOW-4 FIX: skills field added
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  featured: z.preprocess(booleanPreprocess, z.boolean().optional()),
  newArrival: z.preprocess(booleanPreprocess, z.boolean().optional()),
  bestSeller: z.preprocess(booleanPreprocess, z.boolean().optional()),
  isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
  hasVariants: z.preprocess(booleanPreprocess, z.boolean().optional()),
  youtubeUrl: z.string().optional(),
  ageRange: z.any().optional(),
  tags: z.any().optional(),
  hasWarranty: z.preprocess(booleanPreprocess, z.boolean().optional()),
  // LOW-3 FIX: min(1) enforced at Zod level
  warrantyPeriod: z.coerce.number().min(1, "Warranty period must be at least 1").optional(),
  warrantyType: z.enum(["manufacturer", "seller"]).optional(),
  hasGuarantee: z.preprocess(booleanPreprocess, z.boolean().optional()),
  // LOW-3 FIX: min(1) enforced at Zod level
  guaranteePeriod: z.coerce.number().min(1, "Guarantee period must be at least 1").optional(),
  guaranteeTerms: z.string().optional(),
});

export const createProductSchema = z.object({
  body: addWarrantyGuaranteeValidation(productBodySchema),
});

export const updateProductSchema = z.object({
  body: addWarrantyGuaranteeValidation(updateProductBodySchema),
});
