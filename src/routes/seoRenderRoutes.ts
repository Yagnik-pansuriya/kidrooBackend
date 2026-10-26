import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import Product from "../models/products";
import Category from "../models/categories";
import Offer from "../models/offers";

/**
 * Server-side SEO rendering for the React SPA.
 *
 * Nginx forwards every HTML page request (anything that is not a static file)
 * to /seo-render/<original path>. We take the built frontend index.html and
 * inject, per URL:
 *   - <title>, meta description, canonical, Open Graph / Twitter tags
 *   - page-specific JSON-LD (Product, CollectionPage, BreadcrumbList, ItemList)
 *   - real crawlable HTML (H1, text, product links) inside #root
 *   - correct HTTP status (404 for unknown products / categories / paths)
 *
 * React then boots normally and replaces #root. Injected head tags carry
 * data-rh="true" so react-helmet-async replaces them instead of duplicating.
 */

const router = Router();

const SITE_URL = "https://kidroo.in";
const SITE_NAME = "Kidroo Toys";
const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

// SPA routes that must never be indexed (user-specific or transactional)
const PRIVATE_PREFIXES = ["/cart", "/checkout", "/wishlist", "/profile", "/order-confirmation", "/admin"];

// ── Template loading (re-read when the frontend is rebuilt) ─────────────────

const TEMPLATE_PATHS = [
  process.env.FRONTEND_INDEX_HTML || "",
  path.join(__dirname, "../../../frontend/dist/index.html"),
  path.join(__dirname, "../../../kidrooToys/frontend/dist/index.html"),
  "/var/www/kidrooToys/frontend/dist/index.html",
  "/var/www/kidroo/frontend/dist/index.html",
].filter(Boolean);

let templateCache: { file: string; mtimeMs: number; html: string } | null = null;

const loadTemplate = (): string | null => {
  for (const file of TEMPLATE_PATHS) {
    try {
      const { mtimeMs } = fs.statSync(file);
      if (templateCache && templateCache.file === file && templateCache.mtimeMs === mtimeMs) {
        return templateCache.html;
      }
      const html = fs.readFileSync(file, "utf-8");
      templateCache = { file, mtimeMs, html };
      renderCache.clear();
      return html;
    } catch {
      // Try next path
    }
  }
  return null;
};

// ── Small render cache to keep DB load low under crawler bursts ─────────────

const renderCache = new Map<string, { expires: number; status: number; html: string }>();

const cacheSet = (key: string, status: number, html: string) => {
  if (renderCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = renderCache.keys().next().value;
    if (oldestKey !== undefined) renderCache.delete(oldestKey);
  }
  renderCache.set(key, { expires: Date.now() + CACHE_TTL_MS, status, html });
};

