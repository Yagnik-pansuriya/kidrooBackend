import { Router } from "express";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
} from "../controller/categoryController";
import { upload } from "../middlewares/upload.middleware";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { checkPermission } from "../middlewares/permissionMiddleware";
import { createCategorySchema, updateCategorySchema } from "../utils/validators/categoryValidators";

const router = Router();

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
 */
router.get("/", authMiddleware, checkPermission("/categories"), getAllCategories);

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Get a category by ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved category
 */
router.get("/:id", authMiddleware, checkPermission("/categories"), getCategoryById);

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - catagoryName
 *             properties:
 *               catagoryName:
 *                 type: string
 *               slug:
 *                 type: string
 *               count:
 *                 type: number
 *               image:
 *                 type: string
 *                 format: binary
 *               icon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Category created
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  upload.fields([{ name: "image", maxCount: 1 }, { name: "icon", maxCount: 1 }]),
  checkPermission("/categories"),
  validateRequest(createCategorySchema),
  createCategory
);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               catagoryName:
 *                 type: string
 *               slug:
 *                 type: string
 *               count:
 *                 type: number
 *               image:
 *                 type: string
 *                 format: binary
 *               icon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Category updated
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  upload.fields([{ name: "image", maxCount: 1 }, { name: "icon", maxCount: 1 }]),
  checkPermission("/categories"),
  validateRequest(updateCategorySchema),
  updateCategory
);

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/categories"),
  deleteCategory
);

export default router;
