import { Router } from "express";
import { customerAuthMiddleware } from "../middlewares/customerAuthMiddleware";
import {
  createOrder,
  verifyPayment,
  getMyOrders,
  getMyOrderById,
} from "../controller/orderController";

const router = Router();

// All customer order routes require customer authentication
router.use(customerAuthMiddleware);

/**
 * @swagger
 * /api/customer/orders:
 *   post:
 *     summary: Create a new order
 *     description: Create order with online payment (Razorpay) or Cash on Delivery
 *     tags:
 *       - Customer Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items, paymentMethod, shippingAddress]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     variantId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [online, cod]
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   fullName:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   houseNo:
 *                     type: string
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Unauthorized
 */
router.post("/", createOrder);

/**
 * @swagger
 * /api/customer/orders/verify-payment:
 *   post:
 *     summary: Verify Razorpay payment
 *     description: Verify payment signature after Razorpay checkout completion
 *     tags:
 *       - Customer Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId]
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Verification failed
 */
router.post("/verify-payment", verifyPayment);

/**
 * @swagger
 * /api/customer/orders:
 *   get:
 *     summary: Get customer's orders
 *     description: Retrieve all orders for the authenticated customer
 *     tags:
 *       - Customer Orders
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
router.get("/", getMyOrders);

/**
 * @swagger
 * /api/customer/orders/{id}:
 *   get:
 *     summary: Get order detail
 *     description: Retrieve a specific order for the authenticated customer
 *     tags:
 *       - Customer Orders
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order fetched successfully
 *       404:
 *         description: Order not found
 */
router.get("/:id", getMyOrderById);

export default router;
