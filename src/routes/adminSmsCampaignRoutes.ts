import { Router } from "express";
import {
  getCampaignStats,
  getAllCampaigns,
  createAndSendCampaign,
  deleteCampaign,
} from "../controller/adminSmsCampaignController";
import { authMiddleware, authorizationMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// All routes: admin only
router.use(authMiddleware, authorizationMiddleware(["admin"]));

// GET /api/admin/sms-campaigns/stats  ← must be before /:id
router.get("/stats", getCampaignStats);

// GET /api/admin/sms-campaigns
router.get("/", getAllCampaigns);

// POST /api/admin/sms-campaigns
router.post("/", createAndSendCampaign);

// DELETE /api/admin/sms-campaigns/:id
router.delete("/:id", deleteCampaign);

export default router;
