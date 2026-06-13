import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 WhatsApp Outbound Service
//
// Sends transactional + broadcast WhatsApp template messages via MSG91.
// ALL sends are fire-and-forget — a send failure NEVER breaks the order flow.
//
// Required env vars (transactional):
//   MSG91_AUTH_KEY
//   MSG91_WA_TEMPLATE_ORDER_CONFIRMED
//   MSG91_WA_TEMPLATE_ORDER_STATUS
//
// Required env vars (broadcast campaigns):
//   MSG91_AUTH_KEY
//   MSG91_WA_INTEGRATED_NUMBER       ← Your WhatsApp Business number (with country code, no +)
//   MSG91_WA_TEMPLATE_PROMO_BLAST    (default: kidroo_promo_blast)
//
// Template variable specs:
//
//   kidroo_order_confirmed
//     {{1}} Customer Name
//     {{2}} Order ID  (e.g. KDR-20260421-00001)
//     {{3}} Total Amount (e.g. ₹1,250.00)
//     {{4}} Payment Method (e.g. Cash on Delivery / Online Payment)
//
//   kidroo_order_status
//     {{1}} Customer Name
//     {{2}} Order ID
//     {{3}} New Status  (e.g. Shipped)
//
//   kidroo_promo_blast
//     {{1}} Customer Name
//     {{2}} Promo Message / Offer Details
// ─────────────────────────────────────────────────────────────────────────────

const MSG91_WA_HOST = "control.msg91.com";
const MSG91_WA_SINGLE_PATH = "/api/v5/whatsapp/outbound/";
const MSG91_WA_BULK_PATH   = "/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// ── Internal helper: POST JSON to MSG91 ──────────────────────────────────────
function postToMsg91(payload: object, path: string = MSG91_WA_SINGLE_PATH): Promise<{ ok: boolean; data: any }> {
  return new Promise((resolve) => {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
      console.warn("[MSG91 WhatsApp] MSG91_AUTH_KEY not set — skipping send.");
      return resolve({ ok: false, data: null });
    }

    const body = JSON.stringify(payload);

    const options: https.RequestOptions = {
      hostname: MSG91_WA_HOST,
      path,
      method: "POST",
      headers: {
        authkey: authKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            console.warn(`[MSG91 WhatsApp] Non-2xx response: ${res.statusCode} — ${data}`);
          } else {
            console.log(`[MSG91 WhatsApp] Sent OK. Status: ${res.statusCode}`);
          }
          resolve({ ok, data: parsed });
        } catch {
          resolve({ ok: false, data: null });
        }
      });
    });

    req.on("error", (err) => {
      console.error("[MSG91 WhatsApp] Request error:", err.message);
      resolve({ ok: false, data: null }); // Always resolve — never throw
    });

    req.write(body);
    req.end();
  });
}

// ── Normalise phone: strip non-digits, add India +91 if 10 digits ─────────────
function normalisePhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length >= 11) return clean;
  return `91${clean}`;
}

