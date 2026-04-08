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
router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);

// ── Admin routes ──────────────────────────────────────────────
router.get("/", authMiddleware, authorizationMiddleware(["admin"]), getAllSubscribers);
router.get("/stats", authMiddleware, authorizationMiddleware(["admin"]), getStats);
router.delete("/:id", authMiddleware, authorizationMiddleware(["admin"]), checkPermission("/newsletter"), removeSubscriber);

export default router;
