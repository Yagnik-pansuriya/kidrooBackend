import { Router } from "express";
import {
  createOffer,
  updateOffer,
  deleteOffer,
  getAllOffers,
  getOfferById,
  getOffersByPage,
  getActiveOffers,
  reorderOffers,
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
 * /api/offers/page/{page}:
 *   get:
 *     summary: Get active offers for a specific page
 *     description: Public endpoint to fetch offers targeted at a page (home, shop, product, offers)
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: path
 *         name: page
 *         required: true
 *         schema:
 *           type: string
 *           enum: [home, shop, product, offers, custom]
 *       - in: query
 *         name: section
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional section within the page
 *     responses:
 *       200:
 *         description: Active offers for the page sorted by position
 */
router.get("/page/:page", getOffersByPage);

/**
 * @swagger
 * /api/offers/active:
 *   get:
 *     summary: Get all active offers (Public)
 *     description: Public endpoint that returns all active, currently-valid offers across all pages
 *     tags:
 *       - Offers
 *     responses:
 *       200:
 *         description: All active offers
 */
router.get("/active", getActiveOffers);

/**
 * @swagger
 * /api/offers:
 *   get:
 *     summary: Get all offers (Admin)
 *     tags:
 *       - Offers
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All offers
 */
router.get(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  getAllOffers
);

/**
 * @swagger
 * /api/offers/{id}:
 *   get:
 *     summary: Get offer by ID (Admin)
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
 *         description: Offer details
 */
router.get(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  getOfferById
);

/**
 * @swagger
 * /api/offers:
 *   post:
 *     summary: Create a new offer (Admin)
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
 *               - displayType
 *               - placement
 *               - validity
 *             properties:
 *               title:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               description:
 *                 type: string
 *               displayType:
 *                 type: string
 *                 enum: [single-banner, slider, top-banner, promo-section]
 *               placement:
 *                 type: string
 *                 description: JSON string with page, section, position
 *               styling:
 *                 type: string
 *                 description: JSON string with bgColor, textColor, overlayOpacity
 *               validity:
 *                 type: string
 *                 description: JSON string with from, to
 *               targetUrl:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Offer created
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  uploadMultiple("images", 10),
  validateRequest(createOfferSchema),
  createOffer
);

/**
 * @swagger
 * /api/offers/reorder:
 *   put:
 *     summary: Reorder offers on a page (Admin)
 *     tags:
 *       - Offers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: string
 *               orderedIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Offers reordered
 */
router.put(
  "/reorder",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  reorderOffers
);

/**
 * @swagger
 * /api/offers/{id}:
 *   put:
 *     summary: Update an offer (Admin)
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
 *         description: Offer updated
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  uploadMultiple("images", 10),
  validateRequest(updateOfferSchema),
  updateOffer
);

/**
 * @swagger
 * /api/offers/{id}:
 *   delete:
 *     summary: Delete an offer (Admin)
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
 *         description: Offer deleted
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  checkPermission("/offers"),
  deleteOffer
);

export default router;
