import UserPermission, { IPermission } from "../models/userPermission";
import { CacheService } from "./redisCacheService";
import AppError from "../utils/appError";
import mongoose from "mongoose";

export class PermissionService {
  private static CACHE_KEY_PREFIX = "permissions:";
  
  // Standard routes available for permission assignment
  public static readonly AVAILABLE_ROUTES = [
    { route: "/products", label: "Products & Inventory" },
    { route: "/categories", label: "Categories" },
    { route: "/offers", label: "Offers & Promotions" },
    { route: "/site-settings", label: "Site Settings" },
    { route: "/users", label: "User Management" },
    { route: "/permissions", label: "Permissions Management" },
    { route: "/upload", label: "File Uploads" },
  ];

  /**
   * Update permissions for a user (Overwrite)
   */
  static async updatePermissions(userId: string, permissions: IPermission[]) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }

    // Overwrite existing permissions or create new one
    const userPermission = await UserPermission.findOneAndUpdate(
      { userId },
      { permissions },
      { upsert: true, new: true, runValidators: true }
    );

    // Invalidate cache
    await CacheService.del(`${this.CACHE_KEY_PREFIX}${userId}`);
    
    // Set new cache (optional but good for performance)
    await CacheService.set(`${this.CACHE_KEY_PREFIX}${userId}`, permissions);

    return userPermission;
  }

  /**
   * Get permissions for a user
   */
  static async getPermissions(userId: string): Promise<IPermission[]> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }

    // Try cache first
    const cached = await CacheService.get(`${this.CACHE_KEY_PREFIX}${userId}`);
    if (cached) return cached;

    // Fallback to DB
    const userPermission = await UserPermission.findOne({ userId });
    const permissions = userPermission ? userPermission.permissions : [];

    // Cache for future use
    await CacheService.set(`${this.CACHE_KEY_PREFIX}${userId}`, permissions);

    return permissions;
  }

  /**
   * Check if a route is enabled for a user
   */
  static async checkRouteAccess(userId: string, route: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    
    const permission = permissions.find(p => p.route === route);
    
    // If permission doesn't exist, it might be restricted by default or not yet set
    // Based on requirements, we check if enabled === true
    return permission ? permission.enabled : false;
  }

  /**
   * Delete permissions for a user
   */
  static async deletePermissions(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }

    await UserPermission.deleteOne({ userId });
    await CacheService.del(`${this.CACHE_KEY_PREFIX}${userId}`);
  }
}
