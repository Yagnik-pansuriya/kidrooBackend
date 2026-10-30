import mongoose from "mongoose";
import Cart, { ICartItem } from "../models/cart";
import Product from "../models/products";
import ProductVariant from "../models/variants";
import "../models/categories";
import AppError from "../utils/appError";

const MAX_ITEMS = 50;
const MAX_QTY = 99;

const isObjectId = (id: unknown): id is string =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const itemKey = (productId: string, variantId?: string | null) =>
  variantId ? `${productId}_${variantId}` : productId;

class CartService {
  /**
   * Resolve raw cart items into rich items with current product / variant data.
   * Items whose product no longer exists are flagged `unavailable`.
   */
  async buildDetailedItems(items: ICartItem[]) {
    const productIds = items.map((i) => i.product);
    const variantIds = items
      .map((i) => i.variant)
      .filter((v): v is mongoose.Types.ObjectId => !!v);

    const [products, variants] = await Promise.all([
      Product.find({ _id: { $in: productIds } })
        .select(
          "productName slug productCode skuCode image images price originalPrice discountPercentage stock isActive categories ageRange"
        )
        .populate("categories", "catagoryName")
        .lean(),
      variantIds.length
        ? ProductVariant.find({ _id: { $in: variantIds } })
            .select("sku attributes price originalPrice stock images status")
            .lean()
        : Promise.resolve([]),
    ]);

    const productMap = new Map(products.map((p: any) => [String(p._id), p]));
    const variantMap = new Map(variants.map((v: any) => [String(v._id), v]));

    return items.map((item) => {
      const productId = String(item.product);
      const variantId = item.variant ? String(item.variant) : null;
      const product: any = productMap.get(productId) || null;
      const variant: any = variantId ? variantMap.get(variantId) || null : null;

      const price = variant?.price ?? product?.price ?? 0;
      const originalPrice = variant?.originalPrice || product?.originalPrice || price;
      const stock = variant ? variant.stock ?? 0 : product?.stock ?? 0;
      const variantName = variant
        ? Object.values(variant.attributes || {}).join(" / ") || variant.sku || ""
        : "";

      return {
        id: itemKey(productId, variantId),
        productId,
        variantId,
        quantity: item.quantity,
        addedAt: item.addedAt,
        name: product?.productName || "Product unavailable",
        slug: product?.slug || "",
        image: variant?.images?.[0] || product?.images?.[0] || product?.image || "",
        price,
        originalPrice,
        variantName,
        category: product?.categories?.[0]?.catagoryName || "",
        lineTotal: price * item.quantity,
        unavailable: !product || product.isActive === false || variant?.status === "inactive",
        inStock: stock >= item.quantity,
        stock,
        product,
        variant,
      };
    });
  }

  /** Totals for a list of detailed items (unavailable items excluded). */
  computeTotals(detailed: Awaited<ReturnType<CartService["buildDetailedItems"]>>) {
    const available = detailed.filter((i) => !i.unavailable);
    const subtotal = available.reduce((s, i) => s + i.price * i.quantity, 0);
    const mrpTotal = available.reduce((s, i) => s + i.originalPrice * i.quantity, 0);
    return {
      itemCount: detailed.length,
      totalQuantity: detailed.reduce((s, i) => s + i.quantity, 0),
      subtotal,
      mrpTotal,
      savings: Math.max(0, mrpTotal - subtotal),
    };
  }

  // ═════════════════════ CUSTOMER ══════════════════════════════

  async getCustomerCart(customerId: string) {
    const cart = await Cart.findOne({ customer: customerId }).lean();
    if (!cart || !cart.items.length) {
      return { items: [], updatedAt: cart?.updatedAt || null };
    }

    const detailed = await this.buildDetailedItems(cart.items);
    return {
      // Strip heavy admin-only fields for the storefront
      items: detailed
        .filter((i) => !i.unavailable)
        .map(({ product, variant, stock, inStock, unavailable, lineTotal, slug, addedAt, ...rest }) => rest),
      updatedAt: cart.updatedAt,
    };
  }

  /**
   * Replace the customer's cart with the given items (the storefront is the
   * source of truth). Invalid / unknown products are dropped silently.
   */
  async syncCustomerCart(customerId: string, rawItems: unknown) {
    if (!Array.isArray(rawItems)) {
      throw new AppError("items must be an array", 400);
    }
    if (rawItems.length > MAX_ITEMS) {
      throw new AppError(`A cart can contain a maximum of ${MAX_ITEMS} items`, 400);
    }

    // Validate + dedupe by product/variant
    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
    for (const raw of rawItems as any[]) {
      const productId = raw?.productId;
      const variantId = raw?.variantId || null;
      const quantity = Math.floor(Number(raw?.quantity));
      if (!isObjectId(productId)) continue;
      if (variantId !== null && !isObjectId(variantId)) continue;
      if (!Number.isFinite(quantity) || quantity < 1) continue;

      const key = itemKey(productId, variantId);
      const prev = merged.get(key);
      merged.set(key, {
        productId,
        variantId,
        quantity: Math.min(MAX_QTY, (prev?.quantity || 0) + quantity),
      });
    }

    const entries = [...merged.values()];

    // Keep only products / variants that actually exist
    const [existingProducts, existingVariants] = await Promise.all([
      Product.find({ _id: { $in: entries.map((e) => e.productId) } }).select("_id").lean(),
      ProductVariant.find({
        _id: { $in: entries.filter((e) => e.variantId).map((e) => e.variantId) },
      })
        .select("_id product")
        .lean(),
    ]);
    const productSet = new Set(existingProducts.map((p) => String(p._id)));
    const variantProduct = new Map(existingVariants.map((v) => [String(v._id), String(v.product)]));

    const existing = await Cart.findOne({ customer: customerId });
    const previousAddedAt = new Map(
      (existing?.items || []).map((i) => [
        itemKey(String(i.product), i.variant ? String(i.variant) : null),
        i.addedAt,
      ])
    );

    const items: ICartItem[] = entries
      .filter(
        (e) =>
          productSet.has(e.productId) &&
          (!e.variantId || variantProduct.get(e.variantId) === e.productId)
      )
      .map((e) => ({
        product: new mongoose.Types.ObjectId(e.productId),
        variant: e.variantId ? new mongoose.Types.ObjectId(e.variantId) : null,
        quantity: e.quantity,
        addedAt: previousAddedAt.get(itemKey(e.productId, e.variantId)) || new Date(),
      }));

    if (existing) {
      existing.items = items;
      existing.markModified("items");
      await existing.save();
    } else {
      await Cart.create({ customer: customerId, items });
    }

    return this.getCustomerCart(customerId);
  }

  async clearCustomerCart(customerId: string) {
    await Cart.updateOne({ customer: customerId }, { $set: { items: [] } });
  }
}

export const cartService = new CartService();
