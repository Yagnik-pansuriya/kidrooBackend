import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { uploadSingle, uploadMultiple } from "../middlewares/upload.middleware";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/uploadToCloudinary";
import AppError from "../utils/appError";
import { Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/upload/single:
 *   post:
 *     summary: Upload single image
 *     description: Upload a single image to Cloudinary CDN
 *     tags:
 *       - File Upload
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: "Image file (JPG, PNG, GIF, WebP max 5MB)"
 *     responses:
 *       200:
 *         description: Image uploaded successfully
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
 *                   example: "Image uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     public_id:
 *                       type: string
 *                       example: "kidroo/examples/abc123"
 *                     secure_url:
 *                       type: string
 *                       format: uri
 *                       example: "https://res.cloudinary.com/..."
 *                     url:
 *                       type: string
 *                       format: uri
 *                     resource_type:
 *                       type: string
 *                       example: "image"
 *       400:
 *         description: No image provided or invalid file type
 *       413:
 *         description: File size exceeds 5MB limit
 */
router.post(
  "/single",
  uploadSingle("image"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError("Image is required", 400);
    }

    const result = await uploadToCloudinary(req.file.path, {
      folder: "kidroo/examples",
    });

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      data: result,
    });
  }),
);

/**
 * @swagger
 * /api/upload/multiple:
 *   post:
 *     summary: Upload multiple images
 *     description: Upload multiple images (up to 5) to Cloudinary CDN at once
 *     tags:
 *       - File Upload
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Multiple image files (max 5 files, each max 5MB)"
 *     responses:
 *       200:
 *         description: Images uploaded successfully
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
 *                   example: "Images uploaded successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       public_id:
 *                         type: string
 *                       secure_url:
 *                         type: string
 *                         format: uri
 *                       url:
 *                         type: string
 *                         format: uri
 *       400:
 *         description: No images provided or invalid files
 *       413:
 *         description: Too many files (max 5) or file too large
 */
router.post(
  "/multiple",
  uploadMultiple("images", 5),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.files || (req.files as any[]).length === 0) {
      throw new AppError("Images are required", 400);
    }

    const uploadResults = await Promise.all(
      (req.files as Express.Multer.File[]).map((file) =>
        uploadToCloudinary(file.path, {
          folder: "kidroo/examples",
        }),
      ),
    );

    res.status(200).json({
      success: true,
      message: "Images uploaded successfully",
      data: uploadResults,
    });
  }),
);

/**
 * @swagger
 * /api/upload/custom:
 *   post:
 *     summary: Upload file with custom folder and name
 *     description: Upload a file to Cloudinary with custom folder path and public ID
 *     tags:
 *       - File Upload
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *         description: "Custom folder path (default: kidroo/custom)"
 *         example: "products/categories"
 *       - in: query
 *         name: public_id
 *         schema:
 *           type: string
 *         description: "Custom file name (without extension)"
 *         example: "product-123"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "File to upload (max 5MB)"
 *     responses:
 *       200:
 *         description: File uploaded successfully
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
 *                   example: "File uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     public_id:
 *                       type: string
 *                       example: "products/categories/product-123"
 *                     secure_url:
 *                       type: string
 *                       format: uri
 *       400:
 *         description: File not provided
 */
router.post(
  "/custom",
  uploadSingle("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError("File is required", 400);
    }

    const { folder, public_id } = req.query;

    const result = await uploadToCloudinary(req.file.path, {
      folder: (folder as string) || "kidroo/custom",
      public_id: public_id as string,
    });

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: result,
    });
  }),
);

/**
 * @swagger
 * /api/upload/{publicId}:
 *   delete:
 *     summary: Delete file from Cloudinary
 *     description: Remove a file from Cloudinary CDN by its public ID
 *     tags:
 *       - File Upload
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *         description: "Cloudinary public ID of the file to delete"
 *         example: "kidroo/examples/abc123"
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *           enum:
 *             - image
 *             - video
 *             - raw
 *         description: "Type of resource (default: image)"
 *         example: "image"
 *     responses:
 *       200:
 *         description: File deleted successfully
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
 *                   example: "File deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     result:
 *                       type: string
 *                       enum:
 *                         - ok
 *                         - not_found
 *                       example: "ok"
 *       400:
 *         description: Public ID is required
 *       404:
 *         description: File not found in Cloudinary
 */
router.delete(
  "/:publicId",
  asyncHandler(async (req: Request, res: Response) => {
    const publicId = req.params.publicId as string;
    const resourceType = req.query.resourceType as string | undefined;

    if (!publicId) {
      throw new AppError("Public ID is required", 400);
    }

    const result = await deleteFromCloudinary(
      publicId,
      resourceType || "image",
    );

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
      data: result,
    });
  }),
);

export default router;
