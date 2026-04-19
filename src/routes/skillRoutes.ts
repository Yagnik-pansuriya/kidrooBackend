import { Router } from "express";
import {
  getAllSkills,
  getSkillById,
  createSkill,
  updateSkill,
  deleteSkill,
} from "../controller/skillController";
import { upload } from "../middlewares/upload.middleware";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";

const router = Router();

/**
 * @swagger
 * /api/skills:
 *   get:
 *     summary: Get all skills
 *     tags: [Skills]
 *     responses:
 *       200:
 *         description: Successfully retrieved skills
 */
router.get("/", getAllSkills);

/**
 * @swagger
 * /api/skills/{id}:
 *   get:
 *     summary: Get a skill by ID
 *     tags: [Skills]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved skill
 */
router.get("/:id", getSkillById);

/**
 * @swagger
 * /api/skills:
 *   post:
 *     summary: Create a skill
 *     tags: [Skills]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - image
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Skill created
 */
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  upload.fields([{ name: "image", maxCount: 1 }]),
  checkPermission("/skills"),
  createSkill,
);

/**
 * @swagger
 * /api/skills/{id}:
 *   put:
 *     summary: Update a skill
 *     tags: [Skills]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Skill updated
 */
router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  upload.fields([{ name: "image", maxCount: 1 }]),
  checkPermission("/skills"),
  updateSkill,
);

/**
 * @swagger
 * /api/skills/{id}:
 *   delete:
 *     summary: Delete a skill
 *     tags: [Skills]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Skill deleted
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/skills"),
  deleteSkill,
);

export default router;
