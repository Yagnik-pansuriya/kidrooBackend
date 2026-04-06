import { Router } from "express";
import { PermissionController } from "../controller/permissionController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { checkPermission } from "../middlewares/permissionMiddleware";
import { permissionSchema, checkAccessSchema } from "../utils/validators/permissionValidators";

const router = Router();

// ── GET routes: available to any authenticated admin (no permission check) ──

/**
 * @swagger
 * /api/permissions/routes:
 *   get:
 *     summary: Get all configurable routes for dropdowns
 *     description: Retrieve a list of all routes that can have permissions assigned. (Admin only, no permission check)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved route list
 */
router.get(
  "/routes",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  PermissionController.getRouteList
);

/**
 * @swagger
 * /api/permissions/{userId}:
 *   get:
 *     summary: Get permissions for a specific user
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved user permissions
 */
router.get(
  "/:userId",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  PermissionController.getPermissions
);

// ── Write routes: require permission check ──────────────────────────────────

/**
 * @swagger
 * /api/permissions/{userId}:
 *   put:
 *     summary: Overwrite full permission set for a user
 *     description: Replace the entire array of permissions for a specific user. (Admin only)
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Permission'
 *     responses:
 *       200:
 *         description: Permissions updated successfully
 */
router.put(
  "/:userId",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/permissions"),
  validateRequest(permissionSchema),
  PermissionController.updatePermissions
);

/**
 * @swagger
 * /api/permissions/check:
 *   post:
 *     summary: Check if a user has access to a specific route
 *     description: Internal check used to verify route-level access.
 *     tags: [Permissions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - route
 *             properties:
 *               userId:
 *                 type: string
 *               route:
 *                 type: string
 *     responses:
 *       200:
 *         description: Check completed
 */
router.post(
  "/check",
  authMiddleware,
  checkPermission("/permissions"),
  validateRequest(checkAccessSchema),
  PermissionController.checkAccess
);

/**
 * @swagger
 * /api/permissions/{userId}:
 *   patch:
 *     summary: Update or add a single permission for a user
 *     description: Patch a single permission route instead of overwriting everything. (Admin only)
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Permission'
 *     responses:
 *       200:
 *         description: Permission patched successfully
 */
router.patch(
  "/:userId",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/permissions"),
  PermissionController.patchPermission
);

export default router;
