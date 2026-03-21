import { z } from "zod";

const booleanPreprocess = (val: any) => {
  if (typeof val === "string") return val === "true";
  return Boolean(val);
};

const validityParsing = (val: any) => {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

export const createOfferSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
    type: z.enum(["slider", "fullscreen-poster", "post", "buyable"]),
    targetUrl: z.string().optional(),
    couponCode: z.string().optional(),
    bgColor: z.string().optional(),
    textColor: z.string().optional(),
    validity: z.preprocess(
      validityParsing,
      z.object({
        from: z.string().or(z.date()),
        to: z.string().or(z.date()),
      })
    ).optional(),
  }),
}).refine((data) => !!data.body.validity, {
  message: "validity format must be a valid JSON with 'from' and 'to'",
  path: ["body", "validity"],
});

export const updateOfferSchema = z.object({
  body: createOfferSchema.shape.body.partial(),
});
