import { Router } from "express";
import {
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getWishlist,
  toggleWishlist,
  clearWishlist,
} from "../controller/customerController";
import { customerAuthMiddleware } from "../middlewares/customerAuthMiddleware";

const router = Router();

// All routes below require customer authentication
router.use(customerAuthMiddleware);

// ── Profile ───────────────────────────────────────────────────
router.put("/profile", updateProfile);
router.post("/change-password", changePassword);

// ── Addresses ─────────────────────────────────────────────────
router.post("/addresses", addAddress);
router.put("/addresses/:addressId", updateAddress);
router.delete("/addresses/:addressId", deleteAddress);
router.patch("/addresses/:addressId/default", setDefaultAddress);

// ── Wishlist ──────────────────────────────────────────────────
router.get("/wishlist", getWishlist);
router.post("/wishlist/:productId", toggleWishlist);
router.delete("/wishlist", clearWishlist);

export default router;
