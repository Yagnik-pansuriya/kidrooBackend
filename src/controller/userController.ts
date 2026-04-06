import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/userService";
import { sendSuccessResponse } from "../utils/apiResponse";

export class UserController {
  /**
   * List all users
   */
  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await UserService.getAllUsers();
      return sendSuccessResponse(res, 200, "Users retrieved successfully", users);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single user
   */
  static async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const user = await UserService.getUserById(id);
      return sendSuccessResponse(res, 200, "User retrieved successfully", user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create user
   */
  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.createUser(req.body);
      return sendSuccessResponse(res, 201, "User created successfully", user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user
   */
  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      const user = await UserService.updateUser(id, req.body);
      return sendSuccessResponse(res, 200, "User updated successfully", user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user
   */
  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params as { id: string };
      await UserService.deleteUser(id);
      return sendSuccessResponse(res, 200, "User deleted successfully");
    } catch (error) {
      next(error);
    }
  }
}
