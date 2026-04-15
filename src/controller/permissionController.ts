import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { PermissionService } from "../services/permissionService";
import AppError from "../utils/appError";
import { sendSuccessResponse } from "../utils/apiResponse";

/**
 * MED-8: All responses standardized to use sendSuccessResponse.
 * MED-7: checkAccess now wrapped in asyncHandler (was previously manual try/catch).
 * Handlers converted from static methods with manual try/catch to asyncHandler wrappers.
 */
export class PermissionController {
  /**
   * PUT /api/permissions/:userId
   * Overwrite full permission set for a user
   */
  static updatePermissions = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const { permissions } = req.body;

    if (!permissions) throw new AppError("Permissions data is required", 400);

    const updated = await PermissionService.updatePermissions(userId, permissions);
    return sendSuccessResponse(res, 200, "Permissions updated successfully", updated);
  });

  /**
   * GET /api/permissions/:userId
   */
  static getPermissions = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const permissions = await PermissionService.getPermissions(userId);
    return sendSuccessResponse(res, 200, "Permissions fetched successfully", permissions);
  });

  /**
   * POST /api/permissions/check
   * MED-7: authorizationMiddleware(["admin"]) added in route file.
   */
  static checkAccess = asyncHandler(async (req: Request, res: Response) => {
    const { userId, route } = req.body;

    if (!userId || !route) throw new AppError("userId and route are required", 400);

    const allowed = await PermissionService.checkRouteAccess(userId, route);
    return sendSuccessResponse(res, 200, "Access check complete", { allowed });
  });

  /**
   * PATCH /api/permissions/:userId
   * Update or append a single permission entry.
   */
  static patchPermission = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const { route, label, visible, enabled } = req.body;

    if (!route) throw new AppError("Route is required for patching", 400);

    const permissions = await PermissionService.getPermissions(userId);
    const index = permissions.findIndex((p) => p.route === route);

    if (index === -1) {
      permissions.push({
        route,
        label: label || route,
        visible: visible ?? true,
        enabled: enabled ?? true,
      });
    } else {
      if (label !== undefined) permissions[index].label = label;
      if (visible !== undefined) permissions[index].visible = visible;
      if (enabled !== undefined) permissions[index].enabled = enabled;
    }

    const updated = await PermissionService.updatePermissions(userId, permissions);
    return sendSuccessResponse(res, 200, "Permission patched successfully", updated);
  });

  /**
   * GET /api/permissions/routes
   */
  static getRouteList(req: Request, res: Response) {
    return sendSuccessResponse(
      res,
      200,
      "Available routes retrieved successfully",
      PermissionService.AVAILABLE_ROUTES,
    );
  }
}
