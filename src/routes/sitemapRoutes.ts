import { Router, Request, Response } from "express";
import Product from "../models/products";
import Category from "../models/categories";

const router = Router();

/**
 * GET /api/sitemap.xml
 * Generates a dynamic XML sitemap for search engines.
 * Includes all public pages + all active product pages + category pages.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || "https://kidrootoys.com";

    // Fetch all active products (only need slug and updatedAt)
    const products = await Product.find({ isActive: true })
      .select("slug updatedAt _id")
      .sort({ position: 1 })
      .lean();

    // Fetch all categories
    const categories = await Category.find({})
      .select("_id slug updatedAt")
      .lean();

    // Static pages
    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/shop", priority: "0.9", changefreq: "daily" },
      { url: "/offers", priority: "0.8", changefreq: "daily" },
      { url: "/about", priority: "0.5", changefreq: "monthly" },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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

    // Add category pages (use slug-based URLs for SEO)
    for (const cat of categories) {
      const lastmod = (cat as any).updatedAt
        ? new Date((cat as any).updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const catUrl = (cat as any).slug
        ? `/category/${(cat as any).slug}`
        : `/shop?category=${cat._id}`;
      xml += `  <url>
    <loc>${baseUrl}${catUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }

    // Add product pages
    for (const product of products) {
      const lastmod = (product as any).updatedAt
        ? new Date((product as any).updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      xml += `  <url>
    <loc>${baseUrl}/product/${product._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
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
