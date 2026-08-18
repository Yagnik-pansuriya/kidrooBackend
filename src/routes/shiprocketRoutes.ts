import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";

const router = Router();

/**
 * @swagger
 * /api/shiprocket/login:
 *   post:
 *     summary: Authenticate with Shiprocket API
 *     description: Authenticate and retrieve a JWT token from Shiprocket. If credentials are not provided in the body, it falls back to those configured in the environment variables.
 *     tags:
 *       - Shiprocket
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "Kidrooshop@gmail.com"
 *               password:
 *                 type: string
 *                 example: "Kidroo#shiprocket3"
 *     responses:
 *       200:
 *         description: Shiprocket login successful, returns JWT token details
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
 *                   example: "Shiprocket authentication successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1Ni..."
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Authentication failed (wrong credentials)
 *       500:
 *         description: Server error
 */
router.post(
  "/login",
  asyncHandler(async (req: Request, res: Response) => {
    let email = req.body.email;
    let password = req.body.password;

    if (!email || !password) {
      email = (process.env.SHIPROCKET_EMAIL || "").replace(/"/g, "").trim();
      password = (process.env.SHIPROCKET_PASSWORD || "").replace(/"/g, "").trim();
    }

    if (!email || !password || email.includes("your_") || password.includes("your_")) {
      throw new AppError("Credentials are not provided in the request body and not configured in env.", 400);
    }

    try {
      const response = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: data.message || `Shiprocket login failed with status ${response.status}`,
          error: data,
        });
      }

      return sendSuccessResponse(res, 200, "Shiprocket authentication successful", data);
    } catch (err: any) {
      throw new AppError(`Shiprocket login failed: ${err.message}`, 500);
    }
  })
);

export default router;
