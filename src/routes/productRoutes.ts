// src/routes/productRoutes.ts
import { Router } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
} from "../controller/productController";
import { uploadMultiple, uploadSingle } from "../middlewares/upload.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { createProductSchema, updateProductSchema } from "../utils/validators/productValidators";

const router = Router();

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieve a list of all products
 *     tags:
 *       - Products
 *     responses:
 *       200:
 *         description: Successfully retrieved list of products
 *       500:
 *         description: Server error
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
 *               - tags
 *               - isActive
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
  uploadMultiple("images", 5),
  validateRequest(updateProductSchema),
  updateProduct
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
  deleteProduct
);

export default router;
