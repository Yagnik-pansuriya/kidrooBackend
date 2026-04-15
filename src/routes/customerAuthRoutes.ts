import { Router } from "express";
import {
  signup,
  sendOTP,
  verifyOTP,
  login,
  logout,
  refreshToken,
  getMe,
} from "../controller/customerAuthController";
import { customerAuthMiddleware } from "../middlewares/customerAuthMiddleware";
import { authLimiter } from "../middlewares/rateLimiter";

const router = Router();

// ── Public routes ─────────────────────────────────────────────
router.post("/signup", authLimiter, signup);
router.post("/send-otp", authLimiter, sendOTP);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.post("/refresh", refreshToken);

// ── Protected routes ──────────────────────────────────────────
router.get("/me", customerAuthMiddleware, getMe);

export default router;