/** Clears rendered pages, e.g. after a product or category is edited. */
export const clearSeoRenderCache = (): void => {
  renderCache.clear();
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const escapeHtml = (str: unknown): string =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// JSON-LD inside <script>: prevent "</script>" breaking out of the tag
const safeJson = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");

const stripHtml = (html: string): string =>
  String(html || "")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

const truncate = (text: string, max: number): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:|-]+$/, "")}…`;
};

const titleCase = (text: string): string =>
  text.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatPrice = (value: number): string =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Google shows ~60 characters; cut long names on a word boundary
const capTitle = (text: string): string => {
  if (text.length <= 70) return text;
  return text
    .slice(0, 66)
    .replace(/\s+\S*$/, "")
    .replace(/(\s+(&|and|with|for|of|-|\|))+$/i, "")
    .trim();
};

/**
 * Product names are long marketplace-style strings like
 * "Kidroo Hover Ball for Kids | Battery Operated ... | 3-10 Years - Blue".
 * For <title> we keep the first segment plus a short variant suffix
 * ("- Blue", "- 5 Rattles") so sibling variants get distinct titles.
 */
const shortProductTitle = (name: string): string => {
  const clean = name.replace(/\s+/g, " ").trim();
  const head = clean.split(" | ")[0].trim();
  const variantMatch = clean.match(/\s-\s([^|]{1,24})$/);
  const variant = variantMatch ? variantMatch[1].trim() : "";
  if (variant && head !== clean && !head.toLowerCase().endsWith(variant.toLowerCase())) {
    return capTitle(`${head} - ${variant}`);
  }
  return capTitle(head);
};

const withSiteName = (title: string): string =>
  title.toLowerCase().includes("kidroo") ? title : `${title} | ${SITE_NAME}`;

const productUrl = (p: any): string => `${SITE_URL}/product/${encodeURIComponent(p.slug || String(p._id))}`;
const categoryUrl = (c: any): string => `${SITE_URL}/category/${encodeURIComponent(c.slug || String(c._id))}`;
const categoryName = (c: any): string => titleCase(c?.catagoryName || c?.name || "Toys");

const productImages = (p: any): string[] => {
  const images: string[] = [];
  if (p.image) images.push(p.image);
  for (const img of Array.isArray(p.images) ? p.images : []) {
    if (img && !images.includes(img)) images.push(img);
  }
  return images;
};

const breadcrumbLd = (items: { name: string; url: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
});

const itemListLd = (products: any[]) => ({
  "@type": "ItemList",
  numberOfItems: products.length,
  itemListElement: products.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: productUrl(p),
    name: p.productName?.trim(),
  })),
});

// ── HTML fragments ──────────────────────────────────────────────────────────

const breadcrumbHtml = (items: { name: string; url: string }[]): string =>
  `<nav aria-label="Breadcrumb"><ol style="display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0 0 12px;font-size:14px">${items
    .map((item, i) =>
      i === items.length - 1
        ? `<li aria-current="page">${escapeHtml(item.name)}</li>`
        : `<li><a href="${escapeHtml(item.url.replace(SITE_URL, "") || "/")}">${escapeHtml(item.name)}</a> ›</li>`,
    )
    .join("")}</ol></nav>`;

const productListHtml = (products: any[]): string => {
  if (!products.length) return "";
  return `<ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px">${products
    .map((p) => {
      const name = p.productName?.trim() || "Toy";
      const img = productImages(p)[0];
      const discount = p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
      return `<li><a href="/product/${escapeHtml(encodeURIComponent(p.slug || String(p._id)))}">${
        img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" width="160" height="160" loading="lazy" style="width:100%;height:auto;object-fit:cover">` : ""
      }<span style="display:block">${escapeHtml(truncate(name, 90))}</span></a><strong>${formatPrice(p.price)}</strong>${
        discount > 0 ? ` <s>${formatPrice(p.originalPrice)}</s> <span>${discount}% off</span>` : ""
      }</li>`;
    })
    .join("")}</ul>`;
};

const categoryLinksHtml = (categories: any[]): string =>
  categories.length
    ? `<nav aria-label="Toy categories"><h2>Shop by Category</h2><ul>${categories
        .map((c) => `<li><a href="/category/${escapeHtml(encodeURIComponent(c.slug || String(c._id)))}">${escapeHtml(categoryName(c))}</a></li>`)
        .join("")}</ul></nav>`
    : "";

const siteNavHtml = `<nav aria-label="Main"><a href="/">Home</a> · <a href="/shop">Shop All Toys</a> · <a href="/offers">Offers &amp; Deals</a> · <a href="/about">About Kidroo</a></nav>`;

const wrapBody = (inner: string): string =>
  `<div data-seo-ssr="true" style="max-width:1200px;margin:0 auto;padding:16px;font-family:Nunito,system-ui,sans-serif">${siteNavHtml}${inner}</div>`;

// ── Page model ──────────────────────────────────────────────────────────────

interface SeoPage {
  status: number;
  title: string;
  description: string;
  canonical: string;
  image?: string;
  ogType?: string;
  robots?: string;
  keywords?: string;
  jsonLd?: object[];
  extraHead?: string;
  bodyHtml?: string;
  redirect?: string;
}

