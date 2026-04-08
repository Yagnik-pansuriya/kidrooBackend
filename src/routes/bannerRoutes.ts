import { Router } from "express";
import {
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../controller/bannerController";
import { uploadSingle } from "../middlewares/upload.middleware";
import {
  authMiddleware,
  authorizationMiddleware,
} from "../middlewares/authMiddleware";
import { checkPermission } from "../middlewares/permissionMiddleware";

const router = Router();

// Public: get all banners (with ?activeOnly=true for user side)
router.get("/", getAllBanners);
router.get("/:id", getBannerById);

// Admin: CRUD
router.post(
  "/",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  uploadSingle("image"),
  createBanner,
);

router.put(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  uploadSingle("image"),
  updateBanner,
);

router.delete(
  "/:id",
  authMiddleware,
  authorizationMiddleware(["admin"]),
  checkPermission("/banners"),
  deleteBanner,
);

export default router;
