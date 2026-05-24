import { z } from "zod";

export const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(1, "Coupon code is required"),
    description: z.string().min(1, "Description is required"),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce.number().min(0, "Discount value must be positive"),
    minOrderAmount: z.coerce.number().min(0).optional(),
    maxDiscount: z.coerce.number().min(0).nullable().optional(),
    applicableProducts: z.array(z.string()).optional(),
    validFrom: z.string().or(z.date()),
    validTo: z.string().or(z.date()),
    usageLimit: z.coerce.number().min(1).optional(),
    perUserLimit: z.coerce.number().min(1).optional(),
    isActive: z.boolean().optional(),
    visibility: z.enum(["public", "private"]).optional(),
  }),
});

export const updateCouponSchema = z.object({
  body: createCouponSchema.shape.body.partial(),
});

export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(1, "Coupon code is required"),
    cartItems: z.array(
      z.object({
        productId: z.string(),
        quantity: z.coerce.number().min(1),
        price: z.coerce.number().min(0),
      })
    ).min(1, "Cart items are required"),
  }),
});
