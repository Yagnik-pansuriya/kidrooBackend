/**
 * Migration Script: Fix all existing product and category slugs
 *
 * This script connects to the database and re-slugifies all existing
 * product slugs and category slugs to ensure they are clean, lowercase,
 * hyphen-separated, and SEO-friendly.
 *
 * Run: npx ts-node src/scripts/fix-slugs.ts
 * Or:  npx tsx src/scripts/fix-slugs.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load env from the root of the backend project
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { slugify } from "../utils/slugify";
import Product from "../models/products";
import Category from "../models/categories";

const MONGO_URI = process.env.DB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || "";

async function fixSlugs() {
  if (!MONGO_URI) {
    console.error("❌ No MongoDB URI found in environment variables.");
    console.error("   Set MONGODB_URI, MONGO_URI, or DATABASE_URL in your .env file.");
    process.exit(1);
  }

  console.log("🔗 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected!\n");

  // ── Fix Product Slugs ───────────────────────────────────────────
  console.log("📦 Fixing product slugs...");
  const products = await Product.find({}).select("productName slug").lean();
  let productFixed = 0;
  const usedProductSlugs = new Set<string>();

  for (const product of products) {
    const currentSlug = (product as any).slug || "";
    const idealSlug = slugify(currentSlug || (product as any).productName || "");

    // Make slug unique if collision
    let finalSlug = idealSlug;
    let suffix = 1;
    while (usedProductSlugs.has(finalSlug)) {
      finalSlug = `${idealSlug}-${suffix}`;
      suffix++;
    }
    usedProductSlugs.add(finalSlug);

    if (currentSlug !== finalSlug) {
      await Product.updateOne(
        { _id: (product as any)._id },
        { $set: { slug: finalSlug } }
      );
      console.log(`  ✏️  "${currentSlug}" → "${finalSlug}"`);
      productFixed++;
    }
  }
  console.log(`  ✅ Fixed ${productFixed}/${products.length} product slugs.\n`);

  // ── Fix Category Slugs ──────────────────────────────────────────
  console.log("📂 Fixing category slugs...");
  const categories = await Category.find({}).select("catagoryName slug").lean();
  let categoryFixed = 0;
  const usedCategorySlugs = new Set<string>();

  for (const category of categories) {
    const currentSlug = (category as any).slug || "";
    const idealSlug = slugify(currentSlug || (category as any).catagoryName || "");

    // Make slug unique if collision
    let finalSlug = idealSlug;
    let suffix = 1;
    while (usedCategorySlugs.has(finalSlug)) {
      finalSlug = `${idealSlug}-${suffix}`;
      suffix++;
    }
    usedCategorySlugs.add(finalSlug);

    if (currentSlug !== finalSlug) {
      await Category.updateOne(
        { _id: (category as any)._id },
        { $set: { slug: finalSlug } }
      );
      console.log(`  ✏️  "${currentSlug}" → "${finalSlug}"`);
      categoryFixed++;
    }
  }
  console.log(`  ✅ Fixed ${categoryFixed}/${categories.length} category slugs.\n`);

  console.log("🎉 Migration complete!");
  await mongoose.disconnect();
  process.exit(0);
}

fixSlugs().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
