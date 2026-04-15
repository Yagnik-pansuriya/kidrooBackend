import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import AppError from "../utils/appError";

/**
 * Middleware to authenticate customer (user-side) requests.
 * Checks for JWT token in cookies or Authorization header.
 * Sets req.customerId and req.customer on success.
 */
export const customerAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check cookie first, then X-Customer-Token header, then Authorization header
    let token = req.cookies?.customerAccessToken;

    if (!token) {
      // Check custom customer header (sent when both admin and customer tokens exist)
      const customerHeader = req.headers["x-customer-token"];
      if (customerHeader && typeof customerHeader === "string" && customerHeader.startsWith("Bearer ")) {
        token = customerHeader.substring(7);
      }
    }

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      throw new AppError("Please login to continue", 401);
    }

    const decoded = verifyToken(token);

    // Verify this is a customer token (not admin)
    if (decoded.role !== "customer") {
      throw new AppError("Invalid token type", 401);
    }

    (req as any).customerId = decoded.id;
    (req as any).customer = decoded;

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Invalid or expired token. Please login again.", 401));
    }
  }
};

/**
 * Optional customer auth — does NOT throw if no token present.
 * If token exists, sets req.customerId. If not, continues anyway.
 * Useful for routes that work for both guests and logged-in users.
 */
export const optionalCustomerAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = req.cookies?.customerAccessToken;

    if (!token) {
      const customerHeader = req.headers["x-customer-token"];
      if (customerHeader && typeof customerHeader === "string" && customerHeader.startsWith("Bearer ")) {
        token = customerHeader.substring(7);
      }
    }

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded.role === "customer") {
        (req as any).customerId = decoded.id;
        (req as any).customer = decoded;
      }
    }

    next();
  } catch {
    // Token invalid/expired — continue as guest
    next();
  }
};
