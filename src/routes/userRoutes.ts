import { Router } from "express";
import { UserController } from "../controller/userController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { createUserSchema, updateUserSchema } from "../utils/validators/userValidators";
import { checkPermission } from "../middlewares/permissionMiddleware";

const router = Router();

// All user management routes are protected: only admins can manage users
router.use(authMiddleware, authorizationMiddleware(["admin"]), checkPermission("/users"));

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users
 *     description: Retrieve a list of all users registered in the system. (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user list
 */
router.get("/", UserController.listUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get single user details
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved user
 */
router.get("/:id", UserController.getUser);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     description: Register a new user and auto-initialize permissions. (Admin only)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, userName, email, password]
 *             properties:
 *               name: { type: string }
 *               userName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [user, admin, moderator] }
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post("/", validateRequest(createUserSchema), UserController.createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user details
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               userName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [user, admin, moderator] }
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.put("/:id", validateRequest(updateUserSchema), UserController.updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user and their permissions
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete("/:id", UserController.deleteUser);

export default router;
