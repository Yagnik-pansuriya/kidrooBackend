import Coupon from "../models/coupon";
import Order from "../models/order";
import mongoose from "mongoose";

class CouponService {
  async getAllCoupons(search?: string, visibility?: string) {
    const filter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ code: regex }, { description: regex }];
    }
    if (visibility === "public" || visibility === "private") {
      filter.visibility = visibility;
    }
    const coupons = await Coupon.find(filter)
      .populate("applicableProducts", "productName slug images price")
      .sort({ createdAt: -1 })
      .lean();

    // Dynamically calculate actual coupon usages from Orders
    const orderCouponCounts = await Order.aggregate([
      { $match: { couponCode: { $exists: true, $nin: [null, ""] }, status: { $ne: "Cancelled" } } },
      { $group: { _id: "$couponCode", count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    orderCouponCounts.forEach((c) => {
      if (c._id) countMap.set(c._id.toString().toUpperCase(), c.count);
    });

    return coupons.map((coupon) => {
      const codeKey = (coupon.code || "").toUpperCase();
      const actualOrderUses = countMap.get(codeKey) || 0;
      const effectiveUsedCount = Math.max(coupon.usedCount || 0, actualOrderUses);
      return {
        ...coupon,
        usedCount: effectiveUsedCount,
      };
    });
  }

  async getPublicCoupons() {
    const now = new Date();
    return Coupon.find({
      visibility: "public",
      isActive: true,
      validFrom: { $lte: now },
      validTo: { $gte: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    })
      .select("-usedBy")
      .sort({ createdAt: -1 })
      .lean();
  }

  async getCouponById(id: string) {
    return Coupon.findById(id)
      .populate("applicableProducts", "productName slug images price")
      .lean();
  }

  async getCouponByCode(code: string) {
    return Coupon.findOne({ code: code.toUpperCase().trim() }).lean();
  }

  async createCoupon(data: any) {
    return Coupon.create(data);
  }

  async updateCoupon(id: string, data: any) {
    return Coupon.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async deleteCoupon(id: string) {
    return Coupon.findByIdAndDelete(id);
  }

  /**
   * Validate a coupon against a customer's cart.
   * Returns { valid, discount, message, applicableItemIds }
   */
  async validateCoupon(
    code: string,
    customerId: string,
    cartItems: { productId: string; quantity: number; price: number }[]
  ) {
    const coupon = await this.getCouponByCode(code);
    if (!coupon) {
      return { valid: false, discount: 0, message: "Invalid coupon code" };
    }

    if (!coupon.isActive) {
      return { valid: false, discount: 0, message: "This coupon is no longer active" };
    }

    const now = new Date();
    if (now < new Date(coupon.validFrom) || now > new Date(coupon.validTo)) {
      return { valid: false, discount: 0, message: "This coupon has expired" };
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, discount: 0, message: "This coupon has reached its usage limit" };
    }

    // Check per-user limit
    const userUsageCount = (coupon.usedBy || []).filter(
      (u: any) => u.customerId?.toString() === customerId
    ).length;
    if (userUsageCount >= coupon.perUserLimit) {
      return { valid: false, discount: 0, message: "You have already used this coupon the maximum number of times" };
    }

    // Determine applicable items
    const hasProductRestriction =
      coupon.applicableProducts && coupon.applicableProducts.length > 0;
    const applicableProductIds = hasProductRestriction
      ? coupon.applicableProducts.map((p: any) => p.toString())
      : null;

    let applicableItemIds: string[] = [];
    let applicableTotal = 0;
    let applicableQuantity = 0;

    for (const item of cartItems) {
      const isApplicable =
        !applicableProductIds || applicableProductIds.includes(item.productId);
      if (isApplicable) {
        applicableItemIds.push(item.productId);
        applicableTotal += item.price * item.quantity;
        applicableQuantity += item.quantity;
      }
    }

    if (applicableItemIds.length === 0) {
      return { valid: false, discount: 0, message: "This coupon is not applicable to any items in your cart" };
    }

    // Check minimum quantity requirement
    if (coupon.minQuantity && applicableQuantity < coupon.minQuantity) {
      return {
        valid: false,
        discount: 0,
        message: `This coupon requires buying at least ${coupon.minQuantity} items`,
      };
    }

    // Check minimum order amount on applicable items
    const cartTotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (coupon.minOrderAmount && cartTotal < coupon.minOrderAmount) {
      return {
        valid: false,
        discount: 0,
        message: `Minimum order amount of ₹${coupon.minOrderAmount} required`,
      };
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (applicableTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      // fixed
      discount = Math.min(coupon.discountValue, applicableTotal);
    }

    discount = Math.round(discount * 100) / 100;

    return {
      valid: true,
      discount,
      message: `Coupon applied! You save ₹${discount}`,
      couponId: (coupon as any)._id,
      applicableItemIds,
      couponCode: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    };
  }

  /**
   * Mark coupon as used after successful order.
   */
  async applyCoupon(couponId: string, customerId: string) {
    return Coupon.findByIdAndUpdate(
      couponId,
      {
        $inc: { usedCount: 1 },
        $push: {
          usedBy: {
            customerId: new mongoose.Types.ObjectId(customerId),
            usedAt: new Date(),
          },
        },
      },
      { new: true }
    );
  }
}

export const couponService = new CouponService();
