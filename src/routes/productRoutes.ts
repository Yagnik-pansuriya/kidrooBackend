// src/routes/productRoutes.ts
import { Router } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductFilters,
} from "../controller/productController";
import {
  createVariant,
  updateVariant,
  getVariantsByProduct,
  deleteVariant,
} from "../controller/variantController";
import { uploadMultiple, uploadSingle } from "../middlewares/upload.middleware";
import { asyncHandler } from "../utils/asyncHandler";
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
 *         description: Search by name, description, or tags
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
 *         example: "60dfssdf0f8sfsklfdfss"
 *     responses:
 *       200:
 *         description: Successfully retrieved the product
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */
router.get("/:id", getProductById);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product with images
 *     description: Create a product with multiple image uploads
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
 *               - description
 *               - price
 *               - originalPrice
 *               - discountPercentage
 *               - stock
 *               - category
 *               - ratings
 *               - numReviews
 *               - featured
 *               - newArrival
 *               - bestSeller
 *               - ageRange
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
 *               description:
 *                 type: string
 *                 example: "High-quality wooden toy car"
 *               price:
 *                 type: number
 *                 example: 29.99
 *               originalPrice:
 *                 type: number
 *                 example: 39.99
 *               discountPercentage:
 *                 type: number
 *                 example: 25
 *               stock:
 *                 type: number
 *                 example: 100
 *               category:
 *                 type: string
 *                 example: "60dfssdf0f8sfsklfdfss"
 *               ratings:
 *                 type: number
 *                 example: 4.5
 *               numReviews:
 *                 type: number
 *                 example: 120
 *               featured:
 *                 type: boolean
 *                 example: true
 *               newArrival:
 *                 type: boolean
 *                 example: true
 *               bestSeller:
 *                 type: boolean
 *                 example: false
 *               ageRange:
 *                 type: string
 *                 example: '{"from": 3, "to": 8}'
 *               tags:
 *                 type: string
 *                 example: "wooden,car,toy"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               hasVariants:
 *                 type: boolean
 *                 example: false
 *               variants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: []
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
  authorizationMiddleware(["admin"]),
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
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               originalPrice:
 *                 type: number
 *               discountPercentage:
 *                 type: number
 *               stock:
 *                 type: number
 *               category:
 *                 type: string
 *               ratings:
 *                 type: number
 *               numReviews:
 *                 type: number
 *               featured:
 *                 type: boolean
 *               newArrival:
 *                 type: boolean
 *               bestSeller:
 *                 type: boolean
 *               ageRange:
 *                 type: string
 *                 example: '{"from": 3, "to": 8}'
 *               tags:
 *                 type: string
 *                 example: "wooden,car,toy"
 *               isActive:
 *                 type: boolean
 *               hasVariants:
 *                 type: boolean
 *               variants:
 *                 type: array
 *                 items:
 *                   type: string
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
  authorizationMiddleware(["admin"]),
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
  authorizationMiddleware(["admin"]),
  checkPermission("/products"),
  deleteProduct,
);

// --- Product Variants Routes --- //

/**
 * @swagger
 * /api/products/{productId}/variants:
 *   get:
 *     summary: Get all variants for a product
 *     description: Retrieve all active variants (sizes, colors, editions) for a specific toy.
 *     tags:
 *       - Variants
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the base Toy Product
 *         example: "60dfssdf0f8sfsklfdfss"
 *     responses:
 *       200:
 *         description: List of variants retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       product:
 *                         type: string
 *                       sku:
 *                         type: string
 *                       barcode:
 *                         type: string
 *                       attributes:
 *                         type: object
 *                       price:
 *                         type: number
 *                       originalPrice:
 *                         type: number
 *                       stock:
 *                         type: number
 *                       lowStockAlert:
 *                         type: number
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                       weight:
 *                         type: number
 *                       dimensions:
 *                         type: object
 *                         properties:
 *                           length:
 *                             type: number
 *                           width:
 *                             type: number
 *                           height:
 *                             type: number
 *                       status:
 *                         type: string
 *                       isDefault:
 *                         type: boolean
 *       400:
 *         description: Invalid Product ID format
 */
