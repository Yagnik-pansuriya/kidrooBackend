import { Request, Response } from "express";
import mongoose from "mongoose";
import Offer from "../models/offers";
import Customer from "../models/customer";
import SmsCampaign, { ISmsCampaign } from "../models/smsCampaign";
import { sendSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import AppError from "../utils/appError";
import { resolveTargetCustomers, GROUP_LABELS } from "./adminSmsCampaignController";
import {
  isWhatsAppConfigured,
  sendWhatsAppOfferAlert,
  sendWhatsAppCartReminder,
  toTemplateText,
  OfferAlertContent,
} from "../services/msg91WhatsappService";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp offer alerts + 1:1 cart reminders (MSG91 templates
// kidroo_offer_alert / kidroo_cart_reminder — see msg91WhatsappService.ts)
// ─────────────────────────────────────────────────────────────────────────────

type OfferGroup = Exclude<ISmsCampaign["targetGroup"], "custom">;
const OFFER_GROUPS: OfferGroup[] = ["all", "repeat", "high_value", "new", "at_risk"];

const parseGroup = (raw: unknown): OfferGroup =>
  OFFER_GROUPS.find((g) => g === String(raw)) ?? "all";
const CART_RESEND_GAP_MS = 10 * 60 * 1000; // stops double-clicks / accidental spam
const STORE_HOSTS = ["kidroo.in", "www.kidroo.in"];

const requireWhatsApp = () => {
  if (!isWhatsAppConfigured()) {
    throw new AppError(
      "WhatsApp is not configured (MSG91_AUTH_KEY / MSG91_WA_INTEGRATED_NUMBER missing)",
      503
    );
  }
};

const parseId = (raw: unknown, label: string) => {
  const id = String(raw);
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label} ID`, 400);
  return new mongoose.Types.ObjectId(id);
};

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** Button path after https://kidroo.in/ — external or empty links fall back to /offers */
const offerButtonPath = (targetUrl?: string) => {
  let path = "offers";
  const raw = (targetUrl || "").trim();
  if (raw.startsWith("/")) {
    path = raw.slice(1) || "offers";
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (STORE_HOSTS.includes(url.hostname)) path = `${url.pathname.slice(1)}${url.search}` || "offers";
    } catch { /* keep default */ }
  }
  return `${path}${path.includes("?") ? "&" : "?"}utm_source=whatsapp&utm_medium=offer`;
};

/** What goes into the template for this offer (also returned to the admin as a preview) */
const buildOfferContent = (offer: any): OfferAlertContent => {
  const title = [offer.title, offer.badgeText].filter(Boolean).join(" — ");
  const details = [offer.subtitle, offer.description, `Valid till ${fmtDate(offer.validity.to)}.`]
    .filter(Boolean)
    .map((t: string) => t.replace(/<[^>]*>/g, "").trim())
    .join(" ");
  const firstImage = offer.images?.[0];
  return {
    title: toTemplateText(title, 200),
    details: toTemplateText(details, 600),
    imageUrl: (typeof firstImage === "string" ? firstImage : firstImage?.url) || "",
    buttonPath: offerButtonPath(offer.targetUrl),
  };
};

const loadSendableOffer = async (rawId: unknown) => {
  const offer: any = await Offer.findById(parseId(rawId, "offer")).lean();
  if (!offer) throw new AppError("Offer not found", 404);
  return offer;
};

const offerProblems = (offer: any, content: OfferAlertContent) => {
  const problems: string[] = [];
  if (!offer.isActive) problems.push("Offer is paused — activate it first");
  if (offer.validity?.to && new Date(offer.validity.to) < new Date()) problems.push("Offer has expired");
  if (!content.imageUrl) problems.push("Offer needs at least one image (used as the WhatsApp header)");
  return problems;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/whatsapp/offers/:id?targetGroup=all
// Preview + audience size + last send, for the "Send on WhatsApp" dialog
// ─────────────────────────────────────────────────────────────────────────────
export const getOfferWhatsAppInfo = asyncHandler(async (req: Request, res: Response) => {
  const offer = await loadSendableOffer(req.params.id);
  const targetGroup = parseGroup(req.query.targetGroup);

  const content = buildOfferContent(offer);
  const [recipients, lastCampaign] = await Promise.all([
    resolveTargetCustomers(targetGroup, []),
    SmsCampaign.findOne({ kind: "offer", offer: offer._id }).sort({ createdAt: -1 }).lean(),
  ]);

  return sendSuccessResponse(res, 200, "WhatsApp offer info", {
    configured: isWhatsAppConfigured(),
    content,
    problems: offerProblems(offer, content),
    targetGroup,
    audienceCount: recipients.length,
    lastCampaign,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/whatsapp/offers/:id/send
// Body: { targetGroup?, testMobile?, resend? }
//   testMobile → send only to that number, synchronously, no campaign record
//   otherwise  → 202 and send to the whole audience in the background
// ─────────────────────────────────────────────────────────────────────────────
export const sendOfferOnWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  requireWhatsApp();
  const offer = await loadSendableOffer(req.params.id);
  const content = buildOfferContent(offer);

  const problems = offerProblems(offer, content);
  if (problems.length) throw new AppError(problems.join(". "), 400);

  const { targetGroup: rawGroup = "all", testMobile, resend = false } = req.body || {};

  // ── Test send to one number ────────────────────────────────────────────────
  if (testMobile) {
    const mobile = String(testMobile).replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new AppError("Enter a valid 10-digit mobile number", 400);
    const result = await sendWhatsAppOfferAlert(
      [{ mobile, firstName: (req as any).user?.name || "Admin", lastName: "" }],
      content
    );
    if (!result.delivered) throw new AppError("MSG91 rejected the test message — check the backend logs", 502);
    return sendSuccessResponse(res, 200, `Test message sent to +91 ${mobile}`, result);
  }

  // ── Real send ──────────────────────────────────────────────────────────────
  const targetGroup = parseGroup(rawGroup);

  const inFlight = await SmsCampaign.exists({ kind: "offer", offer: offer._id, status: "sending" });
  if (inFlight) throw new AppError("This offer is already being sent", 409);

  const previous = await SmsCampaign.findOne({ kind: "offer", offer: offer._id, status: "sent" })
    .sort({ createdAt: -1 })
    .lean();
  if (previous && !resend) {
    throw new AppError(`This offer was already sent on ${fmtDate(previous.sentAt || previous.createdAt)}`, 409);
  }

  const recipients = await resolveTargetCustomers(targetGroup, []);
  if (!recipients.length) throw new AppError("No active customers with a mobile number in this group", 400);

  const campaign = await SmsCampaign.create({
    name:        `Offer: ${offer.title}`,
    message:     `${content.title} — ${content.details}`.slice(0, 1024),
    channel:     "whatsapp",
    kind:        "offer",
    offer:       offer._id,
    targetGroup,
    targetLabel: GROUP_LABELS[targetGroup] ?? "All Customers",
    status:      "sending",
    sentCount:   recipients.length,
  });

  // Large audiences take longer than the proxy timeout, so finish in the background
  sendWhatsAppOfferAlert(recipients, content)
    .then(({ sent, delivered, failed }) =>
      SmsCampaign.updateOne(
        { _id: campaign._id },
        {
          status: delivered ? "sent" : "failed",
          sentCount: sent,
          deliveredCount: delivered,
          failedCount: failed,
          sentAt: new Date(),
        }
      )
    )
    .catch((err) => {
      console.error("[WhatsApp Offer] Send crashed:", err?.message || err);
      return SmsCampaign.updateOne(
        { _id: campaign._id },
        { status: "failed", failedCount: recipients.length, sentAt: new Date() }
      );
    });

  return sendSuccessResponse(
    res,
    202,
    `Sending "${offer.title}" to ${recipients.length} customers on WhatsApp…`,
    campaign
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/whatsapp/carts/:customerId — last cart message to this customer
// ─────────────────────────────────────────────────────────────────────────────
export const getCartWhatsAppInfo = asyncHandler(async (req: Request, res: Response) => {
  const customerId = parseId(req.params.customerId, "customer");
  const lastMessage = await SmsCampaign.findOne({ kind: "cart", targetIds: customerId })
    .sort({ createdAt: -1 })
    .select("message status sentAt createdAt")
    .lean();

  return sendSuccessResponse(res, 200, "WhatsApp cart info", {
    configured: isWhatsAppConfigured(),
    lastMessage,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/whatsapp/carts/:customerId/send
// Body: { message }
// ─────────────────────────────────────────────────────────────────────────────
export const sendCartReminderOnWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  requireWhatsApp();
  const customerId = parseId(req.params.customerId, "customer");

  const message = toTemplateText(String(req.body?.message || ""), 700);
  if (!message) throw new AppError("Message is required", 400);

  const customer: any = await Customer.findById(customerId).select("firstName lastName mobile isActive").lean();
  if (!customer) throw new AppError("Customer not found", 404);
  if (!customer.mobile) throw new AppError("Customer has no mobile number", 400);

  const recent = await SmsCampaign.findOne({
    kind: "cart",
    targetIds: customerId,
    status: "sent",
    createdAt: { $gt: new Date(Date.now() - CART_RESEND_GAP_MS) },
  }).lean();
  if (recent) throw new AppError("A cart message was sent to this customer a few minutes ago", 429);

  const { ok, data } = await sendWhatsAppCartReminder(customer, message);

  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const campaign = await SmsCampaign.create({
    name:           `Cart reminder: ${name}`,
    message,
    channel:        "whatsapp",
    kind:           "cart",
    targetGroup:    "custom",
    targetLabel:    name,
    targetIds:      [customerId],
    status:         ok ? "sent" : "failed",
    sentCount:      1,
    deliveredCount: ok ? 1 : 0,
    failedCount:    ok ? 0 : 1,
    sentAt:         new Date(),
  });

  if (!ok) {
    const reason = data?.message || data?.errors || "MSG91 rejected the message";
    throw new AppError(`WhatsApp send failed: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`, 502);
  }

  return sendSuccessResponse(res, 200, `WhatsApp sent to ${name}`, campaign);
});