const renderHtml = (template: string, page: SeoPage): string => {
  const robots = page.robots || "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
  const image = page.image || DEFAULT_IMAGE;
  const head = [
    `<meta data-rh="true" name="description" content="${escapeHtml(page.description)}" />`,
    page.keywords ? `<meta data-rh="true" name="keywords" content="${escapeHtml(page.keywords)}" />` : "",
    `<meta data-rh="true" name="robots" content="${robots}" />`,
    `<meta data-rh="true" name="googlebot" content="${robots}" />`,
    `<link data-rh="true" rel="canonical" href="${escapeHtml(page.canonical)}" />`,
    `<meta data-rh="true" property="og:type" content="${page.ogType || "website"}" />`,
    `<meta data-rh="true" property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta data-rh="true" property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta data-rh="true" property="og:site_name" content="${SITE_NAME}" />`,
    `<meta data-rh="true" property="og:url" content="${escapeHtml(page.canonical)}" />`,
    `<meta data-rh="true" property="og:image" content="${escapeHtml(image)}" />`,
    `<meta data-rh="true" property="og:locale" content="en_IN" />`,
    `<meta data-rh="true" name="twitter:card" content="summary_large_image" />`,
    `<meta data-rh="true" name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta data-rh="true" name="twitter:description" content="${escapeHtml(page.description)}" />`,
    `<meta data-rh="true" name="twitter:image" content="${escapeHtml(image)}" />`,
    page.extraHead || "",
    page.jsonLd?.length
      ? `<script data-rh="true" type="application/ld+json">${safeJson({ "@context": "https://schema.org", "@graph": page.jsonLd })}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  let html = template;

  // The template's static robots meta would conflict with noindex pages
  html = html.replace(/\s*<meta name="(robots|googlebot)"[^>]*>/gi, "");

  html = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(page.title)}</title>`)
    : html.replace("</head>", () => `<title>${escapeHtml(page.title)}</title></head>`);

  html = html.replace("</head>", () => `    ${head}\n  </head>`);

  if (page.bodyHtml) {
    html = html.replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${wrapBody(page.bodyHtml!)}</div>`);
  }
  return html;
};

// ── Data access ─────────────────────────────────────────────────────────────

const PRODUCT_LIST_FIELDS = "productName slug image images price originalPrice stock ratings numReviews";

const activeCategories = () =>
  Category.find({ isActive: { $ne: false } }).select("catagoryName slug description image position").sort({ position: 1 }).lean();

const activeProducts = (filter: Record<string, unknown> = {}, limit = 60) =>
  Product.find({ isActive: true, ...filter }).select(PRODUCT_LIST_FIELDS).sort({ position: 1 }).limit(limit).lean();

// ── Page builders ───────────────────────────────────────────────────────────

const buildHome = async (): Promise<SeoPage> => {
  const [categories, products] = await Promise.all([activeCategories(), activeProducts({}, 24)]);
  // Keep in sync with Home.jsx <SEO> — React replaces these tags after boot
  const title = "Kidroo Toys - Buy Baby Rattles, Puzzles & Board Games Online in India";
  const description =
    "Shop safe, BIS approved kids toys at Kidroo: BPA-free baby rattle sets, STEM puzzles, family board games & birthday gifts for boys and girls. Delivery across India.";
  return {
    status: 200,
    title,
    description,
    canonical: `${SITE_URL}/`,
    jsonLd: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/#webpage`,
        url: `${SITE_URL}/`,
        name: title,
        description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        mainEntity: itemListLd(products),
      },
    ],
    bodyHtml: `<h1>Kidroo Toys - Safe &amp; Educational Toys for Kids in India</h1>
<p>Kidroo Toys is an Indian online toy store for babies, toddlers and kids. Shop BIS approved, BPA-free and non-toxic toys including baby rattle and teether sets for newborns, STEM puzzles and brain teasers, family board games and activity toys - ideal as birthday and return gifts for boys and girls.</p>
${categoryLinksHtml(categories)}
<h2>Popular Toys</h2>
${productListHtml(products)}`,
  };
};

const buildShop = async (req: Request): Promise<SeoPage> => {
  const categoryParam = typeof req.query.category === "string" ? req.query.category : "";
  const categories = await activeCategories();
  const activeCat = categoryParam
    ? categories.find((c: any) => c.slug === categoryParam || String(c._id) === categoryParam)
    : undefined;

  // /shop?category=x duplicates /category/x — point search engines at the category page
  if (activeCat) {
    const page = await buildCategory((activeCat as any).slug || String((activeCat as any)._id));
    return page;
  }

  const products = await activeProducts({}, 200);
  // Keep in sync with Shop.jsx <SEO>
  const title = "Shop All Kids Toys Online - Rattles, Puzzles, Board Games | Kidroo Toys";
  const description =
    "Browse all Kidroo toys: baby rattle sets, ramp racer car tracks, STEM puzzle mazes, hover balls and family board games. Safe, BIS approved toys delivered across India.";
  const crumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Shop", url: `${SITE_URL}/shop` },
  ];
  return {
    status: 200,
    title,
    description,
    canonical: `${SITE_URL}/shop`,
    // Search / filter / pagination variants are thin duplicates of /shop
    robots: Object.keys(req.query).length ? "noindex, follow" : undefined,
    jsonLd: [
      { "@type": "CollectionPage", url: `${SITE_URL}/shop`, name: title, description, isPartOf: { "@id": `${SITE_URL}/#website` }, mainEntity: itemListLd(products) },
      breadcrumbLd(crumbs),
    ],
    bodyHtml: `${breadcrumbHtml(crumbs)}<h1>Shop All Kids Toys Online</h1>
<p>Explore the full Kidroo Toys collection - newborn rattle sets, toddler activity toys, STEM puzzles and board games for kids of every age.</p>
${categoryLinksHtml(categories)}
${productListHtml(products)}`,
  };
};

