import { Router } from "express";
import {
  getAllCustomers,
  getCustomerById,
  toggleCustomerStatus,
} from "../controller/adminCustomerController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// All routes: admin only
router.use(authMiddleware, authorizationMiddleware(["admin"]));

// GET /api/admin/customers
router.get("/", getAllCustomers);

// GET /api/admin/customers/:id
router.get("/:id", getCustomerById);

// PATCH /api/admin/customers/:id/status
router.patch("/:id/status", toggleCustomerStatus);

export default router;
