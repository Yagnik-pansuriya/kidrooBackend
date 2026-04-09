import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/userService";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export class UserController {
  /**
   * List all users
   */
  static listUsers = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const users = await UserService.getAllUsers();
    return sendSuccessResponse(res, 200, "Users retrieved successfully", users);
  });

  /**
   * Get single user
   */
  static getUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as { id: string };
    const user = await UserService.getUserById(id);
    return sendSuccessResponse(res, 200, "User retrieved successfully", user);
  });

  /**
   * Create user
   */
  static createUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserService.createUser(req.body);
    return sendSuccessResponse(res, 201, "User created successfully", user);
  });

  /**
   * Update user
   */
  static updateUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as { id: string };
    const user = await UserService.updateUser(id, req.body);
    return sendSuccessResponse(res, 200, "User updated successfully", user);
  });

  /**
   * Delete user
   */
  static deleteUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as { id: string };
    await UserService.deleteUser(id);
    return sendSuccessResponse(res, 200, "User deleted successfully");
  });
}
