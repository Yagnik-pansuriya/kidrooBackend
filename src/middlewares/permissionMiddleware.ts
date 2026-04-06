import { Request, Response, NextFunction } from "express";
import { PermissionService } from "../services/permissionService";
import AppError from "../utils/appError";

/**
 * Middleware to check if a user has permission to access a specific route.
 * Assumes authMiddleware has already been called and req.userId is set.
 */
export const checkPermission = (route: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const user = (req as any).user;

      if (!userId) {
        throw new AppError("Authentication required to check permissions", 401);
      }

      // Admin role has full access to all routes
      if (user && user.role === "admin") {
        return next();
      }

      const allowed = await PermissionService.checkRouteAccess(userId, route);

      if (!allowed) {
        throw new AppError("You do not have permission to access this route", 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
