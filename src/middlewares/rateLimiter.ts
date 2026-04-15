import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";
const isServerless = process.env.VERCEL === "1";

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isServerless ? 200 : isProduction ? 50 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === "/health";
  },
  message: "Too many requests from this IP, please try again later.",
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isServerless ? 20 : isProduction ? 5 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again later.",
});

/** Stricter limiter for OTP send/resend to prevent Twilio SMS billing abuse. */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isServerless ? 10 : isProduction ? 3 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many OTP requests. Please wait before requesting another.",
});
