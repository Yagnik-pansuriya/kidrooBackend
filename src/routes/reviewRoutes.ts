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
router.get("/product/:productId", getProductReviews);
router.get("/product/:productId/stats", getProductStats);

// ── Customer-only routes ──────────────────────────────────────
router.post("/product/:productId", customerAuthMiddleware, addReview);

// ── Admin routes ──────────────────────────────────────────────
router.get("/", authMiddleware, authorizationMiddleware(["admin"]), getAllReviews);
router.delete("/:id", authMiddleware, authorizationMiddleware(["admin"]), deleteReview);
router.patch("/:id/toggle", authMiddleware, authorizationMiddleware(["admin"]), toggleReviewApproval);

export default router;
