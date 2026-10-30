import { Router } from "express";
import {
  getOfferWhatsAppInfo,
  sendOfferOnWhatsApp,
  getCartWhatsAppInfo,
  sendCartReminderOnWhatsApp,
} from "../controller/adminWhatsappController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// All routes: admin only (these message real customers)
router.use(authMiddleware, authorizationMiddleware(["admin"]));

// GET  /api/admin/whatsapp/offers/:id
router.get("/offers/:id", getOfferWhatsAppInfo);

// POST /api/admin/whatsapp/offers/:id/send
router.post("/offers/:id/send", sendOfferOnWhatsApp);

// GET  /api/admin/whatsapp/carts/:customerId
router.get("/carts/:customerId", getCartWhatsAppInfo);

// POST /api/admin/whatsapp/carts/:customerId/send
router.post("/carts/:customerId/send", sendCartReminderOnWhatsApp);

export default router;
