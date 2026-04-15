import { Router } from "express";
import {
  signup,
  resendOTP,
  verifyOTP,
  login,
  logout,
  refreshToken,
  getMe,
  forgotPassword,
  resetPassword,
} from "../controller/customerAuthController";
import { customerAuthMiddleware } from "../middlewares/customerAuthMiddleware";
import { authLimiter, otpLimiter } from "../middlewares/rateLimiter";

const router = Router();

// ── Public routes (unauthenticated) ───────────────────────────────

// Signup: validate + store in Redis + send Twilio OTP
router.post("/signup", authLimiter, signup);

// OTP management (stricter rate limit to protect Twilio billing)
router.post("/resend-otp", otpLimiter, resendOTP);
router.post("/verify-otp", otpLimiter, verifyOTP);

// Password-based login
router.post("/login", authLimiter, login);

// Token lifecycle
router.post("/logout", logout);
router.post("/refresh", authLimiter, refreshToken);

// Forgot / Reset password via SMS OTP
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);

// ── Protected routes (customerAccessToken required) ───────────────
router.get("/me", customerAuthMiddleware, getMe);

export default router;
