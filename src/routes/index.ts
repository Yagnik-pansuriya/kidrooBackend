import { Router } from "express";
import authRoutes from "./authRoutes";
import uploadRoutes from "./uploadRoutes";
import productRoutes from "./productRoutes";
import categoryRoutes from "./categoryRoutes";
import offerRoutes from "./offerRoutes";
import siteSettingsRoutes from "./siteSettingsRoutes";
import permissionRoutes from "./permissionRoutes";
import userRoutes from "./userRoutes";
import newsletterRoutes from "./newsletterRoutes";
import reviewRoutes from "./reviewRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/offers", offerRoutes);
router.use("/site-settings", siteSettingsRoutes);
router.use("/permissions", permissionRoutes);
router.use("/users", userRoutes);
router.use("/newsletter", newsletterRoutes);
router.use("/reviews", reviewRoutes);

export default router;