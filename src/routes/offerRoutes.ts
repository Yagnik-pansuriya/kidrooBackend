import { Router } from "express";
import {
  createOffer,
  updateOffer,
  deleteOffer,
  getAllOffers,
  getOfferById,
} from "../controller/offerController";
import { uploadMultiple } from "../middlewares/upload.middleware";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { checkPermission } from "../middlewares/permissionMiddleware";
import {
  createOfferSchema,
  updateOfferSchema,
} from "../utils/validators/offerValidators";

const router = Router();

/**
 * @swagger
 * /api/offers:
 *   get:
 *     summary: Get all offers
 *     description: Retrieve a list of all offers or active offers
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *         required: false
 *         description: If true, fetch only active and currently valid offers
 *     responses:
 *       200:
 *         description: Successfully retrieved list of offers
 *       500:
 *         description: Server error
 */
router.get("/", authMiddleware, checkPermission("/offers"), getAllOffers);

/**
 * @swagger
 * /api/offers/{id}:
 *   get:
 *     summary: Get an offer by ID
 *     description: Retrieve a single offer by its database ID
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the offer
 *       404:
 *         description: Offer not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authMiddleware, checkPermission("/offers"), getOfferById);

/**
 * @swagger
 * /api/offers:
 *   post:
 *     summary: Create a new offer with images
 *     description: Create an offer with image uploads (Admin only)
 *     tags:
 *       - Offers
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - type
 *               - validity
 *             properties:
 *               title:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               description:
 *                 type: string
 *               discountPercentage:
 *                 type: number
 *               type:
 *                 type: string
 *                 enum:
 *                   - slider
 *                   - fullscreen-poster
 *                   - post
 *                   - buyable
 *               targetUrl:
 *                 type: string
 *               couponCode:
 *                 type: string
 *               bgColor:
 *                 type: string
 *               textColor:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               validity:
 *                 type: string
 *                 description: 'JSON string like {"from":"2023-01-01","to":"2023-12-31"}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Offer created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/offers"),
  uploadMultiple("images", 5),
  validateRequest(createOfferSchema),
  createOffer,
);

/**
 * @swagger
 * /api/offers/{id}:
 *   put:
 *     summary: Update an offer with optional images
 *     description: Update offer details and optionally upload new images (Admin only)
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               description:
 *                 type: string
 *               discountPercentage:
 *                 type: number
 *               type:
 *                 type: string
 *                 enum:
 *                   - slider
 *                   - fullscreen-poster
 *                   - post
 *                   - buyable
 *               targetUrl:
 *                 type: string
 *               couponCode:
 *                 type: string
 *               bgColor:
 *                 type: string
 *               textColor:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               validity:
 *                 type: string
 *                 description: 'JSON string like {"from":"2023-01-01","to":"2023-12-31"}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Offer updated successfully
 *       404:
 *         description: Offer not found
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/offers"),
  uploadMultiple("images", 5),
  validateRequest(updateOfferSchema),
  updateOffer,
);

/**
 * @swagger
 * /api/offers/{id}:
 *   delete:
 *     summary: Delete an offer and its images
 *     description: Remove offer and clean up images from Cloudinary (Admin only)
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer deleted successfully
 *       404:
 *         description: Offer not found
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/offers"),
  deleteOffer,
);

export default router;
