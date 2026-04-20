import { Router } from "express";
import {
  login,
  logout,
  getCurrentUser,
  refreshAccessToken,
  changePassword,
} from "../controller/authController";
import { authLimiter } from "../middlewares/rateLimiter";
import { authMiddleware } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { loginSchema, changePasswordSchema } from "../utils/validators/authValidators";

const router = Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticate user with email and password, returns JWT tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "SecurePass123!@"
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: "accessToken=jwt_token_here; HttpOnly; Secure"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Invalid email or password
 *       400:
 *         description: Missing required fields
 */
router.post("/login", authLimiter, validateRequest(loginSchema), login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Clear authentication tokens and end user session
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 */
router.post("/logout", logout);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Generate a new access token using a valid refresh token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIs..."
 *     responses:
 *       200:
 *         description: New access token generated
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: "accessToken=new_jwt_token_here; HttpOnly; Secure"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Token refreshed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", refreshAccessToken);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Fetch authenticated user's profile information
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User profile retrieved"
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Token missing or invalid
 */
router.get("/me", authMiddleware, getCurrentUser);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Update user's password with current password verification
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPass123!@"
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: "Must contain uppercase, lowercase, number, and special character"
 *                 example: "NewPass456!@"
 *               passwordConfirm:
 *                 type: string
 *                 example: "NewPass456!@"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       401:
 *         description: Unauthorized or current password incorrect
 *       400:
 *         description: Validation error in password requirements
 */
router.post("/change-password", authMiddleware, validateRequest(changePasswordSchema), changePassword);

export default router;
