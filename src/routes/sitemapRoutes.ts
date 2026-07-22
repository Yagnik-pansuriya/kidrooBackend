import { Router, Request, Response } from "express";
import Product from "../models/products";
import Category from "../models/categories";

const router = Router();

const escapeXml = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/**
 * GET /sitemap.xml & GET /api/sitemap.xml
 * Generates a dynamic XML sitemap for search engines with product names & images.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || "https://kidroo.in";

    // Fetch active products with productName, slug, image, images, updatedAt
    const products = await Product.find({ isActive: true })
      .select("productName slug image images updatedAt _id")
      .sort({ position: 1 })
      .lean();

    // Fetch categories with catagoryName, name, slug, updatedAt
    const categories = await Category.find({})
      .select("catagoryName name slug updatedAt _id")
      .lean();

    // Static pages
    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/shop", priority: "0.9", changefreq: "daily" },
      { url: "/offers", priority: "0.8", changefreq: "daily" },
      { url: "/about", priority: "0.5", changefreq: "monthly" },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

    // Add static pages
    for (const page of staticPages) {
      xml += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }

    // Add category pages (use slug-based URLs + Category Name comment)
    for (const cat of categories) {
      const catObj = cat as any;
      const catName = catObj.catagoryName || catObj.name || "Category";
      const lastmod = catObj.updatedAt
        ? new Date(catObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const catUrl = catObj.slug
        ? `/category/${encodeURIComponent(catObj.slug)}`
        : `/shop?category=${cat._id}`;

      xml += `  <!-- Category: ${escapeXml(catName)} -->
  <url>
    <loc>${baseUrl}${catUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }

    // Add product pages with product names & google image tags
    for (const product of products) {
      const prodObj = product as any;
      const prodName = prodObj.productName || "Product";
      const prodSlug = prodObj.slug || prodObj._id;
      const imgUrl = prodObj.image || (Array.isArray(prodObj.images) && prodObj.images.length > 0 ? prodObj.images[0] : "");
      const lastmod = prodObj.updatedAt
        ? new Date(prodObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      xml += `  <!-- Product: ${escapeXml(prodName)} -->
  <url>
    <loc>${baseUrl}/product/${encodeURIComponent(prodSlug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>`;

      if (imgUrl) {
        xml += `
    <image:image>
      <image:loc>${escapeXml(imgUrl)}</image:loc>
      <image:title>${escapeXml(prodName)}</image:title>
      <image:caption>${escapeXml(prodName)}</image:caption>
    </image:image>`;
      }

      xml += `
  </url>
`;
    }

    xml += `</urlset>`;

    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.send(xml);
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
