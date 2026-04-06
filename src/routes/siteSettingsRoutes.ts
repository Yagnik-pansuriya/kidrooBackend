import { Router } from "express";
import { getSettings, updateSettings } from "../controller/siteSettingsController";
import { uploadSingle } from "../middlewares/upload.middleware";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";

const router = Router();

/**
 * @swagger
 * /api/site-settings:
 *   get:
 *     summary: Get site settings
 *     description: Retrieve general site information, logo, and theme colors.
 *     tags:
 *       - Site Settings
 *     responses:
 *       200:
 *         description: Successfully retrieved site settings
 *       500:
 *         description: Server error
 */
router.get("/", getSettings);

/**
 * @swagger
 * /api/site-settings:
 *   put:
 *     summary: Update site settings
 *     description: Update site information, upload logo, and change theme colors. (Admin only)
 *     tags:
 *       - Site Settings
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               siteName:
 *                 type: string
 *                 example: "Kidroo Toys"
 *               tagline:
 *                 type: string
 *                 example: "Where Imagination Comes to Play! 🎈"
 *               contactEmail:
 *                 type: string
 *                 example: "hello@kidrootoys.com"
 *               contactPhone:
 *                 type: string
 *                 example: "+91 1800 123 4567"
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: "Site logo image"
 *               themeColors:
 *                 type: string
 *                 description: "JSON stringified theme colors: {primary, hover, header, footer}"
 *                 example: '{"primary": "#FF6B35", "hover": "#E55A25", "header": "#000000", "footer": "#031268"}'
 *     responses:
 *       200:
 *         description: Site settings updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       500:
 *         description: Server error
 */
router.put(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/site-settings"),
  uploadSingle("logo"),
  updateSettings,
);

export default router;
