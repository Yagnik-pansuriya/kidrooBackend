import { Router } from "express";
import authRoutes from "./authRoutes";
import uploadRoutes from "./uploadRoutes";
import productRoutes from "./productRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);
router.use("/products", productRoutes);

export default router;