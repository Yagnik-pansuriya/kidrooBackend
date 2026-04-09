import { Router } from "express";
import {
  subscribe,
  unsubscribe,
  getAllSubscribers,
  getStats,
  removeSubscriber,
} from "../controller/newsletterController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";

const router = Router();

// ── Public routes ─────────────────────────────────────────────

/**
 * @swagger
 * /api/newsletter/subscribe:
 *   post:
 *     summary: Subscribe to newsletter
 *     description: Add an email to the newsletter subscription list.
 *     tags:
 *       - Newsletter
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "test@kidroo.com"
 *     responses:
 *       201:
 *         description: Subscribed successfully
 *       400:
 *         description: Email already subscribed
 */
router.post("/subscribe", subscribe);

/**
 * @swagger
 * /api/newsletter/unsubscribe:
 *   post:
 *     summary: Unsubscribe from newsletter
 *     description: Mark an email as inactive in the subscriber list.
 *     tags:
 *       - Newsletter
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "test@kidroo.com"
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *       404:
 *         description: Email not found
 */
router.post("/unsubscribe", unsubscribe);

// ── Admin routes ──────────────────────────────────────────────

/**
 * @swagger
 * /api/newsletter:
 *   get:
 *     summary: Get all subscribers
 *     description: Retrieve all emails on the newsletter list. (Admin only)
 *     tags:
 *       - Newsletter
 *     responses:
 *       200:
 *         description: Subscriber list fetched successfully
 */
router.get("/", authMiddleware, authorizationMiddleware(["admin"]), getAllSubscribers);

/**
 * @swagger
 * /api/newsletter/stats:
 *   get:
 *     summary: Get newsletter statistics
 *     description: Retrieve total, active, and inactive subscriber counts. (Admin only)
 *     tags:
 *       - Newsletter
 *     responses:
 *       200:
 *         description: Stats fetched successfully
 */
router.get("/stats", authMiddleware, authorizationMiddleware(["admin"]), getStats);

/**
 * @swagger
 * /api/newsletter/{id}:
 *   delete:
 *     summary: Delete a subscriber
 *     description: Permanently remove a subscriber by ID. (Admin only)
 *     tags:
 *       - Newsletter
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscriber deleted successfully
 */
router.delete("/:id", authMiddleware, authorizationMiddleware(["admin"]), checkPermission("/newsletter"), removeSubscriber);

export default router;
