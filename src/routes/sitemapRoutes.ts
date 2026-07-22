import { Router, Request, Response } from "express";
import Product from "../models/products";
import Category from "../models/categories";
import { slugify } from "../utils/slugify";

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

const cleanComment = (str: string): string => {
  return escapeXml(str).replace(/--/g, "-");
};

const getDynamicBaseUrl = (req: Request): string => {
  const host = req.get("host") || "";
  // Only use localhost URL if request explicitly came to localhost/127.0.0.1
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `http://${host}`;
  }
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost")) {
    return process.env.FRONTEND_URL.replace(/\/$/, "");
  }
  return "https://kidroo.in";
};

/**
 * GET /sitemap.xml & GET /api/sitemap.xml
 * Generates dynamic pure XML sitemap for search engine crawlers.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const baseUrl = getDynamicBaseUrl(req);

    const products = await Product.find({ isActive: true })
      .select("productName slug image images updatedAt _id")
      .sort({ position: 1 })
      .lean();

    const categories = await Category.find({})
      .select("catagoryName name slug updatedAt _id")
      .lean();

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

    // Static pages
    for (const page of staticPages) {
      xml += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    }

    // Category pages (slug-based)
    for (const cat of categories) {
      const catObj = cat as any;
      const catName = catObj.catagoryName || catObj.name || "Category";
      const catSlug = catObj.slug || slugify(catName) || catObj._id;
      const lastmod = catObj.updatedAt
        ? new Date(catObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      xml += `  <!-- Category: ${cleanComment(catName)} -->
  <url>
    <loc>${baseUrl}/category/${catSlug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }

    // Product pages (slug-based URLs + multi-image Google SEO)
    for (const product of products) {
      const prodObj = product as any;
      const prodName = prodObj.productName || "Product";
      const prodSlug = prodObj.slug || slugify(prodName) || prodObj._id;
      const allImages: string[] = [];
      if (prodObj.image) allImages.push(prodObj.image);
      if (Array.isArray(prodObj.images)) {
        for (const img of prodObj.images) {
          if (img && !allImages.includes(img)) allImages.push(img);
        }
      }
      const lastmod = prodObj.updatedAt
        ? new Date(prodObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      xml += `  <!-- Product: ${cleanComment(prodName)} -->
  <url>
    <loc>${baseUrl}/product/${prodSlug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>`;

      for (const imgUrl of allImages.slice(0, 5)) {
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

    res.set("Content-Type", "application/xml; charset=UTF-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