const buildOffers = async (): Promise<SeoPage> => {
  const now = new Date();
  const [offers, deals] = await Promise.all([
    Offer.find({ isActive: true, "validity.from": { $lte: now }, "validity.to": { $gte: now } })
      .select("title subtitle description images")
      .sort({ "placement.position": 1 })
      .limit(20)
      .lean(),
    Product.find({ isActive: true, $expr: { $gt: ["$originalPrice", "$price"] } })
      .select(PRODUCT_LIST_FIELDS)
      .sort({ discountPercentage: -1, position: 1 })
      .limit(60)
      .lean(),
  ]);
  const maxDiscount = deals.reduce(
    (max: number, p: any) => Math.max(max, Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)),
    0,
  );
  // Keep in sync with Offers.jsx <SEO>
  const title = "Toy Offers & Deals - Discounts on Kids Toys | Kidroo Toys";
  const description = truncate(
    `Today's best deals on kids toys at Kidroo${maxDiscount ? ` - save up to ${maxDiscount}%` : ""} on baby rattle sets, puzzles, board games and gifts. Limited-time toy offers in India.`,
    160,
  );
  const crumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Offers & Deals", url: `${SITE_URL}/offers` },
  ];
  const offersHtml = offers.length
    ? `<h2>Current Offers</h2><ul>${offers
        .map((o: any) => `<li><strong>${escapeHtml(o.title)}</strong>${o.subtitle ? ` - ${escapeHtml(o.subtitle)}` : ""}${o.description ? `<p>${escapeHtml(truncate(stripHtml(o.description), 240))}</p>` : ""}</li>`)
        .join("")}</ul>`
    : "";
  return {
    status: 200,
    title,
    description,
    canonical: `${SITE_URL}/offers`,
    image: (offers[0] as any)?.images?.[0]?.url,
    jsonLd: [
      { "@type": "CollectionPage", url: `${SITE_URL}/offers`, name: title, description, isPartOf: { "@id": `${SITE_URL}/#website` }, mainEntity: itemListLd(deals) },
      breadcrumbLd(crumbs),
    ],
    bodyHtml: `${breadcrumbHtml(crumbs)}<h1>Toy Offers &amp; Deals</h1>
<p>Grab limited-time discounts on premium kids toys at Kidroo.</p>
${offersHtml}
<h2>Toys on Sale</h2>
${productListHtml(deals)}`,
  };
};

const buildAbout = async (): Promise<SeoPage> => {
  // Keep in sync with AboutUs.jsx <SEO>
  const title = "About Us – India's Most Trusted Toy Store | Kidroo";
  const description =
    "Discover Kidroo Toys — India's #1 trusted online toy store since 2020. Safe, eco-friendly & educational toys for children aged 0-14+. Serving 50K+ kids in 50+ cities.";
  const crumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "About Us", url: `${SITE_URL}/about` },
  ];
  return {
    status: 200,
    title,
    description,
    canonical: `${SITE_URL}/about`,
    jsonLd: [
      { "@type": "AboutPage", url: `${SITE_URL}/about`, name: title, description, about: { "@id": `${SITE_URL}/#organization` } },
      breadcrumbLd(crumbs),
    ],
    bodyHtml: `${breadcrumbHtml(crumbs)}<h1>About Kidroo Toys</h1><p>${escapeHtml(description)}</p>`,
  };
};

const notFoundPage = (pathName: string): SeoPage => ({
  status: 404,
  title: `Page Not Found | ${SITE_NAME}`,
  description: "The page you are looking for does not exist. Browse all kids toys at Kidroo Toys.",
  canonical: `${SITE_URL}${pathName}`,
  robots: "noindex, follow",
  bodyHtml: `<h1>Page not found</h1><p>This page does not exist. <a href="/shop">Browse all toys</a>.</p>`,
});

