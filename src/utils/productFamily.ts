import Product from "../models/products";

/**
 * Products that share a productCode are colour/size variants of one item
 * (e.g. Hover Ball - Blue / Red / Yellow). Their pages are near-duplicates,
 * so every variant canonicalises to one "primary" page and only that page
 * goes in the sitemap. Primary = lowest position, then oldest _id.
 *
 * Keep in sync with getPrimaryVariant() in frontend ProductDetail.jsx.
 */

const familyKey = (p: any): string => String(p?.productCode || "").trim().toUpperCase();

const comesFirst = (a: any, b: any): boolean => {
  const pa = Number(a.position ?? Number.MAX_SAFE_INTEGER);
  const pb = Number(b.position ?? Number.MAX_SAFE_INTEGER);
  if (pa !== pb) return pa < pb;
  return String(a._id) < String(b._id);
};

/** The primary (canonical) active product of the given product's family. */
export const findPrimaryVariant = async (product: any): Promise<any> => {
  const code = familyKey(product);
  if (!code) return product;
  const primary = await Product.findOne({ productCode: code, isActive: true })
    .select("slug position _id")
    .sort({ position: 1, _id: 1 })
    .lean();
  return primary && comesFirst(primary, product) ? primary : product;
};

/** Filters a product list down to one primary product per family. */
export const onlyPrimaryVariants = <T>(products: T[]): T[] => {
  const primaries = new Map<string, any>();
  for (const p of products as any[]) {
    const code = familyKey(p) || String(p._id);
    const current = primaries.get(code);
    if (!current || comesFirst(p, current)) primaries.set(code, p);
  }
  const keep = new Set(primaries.values());
  return products.filter((p) => keep.has(p));
};
