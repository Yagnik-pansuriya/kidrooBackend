import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";
const isServerless = process.env.VERCEL === "1";

// General rate limiting
// Note: In serverless (Vercel), rate limiting is per-container,
// so it's less effective. For proper rate limiting in serverless,
// consider using Vercel's built-in rate limiting or an external store (Redis).
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isServerless ? 200 : isProduction ? 50 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
  message: "Too many requests from this IP, please try again later.",
});

// Stricter rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isServerless ? 20 : isProduction ? 5 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again later.",
});
