import { z } from "zod";

const booleanPreprocess = (val: any) => {
  if (typeof val === "string") return val === "true";
  return Boolean(val);
};

export const createProductSchema = z.object({
  body: z.object({
    productName: z.string().min(1, "Product name is required"),
    slug: z.string().optional(),
    description: z.string().optional(),
    price: z.coerce.number().min(0, "Price must be positive"),
    originalPrice: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    stock: z.coerce.number().min(0).optional(),
    category: z.string().optional(),
    ratings: z.coerce.number().min(0).max(5).optional(),
    numReviews: z.coerce.number().min(0).optional(),
    featured: z.preprocess(booleanPreprocess, z.boolean().optional()),
    newArrival: z.preprocess(booleanPreprocess, z.boolean().optional()),
    bestSeller: z.preprocess(booleanPreprocess, z.boolean().optional()),
    isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
    youtubeUrl: z.string().optional(),
    ageRange: z.any().optional(),
    tags: z.any().optional(),
  }),
});

export const updateProductSchema = z.object({
  body: createProductSchema.shape.body.partial(),
});
