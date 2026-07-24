import { Router, Request, Response } from "express";
import { sendWhatsAppTest } from "../services/msg91WhatsappService";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccessResponse } from "../utils/apiResponse";
import AppError from "../utils/appError";

const router = Router();

/**
 * POST /api/whatsapp/test
 * Body: { "mobile": "7016888623" }
 *
 * Sends both kidroo_order_confirmed and kidroo_order_status
 * template messages to the given mobile number for testing.
 *
 * ⚠️  REMOVE or PROTECT this route before going live in production.
 */
router.post(
  "/test",
  asyncHandler(async (req: Request, res: Response) => {
    const { mobile } = req.body;

    if (!mobile) {
      throw new AppError("mobile is required in request body", 400);
    }

    const result = await sendWhatsAppTest(mobile);

    return sendSuccessResponse(
      res,
      200,
      "WhatsApp test messages fired",
      {
        mobile,
        templates: {
          kidroo_order_confirmed: result.orderConfirmed ? "✅ Sent" : "❌ Failed",
          kidroo_order_status:    result.orderStatus    ? "✅ Sent" : "❌ Failed",
        },
        note: "Check the number on WhatsApp. If templates are not yet approved by Meta, delivery will fail.",
      }
    );
  })
);

export default router;
