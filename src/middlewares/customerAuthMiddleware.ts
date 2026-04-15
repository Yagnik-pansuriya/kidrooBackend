import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import AppError from "../utils/appError";

/**
 * Authenticate customer requests.
 * - Reads token from customerAccessToken cookie → X-Customer-Token header → Authorization header
 * - Asserts token type = "access" (prevents refresh tokens from being used as access tokens)
 * - Asserts role = "customer" (prevents admin tokens from accessing customer routes)
 */
export const customerAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    let token = req.cookies?.customerAccessToken as string | undefined;

    if (!token) {
      const customerHeader = req.headers["x-customer-token"];
      if (
        customerHeader &&
        typeof customerHeader === "string" &&
        customerHeader.startsWith("Bearer ")
      ) {
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

    // Type assertion: only accept access tokens, never refresh tokens
    const decoded = verifyToken(token, "access");

    // Role guard: reject admin tokens used on customer routes
    if (decoded.role !== "customer") {
      throw new AppError("Access denied: invalid token role", 401);
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
 * Useful for routes accessible by both guests and logged-in customers.
 */
export const optionalCustomerAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    let token = req.cookies?.customerAccessToken as string | undefined;

    if (!token) {
      const customerHeader = req.headers["x-customer-token"];
      if (
        customerHeader &&
        typeof customerHeader === "string" &&
        customerHeader.startsWith("Bearer ")
      ) {
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
      const decoded = verifyToken(token, "access");
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
