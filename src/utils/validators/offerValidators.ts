import { z } from "zod";

const booleanPreprocess = (val: any) => {
  if (typeof val === "string") return val === "true";
  return Boolean(val);
};

const jsonPreprocess = (val: any) => {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
};

export const createOfferSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    displayType: z.enum(["single-banner", "slider", "top-banner", "promo-section"]),
    placement: z.preprocess(
      jsonPreprocess,
      z.object({
        page: z.enum(["home", "shop", "product", "offers", "custom"]),
        section: z.string().optional(),
        position: z.coerce.number().optional(),
      })
    ),
    styling: z.preprocess(
      jsonPreprocess,
      z.object({
        bgColor: z.string().optional(),
        textColor: z.string().optional(),
        overlayOpacity: z.coerce.number().min(0).max(1).optional(),
      }).optional()
    ).optional(),
    targetUrl: z.string().optional(),
    validity: z.preprocess(
      jsonPreprocess,
      z.object({
        from: z.string().or(z.date()),
        to: z.string().or(z.date()),
      })
    ),
    isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
  }),
});

export const updateOfferSchema = z.object({
  body: createOfferSchema.shape.body.partial(),
});
