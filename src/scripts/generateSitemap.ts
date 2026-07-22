import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import Product from "../models/products";
import Category from "../models/categories";

dotenv.config();

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

const generateSitemapFile = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/kidroo";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    const baseUrl = process.env.FRONTEND_URL || "https://kidroo.in";

    console.log("Fetching products & categories...");
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

    // Category pages
    for (const cat of categories) {
      const catObj = cat as any;
      const catName = catObj.catagoryName || catObj.name || "Category";
      const lastmod = catObj.updatedAt
        ? new Date(catObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const catUrl = catObj.slug
        ? `/category/${catObj.slug}`
        : `/shop?category=${cat._id}`;

      xml += `  <!-- Category: ${cleanComment(catName)} -->
  <url>
    <loc>${baseUrl}${catUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }

    // Product pages
    for (const product of products) {
      const prodObj = product as any;
      const prodName = prodObj.productName || "Product";
      const prodSlug = prodObj.slug || prodObj._id;
      const imgUrl = prodObj.image || (Array.isArray(prodObj.images) && prodObj.images.length > 0 ? prodObj.images[0] : "");
      const lastmod = prodObj.updatedAt
        ? new Date(prodObj.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      xml += `  <!-- Product: ${cleanComment(prodName)} -->
  <url>
    <loc>${baseUrl}/product/${prodSlug}</loc>
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

    // Output target locations (frontend public & frontend dist if available)
    const targetPaths = [
      path.join(__dirname, "../../../frontend/public/sitemap.xml"),
      path.join(__dirname, "../../../frontend/dist/sitemap.xml"),
    ];

    for (const targetPath of targetPaths) {
      const dir = path.dirname(targetPath);
      if (fs.existsSync(dir)) {
        fs.writeFileSync(targetPath, xml, "utf-8");
        console.log(`✅ Successfully generated sitemap.xml at: ${targetPath}`);
      }
    }

    await mongoose.disconnect();
    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Error generating sitemap file:", err);
    process.exit(1);
  }
};

generateSitemapFile();
