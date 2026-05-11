// src/routes/productRoutes.ts
import { Router } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductFilters,
  reorderProducts,
  moveProductPosition,
  toggleProductStatus,
  getRelatedProducts,
} from "../controller/productController";
import { uploadMultiple } from "../middlewares/upload.middleware";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { checkPermission } from "../middlewares/permissionMiddleware";
import {
  createProductSchema,
  updateProductSchema,
} from "../utils/validators/productValidators";

const router = Router();

/**
 * @swagger
 * /api/products/filters:
 *   get:
 *     summary: Get metadata for product filters
 *     description: Returns categories, price ranges, and tags to build filter UIs.
 *     tags:
 *       - Products
 *     responses:
 *       200:
 *         description: Successfully retrieved filter metadata
 */
router.get("/filters", getProductFilters);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products with search and filters
 *     description: Retrieve a paginated list of products with optional filters for search, category, price, and status.
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, description, tags, or SKU
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *         description: Filter for featured products
 *       - in: query
 *         name: newArrival
 *         schema:
 *           type: boolean
 *         description: Filter for new arrivals
 *       - in: query
 *         name: bestSeller
 *         schema:
 *           type: boolean
 *         description: Filter for best sellers
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved list of products
 */
router.get("/", getAllProducts);

// PUT /api/products/reorder — must be BEFORE /:id
router.put(
  "/reorder",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  reorderProducts
);

// PUT /api/products/move-position — move a single product across pages
router.put(
  "/move-position",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  moveProductPosition
);

// PATCH /api/products/:id/toggle-status — toggle active/inactive
router.patch(
  "/:id/toggle-status",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  toggleProductStatus
);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product with images
 *     description: Create a product with multiple image uploads and an SKU code
 *     tags:
 *       - Products
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - productName
 *               - slug
 *               - sku
 *               - description
 *               - price
 *               - originalPrice
 *               - stock
 *               - tags
 *               - isActive
 *               - images
 *             properties:
 *               productName:
 *                 type: string
 *                 example: "Wooden Toy Car"
 *               slug:
 *                 type: string
 *                 example: "wooden-toy-car"
 *               sku:
 *                 type: string
 *                 description: "SKU code. Products with the same SKU are grouped as related items."
 *                 example: "KIDROO-TOY-12345"
 *               description:
 *                 type: string
 *                 example: "High-quality wooden toy car"
 *               price:
 *                 type: number
 *                 example: 29.99
 *               originalPrice:
 *                 type: number
 *                 example: 39.99
 *               stock:
 *                 type: number
 *                 example: 100
 *               categories:
 *                 type: string
 *                 example: "60dfssdf0f8sfsklfdfss"
 *               ageRange:
 *                 type: string
 *                 enum: ['0-2', '2-4', '4-6', '6-8', '8+']
 *                 example: '4-6'
 *               tags:
 *                 type: string
 *                 example: "wooden,car,toy"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Upload up to 5 images"
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error or upload failed
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/products"),
  uploadMultiple("images", 5), // Name matches form field, max 5 files
  validateRequest(createProductSchema),
  createProduct,
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product with optional image replacement
 *     description: Update product details and optionally upload new images
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "507f1f1f7bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               productName:
 *                 type: string
 *               slug:
 *                 type: string
 *               sku:
 *                 type: string
 *                 description: "SKU code. Products with the same SKU are grouped as related items."
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               originalPrice:
 *                 type: number
 *               stock:
 *                 type: number
 *               categories:
 *                 type: string
 *               ageRange:
 *                 type: string
 *                 enum: ['0-2', '2-4', '4-6', '6-8', '8+']
 *                 example: '4-6'
 *               tags:
 *                 type: string
 *                 example: "wooden,car,toy"
 *               isActive:
 *                 type: boolean
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       400:
 *         description: Invalid data
 *       404:
 *         description: Product not found
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/products"),
  uploadMultiple("images", 5),
  validateRequest(updateProductSchema),
  updateProduct,
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete product and its images
 *     description: Remove product and clean up all images from Cloudinary
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "507f1f1f7bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/products"),
  deleteProduct,
);

/**
 * @swagger
 * /api/products/{id}/related:
 *   get:
 *     summary: Get related products (same SKU)
 *     description: Returns products sharing the same SKU code, excluding the current product
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Related products fetched successfully
 *       404:
 *         description: Product not found
 */
router.get("/:id/related", getRelatedProducts);

// ── Now register the generic single-product GET (after all specific sub-routes) ──
/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     description: Retrieve a single product by its database ID
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the product
 *       404:
 *         description: Product not found
 */
router.get("/:id", getProductById);

export default router;