const buildCategory = async (slug: string): Promise<SeoPage> => {
  const filter = mongoose.Types.ObjectId.isValid(slug) ? { $or: [{ slug }, { _id: slug }] } : { slug: slug.toLowerCase() };
  const category: any = await Category.findOne({ ...filter, isActive: { $ne: false } }).lean();
  if (!category) return notFoundPage(`/category/${slug}`);

  const canonical = categoryUrl(category);
  if (category.slug && slug !== category.slug) {
    return { ...notFoundPage(""), status: 301, redirect: canonical };
  }

  const [products, categories] = await Promise.all([
    activeProducts({ categories: category._id }, 200),
    activeCategories(),
  ]);
  const name = categoryName(category);
  // Keep in sync with CategoryPage.jsx <SEO>
  const title = withSiteName(`${name} for Kids - Buy Online in India`);
  const description = truncate(
    stripHtml(category.description || "") ||
      `Shop ${products.length || ""} ${name.toLowerCase()} toys for kids at Kidroo. Safe, BIS approved and non-toxic ${name.toLowerCase()} - perfect birthday and return gifts. Delivery across India.`,
    160,
  );
  const crumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Shop", url: `${SITE_URL}/shop` },
    { name, url: canonical },
  ];
  return {
    status: 200,
    title,
    description,
    canonical,
    image: category.image || productImages(products[0] || {})[0],
    keywords: `${name.toLowerCase()}, ${name.toLowerCase()} for kids, buy ${name.toLowerCase()} online india, kidroo ${name.toLowerCase()}`,
    // Empty categories are thin content — keep them out of the index until stocked
    robots: products.length ? undefined : "noindex, follow",
    jsonLd: [
      { "@type": "CollectionPage", url: canonical, name: `${name} for Kids`, description, isPartOf: { "@id": `${SITE_URL}/#website` }, mainEntity: itemListLd(products) },
      breadcrumbLd(crumbs),
    ],
    bodyHtml: `${breadcrumbHtml(crumbs)}<h1>${escapeHtml(name)} for Kids</h1>
<p>${escapeHtml(description)}</p>
${productListHtml(products)}
${categoryLinksHtml(categories.filter((c: any) => String(c._id) !== String(category._id)))}`,
  };
};

const buildProduct = async (slug: string): Promise<SeoPage> => {
  const filter = mongoose.Types.ObjectId.isValid(slug) ? { $or: [{ _id: slug }, { slug }] } : { slug };
  const product: any = await Product.findOne({ ...filter, isActive: true })
    .populate({ path: "categories", select: "catagoryName slug isActive" })
    .lean();
  if (!product) return notFoundPage(`/product/${slug}`);

  const canonical = productUrl(product);
  // Old /product/<mongoId> links → permanent redirect to the slug URL
  if (product.slug && slug !== product.slug) {
    return { ...notFoundPage(""), status: 301, redirect: canonical };
  }

  const name = String(product.productName || "").trim();
  const images = productImages(product);
  const category = (product.categories || []).find((c: any) => c && c.isActive !== false);
  const plainDescription = stripHtml(product.description || "");
  // Keep in sync with ProductDetail.jsx <SEO> (utils/seoTitle.js)
  const title = withSiteName(product.seoTitle?.trim() || shortProductTitle(name));
  const description = truncate(
    product.seoDescription?.trim() ||
      `${shortProductTitle(name)} at ${formatPrice(product.price)}${
        product.originalPrice > product.price ? ` (MRP ${formatPrice(product.originalPrice)})` : ""
      }. ${plainDescription || name}`,
    160,
  );
  const inStock = Number(product.stock) > 0;
  const discount =
    product.originalPrice > product.price ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;

  const crumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    ...(category ? [{ name: categoryName(category), url: categoryUrl(category) }] : [{ name: "Shop", url: `${SITE_URL}/shop` }]),
    { name: shortProductTitle(name), url: canonical },
  ];

  const related = category
    ? await activeProducts({ categories: category._id, _id: { $ne: product._id } }, 8)
    : await activeProducts({ _id: { $ne: product._id } }, 8);

  const ages: string[] = Array.isArray(product.ageRange) ? product.ageRange : [];
  const productLd: any = {
    "@type": "Product",
    "@id": `${canonical}#product`,
    name,
    description: truncate(plainDescription || name, 5000),
    image: images,
    url: canonical,
    sku: product.skuCode || product.productCode,
    mpn: product.productCode,
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(category && { category: categoryName(category) }),
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "INR",
      price: Number(product.price).toFixed(2),
      itemCondition: "https://schema.org/NewCondition",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  };
  if (product.ratings > 0 && product.numReviews > 0) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.ratings,
      reviewCount: product.numReviews,
      bestRating: 5,
      worstRating: 1,
    };
  }
  if (ages.length) {
    const last = ages[ages.length - 1];
    productLd.audience = {
      "@type": "PeopleAudience",
      suggestedMinAge: Number(ages[0].split("-")[0]) || 0,
      ...(!last.includes("+") && { suggestedMaxAge: Number(last.split("-")[1]) || undefined }),
    };
  }

  const specs: { key: string; value: string }[] = Array.isArray(product.specifications) ? product.specifications : [];
  const descriptionHtml = plainDescription
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return {
    status: 200,
    title,
    description,
    canonical,
    image: images[0],
    ogType: "product",
    keywords: (product.seoKeywords?.length ? product.seoKeywords : product.tags || []).filter(Boolean).join(", ") || undefined,
    extraHead: [
      `<meta data-rh="true" property="product:price:amount" content="${Number(product.price).toFixed(2)}" />`,
      `<meta data-rh="true" property="product:price:currency" content="INR" />`,
      `<meta data-rh="true" property="product:availability" content="${inStock ? "in stock" : "out of stock"}" />`,
      images[0] ? `<link data-rh="true" rel="preload" as="image" href="${escapeHtml(images[0])}" />` : "",
    ]
      .filter(Boolean)
      .join("\n    "),
    jsonLd: [productLd, breadcrumbLd(crumbs)],
    bodyHtml: `${breadcrumbHtml(crumbs)}<article>
<h1>${escapeHtml(name)}</h1>
${images
  .slice(0, 5)
  .map((img, i) => `<img src="${escapeHtml(img)}" alt="${escapeHtml(i === 0 ? name : `${shortProductTitle(name)} - image ${i + 1}`)}" width="400" height="400" ${i ? 'loading="lazy"' : ""} style="max-width:100%;height:auto">`)
  .join("")}
<p><strong>${formatPrice(product.price)}</strong>${discount ? ` <s>MRP ${formatPrice(product.originalPrice)}</s> (${discount}% off)` : ""} · ${inStock ? "In stock" : "Out of stock"}</p>
${ages.length ? `<p>Suitable for ages: ${escapeHtml(ages.join(", "))} years</p>` : ""}
<h2>Product Description</h2>
${descriptionHtml}
${specs.length ? `<h2>Specifications</h2><table>${specs.map((s) => `<tr><th>${escapeHtml(s.key)}</th><td>${escapeHtml(s.value)}</td></tr>`).join("")}</table>` : ""}
</article>
${related.length ? `<h2>You May Also Like</h2>${productListHtml(related)}` : ""}`,
  };
};

