import User from "../models/user";
import { PermissionService } from "./permissionService";
import AppError from "../utils/appError";
import mongoose from "mongoose";

export class UserService {
  /**
   * Get all users
   */
  static async getAllUsers() {
    return await User.find().select("-password");
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }

  /**
   * Create a new user
   */
  static async createUser(userData: any) {
    const existingUser = await User.findOne({ 
      $or: [{ email: userData.email }, { userName: userData.userName }] 
    });
    
    if (existingUser) {
      throw new AppError("User with this email or username already exists", 400);
    }

    const user = await User.create(userData);
    // Note: UserPermission is auto-created by the post-save hook in User model
    return user;
  }

  /**
   * Update user details
   */
  static async updateUser(userId: string, updateData: any) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Update fields manually so that pre-save hooks (password hashing) fire
    if (updateData.name !== undefined) user.name = updateData.name;
    if (updateData.userName !== undefined) user.userName = updateData.userName;
    if (updateData.email !== undefined) user.email = updateData.email;
    if (updateData.role !== undefined) user.role = updateData.role;
    if (updateData.password) user.password = updateData.password;

    await user.save();

    // Return without password
    const result = user.toObject();
    delete result.password;
    return result;
  }

  /**
   * Delete a user and their permissions
   */
  static async deleteUser(userId: string) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError("Invalid user ID", 400);
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Clean up permissions
    await PermissionService.deletePermissions(userId);

    return user;
  }
}
