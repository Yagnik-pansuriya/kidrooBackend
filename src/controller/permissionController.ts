import { Request, Response, NextFunction } from "express";
import { PermissionService } from "../services/permissionService";
import AppError from "../utils/appError";
import { sendSuccessResponse } from "../utils/apiResponse";

export class PermissionController {
  /**
   * Update permissions for a user (Overwrite)
   */
  static async updatePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params as { userId: string };
      const { permissions } = req.body;

      if (!permissions) {
        throw new AppError("Permissions data is required", 400);
      }

      await PermissionService.updatePermissions(userId, permissions);

      res.status(200).json({
        status: "success",
        message: "Permissions updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get permissions for a user
   */
  static async getPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params as { userId: string };
      const permissions = await PermissionService.getPermissions(userId);

      res.status(200).json({
        status: "success",
        data: permissions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if a route is enabled for a user
   */
  static async checkAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, route } = req.body;

      if (!userId || !route) {
        throw new AppError("userId and route are required", 400);
      }

      const allowed = await PermissionService.checkRouteAccess(userId, route);

      res.status(200).json({
        allowed,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a single permission (PATCH) - Optional but good for flexibility
   */
  static async patchPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params as { userId: string };
      const { route, label, visible, enabled } = req.body;

      if (!route) {
          throw new AppError("Route is required for patching", 400);
      }

      const permissions = await PermissionService.getPermissions(userId);
      const index = permissions.findIndex(p => p.route === route);

      if (index === -1) {
          permissions.push({ route, label: label || route, visible: visible ?? true, enabled: enabled ?? true });
      } else {
          if (label !== undefined) permissions[index].label = label;
          if (visible !== undefined) permissions[index].visible = visible;
          if (enabled !== undefined) permissions[index].enabled = enabled;
      }

      await PermissionService.updatePermissions(userId, permissions);

      res.status(200).json({
          status: "success",
          message: "Permission patched successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get list of all available routes for permissions dropdown
   */
  static getRouteList(req: Request, res: Response) {
    return sendSuccessResponse(
      res,
      200,
      "Available routes retrieved successfully",
      PermissionService.AVAILABLE_ROUTES
    );
  }
}