// ── Request handler ─────────────────────────────────────────────────────────

const resolvePage = async (req: Request, pathName: string): Promise<SeoPage | null> => {
  if (pathName === "/" || pathName === "") return buildHome();
  if (pathName === "/shop") return buildShop(req);
  if (pathName === "/offers") return buildOffers();
  if (pathName === "/about") return buildAbout();

  const categoryMatch = pathName.match(/^\/category\/([^/]+)$/);
  if (categoryMatch) return buildCategory(decodeURIComponent(categoryMatch[1]));

  const productMatch = pathName.match(/^\/product\/([^/]+)$/);
  if (productMatch) return buildProduct(decodeURIComponent(productMatch[1]));

  if (PRIVATE_PREFIXES.some((prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`))) {
    return null; // served as plain SPA shell with noindex
  }

  return notFoundPage(pathName);
};

router.use(async (req: Request, res: Response) => {
  const template = loadTemplate();
  if (!template) {
    res.status(503).send("Frontend build not found");
    return;
  }

  res.set("Content-Type", "text/html; charset=UTF-8");
  res.set("Cache-Control", "no-cache");

  // Normalise trailing slashes: /shop/ → /shop
  const pathName = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
  if (pathName !== req.path) {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, `${pathName}${query}`);
    return;
  }

  const cacheKey = req.originalUrl.replace(/^\/seo-render/, "") || "/";
  const cached = renderCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.status(cached.status).send(cached.html);
    return;
  }

  try {
    const page = await resolvePage(req, pathName);

    if (!page) {
      res.set("X-Robots-Tag", "noindex, nofollow");
      res.status(200).send(template);
      return;
    }

    if (page.redirect) {
      res.redirect(301, page.redirect);
      return;
    }

    const html = renderHtml(template, page);
    cacheSet(cacheKey, page.status, html);
    res.status(page.status).send(html);
  } catch (error) {
    console.error("[SEO render] Failed, serving plain SPA shell:", error);
    res.status(200).send(template);
  }
});

export default router;