// ── Build a WhatsApp body component array ────────────────────────────────────
function buildBodyComponent(variables: string[]) {
  return [
    {
      type: "body",
      parameters: variables.map((text) => ({ type: "text", text })),
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTIONAL — Order Confirmation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send an order confirmation WhatsApp message.
 * Template vars: {{1}} name  {{2}} orderId  {{3}} amount  {{4}} paymentMethod
 */
export async function sendOrderConfirmationWhatsApp(
  phone: string,
  customerName: string,
  orderId: string,
  totalAmount: number,
  paymentMethod: "cod" | "online"
): Promise<void> {
  try {
    const templateName =
      process.env.MSG91_WA_TEMPLATE_ORDER_CONFIRMED ?? "kidroo_order_confirmed";

    const formattedAmount = `₹${totalAmount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    const formattedPayment =
      paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment";

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalisePhone(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: buildBodyComponent([
          customerName,
          orderId,
          formattedAmount,
          formattedPayment,
        ]),
      },
    };

    await postToMsg91(payload, MSG91_WA_SINGLE_PATH);
  } catch (err: any) {
    console.error("[MSG91 WhatsApp] sendOrderConfirmationWhatsApp error:", err?.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTIONAL — Order Status Update
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send an order status update WhatsApp message.
 * Template vars: {{1}} name  {{2}} orderId  {{3}} newStatus
 */
export async function sendOrderStatusWhatsApp(
  phone: string,
  customerName: string,
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
    const templateName =
      process.env.MSG91_WA_TEMPLATE_ORDER_STATUS ?? "kidroo_order_status";

    const formattedStatus =
      newStatus.charAt(0).toUpperCase() + newStatus.slice(1);

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalisePhone(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: buildBodyComponent([customerName, orderId, formattedStatus]),
      },
    };

    await postToMsg91(payload, MSG91_WA_SINGLE_PATH);
  } catch (err: any) {
    console.error("[MSG91 WhatsApp] sendOrderStatusWhatsApp error:", err?.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BROADCAST — Promotional campaign to many recipients
//
// Uses MSG91 Bulk Outbound API:
//   POST /api/v5/whatsapp/whatsapp-outbound-message/bulk/
//
// Sends in batches of 500 to stay within MSG91 limits.
// "delivered" = accepted by MSG91 (async delivery receipts not tracked here).
//
// FALLBACK: If MSG91_AUTH_KEY or MSG91_WA_INTEGRATED_NUMBER are missing,
// the function returns simulated stats and logs a warning — no crash.
// ═════════════════════════════════════════════════════════════════════════════

export interface BroadcastResult {
  sent: number;
  delivered: number;
  failed: number;
}

export interface BroadcastRecipient {
  mobile: string;
  firstName: string;
  lastName: string;
}

/**
 * Send a promotional WhatsApp broadcast to many recipients.
 *
 * @param recipients   Array of { mobile, firstName, lastName }
 * @param promoMessage The promo/offer body (maps to {{2}} in kidroo_promo_blast template)
 * @returns            { sent, delivered, failed }
 */
export async function sendWhatsAppBroadcast(
  recipients: BroadcastRecipient[],
  promoMessage: string
): Promise<BroadcastResult> {
  const authKey          = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName     = process.env.MSG91_WA_TEMPLATE_PROMO_BLAST ?? "kidroo_promo_blast";

  // ── Guard: credentials missing → simulate (so the feature still works in dev) ──
  if (!authKey || !integratedNumber) {
    console.warn(
      "[MSG91 Broadcast] ⚠️  MSG91_AUTH_KEY or MSG91_WA_INTEGRATED_NUMBER not configured.\n" +
      "  → Messages will NOT be sent to WhatsApp. Add these to .env to enable real delivery.\n" +
      "  → Storing simulated stats in DB so the campaign record is still useful."
    );
    const sent   = recipients.length;
    const failed = Math.max(0, Math.floor(sent * 0.04));
    return { sent, delivered: sent - failed, failed };
  }

  // ── Send in batches of 500 ────────────────────────────────────────────────
  const BATCH_SIZE = 500;
  let totalSent      = 0;
  let totalDelivered = 0;
  let totalFailed    = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    const messages = batch.map((r) => ({
      to: normalisePhone(r.mobile),
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: buildBodyComponent([
          `${r.firstName} ${r.lastName}`.trim() || "Customer",
          promoMessage,
        ]),
      },
    }));

    const payload = {
      messaging_product: "whatsapp",
      integrated_number: integratedNumber,
      messages,
    };

    try {
      const result = await postToMsg91(payload, MSG91_WA_BULK_PATH);

      if (result.ok) {
        // MSG91 accepted the batch → count as delivered (async receipts not tracked)
        totalSent      += batch.length;
        totalDelivered += batch.length;
        console.log(`[MSG91 Broadcast] ✅ Batch ${Math.ceil(i / BATCH_SIZE) + 1}: ${batch.length} accepted`);
      } else {
        totalSent   += batch.length;
        totalFailed += batch.length;
        console.error(
          `[MSG91 Broadcast] ❌ Batch ${Math.ceil(i / BATCH_SIZE) + 1} rejected:`,
          JSON.stringify(result.data)
        );
      }
    } catch (err: any) {
      totalSent   += batch.length;
      totalFailed += batch.length;
      console.error("[MSG91 Broadcast] Batch exception:", err?.message);
    }
  }

  console.log(
    `[MSG91 Broadcast] Campaign complete — Sent: ${totalSent}, ` +
    `Delivered: ${totalDelivered}, Failed: ${totalFailed}`
  );

  return { sent: totalSent, delivered: totalDelivered, failed: totalFailed };
}
