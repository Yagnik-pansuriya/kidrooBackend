import { Router } from "express";
import {
  getCartSummary,
  getAllCarts,
  getCartByCustomer,
} from "../controller/adminCartController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// All routes: admin only
router.use(authMiddleware, authorizationMiddleware(["admin"]));

// GET /api/admin/carts/summary  (must be before /:customerId)
router.get("/summary", getCartSummary);

// GET /api/admin/carts
router.get("/", getAllCarts);

// GET /api/admin/carts/:customerId
router.get("/:customerId", getCartByCustomer);

export default router;
