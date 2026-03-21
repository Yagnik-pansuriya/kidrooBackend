import { z } from "zod";

const booleanPreprocess = (val: any) => {
  if (typeof val === "string") return val === "true";
  return Boolean(val);
};

export const createCategorySchema = z.object({
  body: z.object({
    catagoryName: z.string().min(1, "Category name is required"),
    description: z.string().optional(),
    parentCategory: z.string().optional(),
    isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
  }),
});

export const updateCategorySchema = z.object({
  body: createCategorySchema.shape.body.partial(),
});
