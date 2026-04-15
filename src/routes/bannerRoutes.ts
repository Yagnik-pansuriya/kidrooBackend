import { Router } from "express";
import {
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../controller/bannerController";
import { uploadSingle } from "../middlewares/upload.middleware";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { createBannerSchema, updateBannerSchema } from "../utils/validators/bannerValidators";

const router = Router();

/**
 * @swagger
 * /api/banners:
 *   get:
 *     summary: Get all banners
 *     description: Retrieve all banners. Use ?activeOnly=true for public listing.
 *     tags:
 *       - Banners
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *         description: Retrieve only active banners
 *     responses:
 *       200:
 *         description: Banners fetched successfully
 */
router.get("/", getAllBanners);

/**
 * @swagger
 * /api/banners/{id}:
 *   get:
 *     summary: Get a banner by ID
 *     tags:
 *       - Banners
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Banner fetched successfully
 */
router.get("/:id", getBannerById);

// Admin: CRUD

/**
 * @swagger
 * /api/banners:
 *   post:
 *     summary: Create a banner
 *     description: Upload a new standard banner (Admin only).
 *     tags:
 *       - Banners
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Summer Sale Banner"
 *               targetUrl:
 *                 type: string
 *                 example: "/offers"
 *               order:
 *                 type: number
 *                 example: 1
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: "Banner image to upload"
 *     responses:
 *       201:
 *         description: Banner created successfully
 *       400:
 *         description: Missing fields or invalid image
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  validateRequest(createBannerSchema), // HIGH-7: validated before upload to avoid wasted I/O
  uploadSingle("image"),
  createBanner,
);

/**
 * @swagger
 * /api/banners/{id}:
 *   put:
 *     summary: Update a banner
 *     description: Modify a banner mapping. Replaces image if provided. (Admin only)
 *     tags:
 *       - Banners
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               targetUrl:
 *                 type: string
 *               order:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner updated successfully
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  validateRequest(updateBannerSchema), // HIGH-7: validated before upload
  uploadSingle("image"),
  updateBanner,
);

/**
 * @swagger
 * /api/banners/{id}:
 *   delete:
 *     summary: Delete a banner
 *     description: Remove a banner entirely and delete its image. (Admin only)
 *     tags:
 *       - Banners
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Banner deleted successfully
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  deleteBanner,
);

export default router;