router.get("/:productId/variants", getVariantsByProduct);

/**
 * @swagger
 * /api/products/{productId}/variants:
 *   post:
 *     summary: Create a new variant for a toy
 *     description: Add a new variant (e.g., a "Collector's Edition" or "Red Color") to a base toy product. Allows uploading multiple images. (Admin only)
 *     tags:
 *       - Variants
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the base Toy Product
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - attributes
 *               - price
 *             properties:
 *               sku:
 *                 type: string
 *                 example: "TOY-CAR-RED-001"
 *               barcode:
 *                 type: string
 *                 example: "1234567890123"
 *               attributes:
 *                 type: string
 *                 description: Flexible attributes for the toy variant properly stringified (Color, Size, Material, etc.)
 *                 example: '{"Color": "Red", "Edition": "Collector''s Edition", "Material": "Wood"}'
 *               price:
 *                 type: number
 *                 example: 34.99
 *               originalPrice:
 *                 type: number
 *                 example: 39.99
 *               stock:
 *                 type: number
 *                 example: 50
 *               lowStockAlert:
 *                 type: number
 *                 example: 5
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Upload up to 5 images for this variant highlighting details"
 *               weight:
 *                 type: number
 *                 description: Weight in grams or kg
 *                 example: 500
 *               dimensions:
 *                 type: string
 *                 description: Dimensions (JSON stringified)
 *                 example: '{"length": 15, "width": 10, "height": 5}'
 *               status:
 *                 type: string
 *                 enum:
 *                   - active
 *                   - inactive
 *                   - out_of_stock
 *                 example: "active"
 *               isDefault:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Variant created successfully
 *       400:
 *         description: Invalid input or SKU already exists
 *       404:
 *         description: Base product not found
 */
router.post(
  "/:productId/variants",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/products"),
  uploadMultiple("images", 5),
  createVariant,
);

/**
 * @swagger
 * /api/products/variants/{variantId}:
 *   put:
 *     summary: Update an existing toy variant
 *     description: Modify details of a specific toy variant. Supports image replacement via multipart/form-data. (Admin only)
 *     tags:
 *       - Variants
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the Variant to update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               sku:
 *                 type: string
 *                 example: "TOY-CAR-RED-002"
 *               barcode:
 *                 type: string
 *                 example: "1234567890123"
 *               attributes:
 *                 type: string
 *                 description: Flexible attributes (JSON stringified)
 *                 example: '{"Color": "Crimson Red"}'
 *               price:
 *                 type: number
 *                 example: 29.99
 *               originalPrice:
 *                 type: number
 *                 example: 39.99
 *               stock:
 *                 type: number
 *                 example: 50
 *               lowStockAlert:
 *                 type: number
 *                 example: 10
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Upload new images to replace existing ones (Up to 5)"
 *               weight:
 *                 type: number
 *                 example: 500
 *               dimensions:
 *                 type: string
 *                 description: Dimensions (JSON stringified)
 *                 example: '{"length": 20, "width": 10, "height": 10}'
 *               status:
 *                 type: string
 *                 enum:
 *                   - active
 *                   - inactive
 *                   - out_of_stock
 *                 example: "active"
 *               isDefault:
 *                 type: boolean
 *                 example: false
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Variant updated successfully
 *       400:
 *         description: Invalid Variant ID format
 *       404:
 *         description: Variant not found
 */
router.put(
  "/variants/:variantId",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/products"),
  uploadMultiple("images", 5),
  updateVariant,
);

/**
 * @swagger
 * /api/products/variants/{variantId}:
 *   delete:
 *     summary: Delete a variant
 *     description: Delete a specific variant by its ID
 *     tags:
 *       - Variants
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         description: The ID of the variant to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variant deleted successfully
 *       400:
 *         description: Invalid Variant ID format
 *       404:
 *         description: Variant not found
 */
router.delete(
  "/variants/:variantId",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/products"),
  deleteVariant,
);

export default router;
