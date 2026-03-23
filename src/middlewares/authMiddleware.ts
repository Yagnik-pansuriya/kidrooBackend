import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import AppError from "../utils/appError";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token = req.cookies?.accessToken;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      throw new AppError("No token provided. Please log in.", 401);
    }

    const decoded = verifyToken(token);

    (req as any).userId = decoded.id;
    (req as any).user = decoded;

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Invalid or expired token", 401));
    }
  }
};

export const authorizationMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const userRole = (req as any).user?.role;

      if (!userRole || !allowedRoles.includes(userRole)) {
        throw new AppError(
          "You do not have permission to access this resource",
          403,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
