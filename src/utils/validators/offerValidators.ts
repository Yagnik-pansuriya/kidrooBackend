import { z } from "zod";
import { parseOfferDate } from "../istDate";

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

const hexColor = z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Must be a hex colour like #FF6B35");

const validitySchema = z
  .object({
    from: z.string().or(z.date()),
    to: z.string().or(z.date()),
  })
  .superRefine((v, ctx) => {
    const from = parseOfferDate(v.from, "start");
    const to = parseOfferDate(v.to, "end");
    if (!from) ctx.addIssue({ code: "custom", path: ["from"], message: "Invalid start date" });
    if (!to) ctx.addIssue({ code: "custom", path: ["to"], message: "Invalid end date" });
    if (from && to && to <= from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be after start date" });
    }
  });

const offerBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  badgeText: z.string().max(40).optional(),
  ctaText: z.string().max(30).optional(),
  displayType: z.enum(["single-banner", "slider", "top-banner", "promo-section"]),
  placement: z.preprocess(
    jsonPreprocess,
    z.object({
      page: z.enum(["home", "shop", "product", "offers", "custom"]),
      section: z.string().optional(),
      position: z.coerce.number().int().min(0).optional(),
    })
  ),
  styling: z.preprocess(
    jsonPreprocess,
    z.object({
      bgColor: hexColor.optional(),
      textColor: hexColor.optional(),
      overlayOpacity: z.coerce.number().min(0).max(1).optional(),
    }).optional()
  ).optional(),
  targetUrl: z.string().max(500).optional(),
  validity: z.preprocess(jsonPreprocess, validitySchema),
  isActive: z.preprocess(booleanPreprocess, z.boolean().optional()),
});

export const createOfferSchema = z.object({ body: offerBody });

export const updateOfferSchema = z.object({
  body: offerBody.partial(),
});

export const trackOfferSchema = z.object({
  body: z.object({
    events: z
      .array(
        z.object({
          id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid offer id"),
          type: z.enum(["impression", "click"]),
        })
      )
      .min(1)
      .max(50),
  }),
});
