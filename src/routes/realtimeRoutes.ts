import { Router } from "express";
import { getRealtimeToken } from "../controller/realtimeController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Admin-panel staff only (customer tokens share the JWT secret, so block them by role)
router.use(authMiddleware, authorizationMiddleware(["admin", "moderator", "user"]));

// GET /api/admin/realtime/token
router.get("/token", getRealtimeToken);

export default router;
