import { Router } from "express";
import {
  getProductReviews,
  getProductStats,
  addReview,
  getAllReviews,
  deleteReview,
  toggleReviewApproval,
} from "../controller/reviewController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { customerAuthMiddleware } from "../middlewares/customerAuthMiddleware";

const router = Router();

// ── Public routes ─────────────────────────────────────────────

/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   get:
 *     summary: Get all approved reviews for a product
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved approved reviews
 */
router.get("/product/:productId", getProductReviews);

/**
 * @swagger
 * /api/reviews/product/{productId}/stats:
 *   get:
 *     summary: Get review statistics for a product
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved review stats
 */
router.get("/product/:productId/stats", getProductStats);

/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   post:
 *     summary: Add a new review
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - rating
 *               - title
 *               - comment
 *             properties:
 *               name:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review successfully added
 */
// Customer-only: must be authenticated to add a review
router.post("/product/:productId", customerAuthMiddleware, addReview);

// ── Admin routes ──────────────────────────────────────────────

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: Get all reviews (Admin only)
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Successfully retrieved all reviews
 */
router.get("/", authMiddleware, authorizationMiddleware(["admin"]), getAllReviews);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete a review (Admin only)
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review successfully deleted
 */
router.delete("/:id", authMiddleware, authorizationMiddleware(["admin"]), deleteReview);

/**
 * @swagger
 * /api/reviews/{id}/toggle:
 *   patch:
 *     summary: Toggle approval status of a review (Admin only)
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Approval successfully toggled
 */
router.patch("/:id/toggle", authMiddleware, authorizationMiddleware(["admin"]), toggleReviewApproval);

export default router;
