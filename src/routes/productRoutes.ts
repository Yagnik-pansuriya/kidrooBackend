// src/routes/productRoutes.ts
import { Router } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controller/productController";
import { uploadMultiple, uploadSingle } from "../middlewares/upload.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

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
 *               - name
 *               - price
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 example: "Wooden Toy Car"
 *               description:
 *                 type: string
 *                 example: "High-quality wooden toy car"
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 example: 29.99
 *               category:
 *                 type: string
 *                 example: "vehicles"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Upload up to 5 images"
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Product created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "https://res.cloudinary.com/..."
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error or upload failed
 */
router.post(
  "/",
  uploadMultiple("images", 5), // Name matches form field, max 5 files
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
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
router.put("/:id", uploadMultiple("images", 5), updateProduct);

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
router.delete("/:id", deleteProduct);

export default router;
