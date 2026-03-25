import { Router } from "express";
import authRoutes from "./authRoutes";
import uploadRoutes from "./uploadRoutes";
import productRoutes from "./productRoutes";
import categoryRoutes from "./categoryRoutes";
import offerRoutes from "./offerRoutes";
import siteSettingsRoutes from "./siteSettingsRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/offers", offerRoutes);
router.use("/site-settings", siteSettingsRoutes);

export default router;