import { Router } from "express";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";
import {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../controller/orderController";

const router = Router();

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders (Admin)
 *     description: Retrieve all orders with filtering and pagination
 *     tags:
 *       - Admin Orders
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, confirmed, processing, shipped, delivered, cancelled]
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [all, pending, paid, failed, refunded]
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *           enum: [all, online, cod]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
router.get(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  getAllOrders,
);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order detail (Admin)
 *     tags:
 *       - Admin Orders
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order fetched successfully
 */
router.get(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  getOrderById,
);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update order status (Admin)
 *     tags:
 *       - Admin Orders
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
 *             required: [orderStatus]
 *             properties:
 *               orderStatus:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled]
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, paid, failed, refunded]
 *     responses:
 *       200:
 *         description: Order status updated
 */
router.patch(
  "/:id/status",
  authMiddleware,
  authorizationMiddleware(["admin", "moderator"]),
  updateOrderStatus,
);

export default router;
