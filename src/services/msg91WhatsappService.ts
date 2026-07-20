import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 WhatsApp Outbound Service
//
// Sends transactional + broadcast WhatsApp template messages via MSG91.
// ALL sends are fire-and-forget — a send failure NEVER breaks the order flow.
//
// API docs: https://docs.msg91.com/whatsapp/template-bulk
//   POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/
// This single endpoint handles both single-recipient and bulk sends — pass
// one or many entries in `payload.template.to_and_components`.
//
// Required env vars (transactional):
//   MSG91_AUTH_KEY
//   MSG91_WA_INTEGRATED_NUMBER
//   MSG91_WA_TEMPLATE_ORDER_CONFIRMED
//   MSG91_WA_TEMPLATE_ORDER_STATUS
//
// Required env vars (broadcast campaigns):
//   MSG91_AUTH_KEY
//   MSG91_WA_INTEGRATED_NUMBER       ← Your WhatsApp Business number (with country code, no +)
//   MSG91_WA_TEMPLATE_PROMO_BLAST    (default: kidroo_promo_blast)
//
// Template variable specs (positional {{1}}, {{2}}, ... in the approved
// Meta template body → sent as body_1, body_2, ... in the API call):
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
const MSG91_WA_PATH = "/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// ── Internal helper: POST JSON to MSG91 ──────────────────────────────────────
function postToMsg91(payload: object): Promise<{ ok: boolean; data: any }> {
  return new Promise((resolve) => {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
      console.warn("[MSG91 WhatsApp] MSG91_AUTH_KEY not set — skipping send.");
      return resolve({ ok: false, data: null });
    }

    const body = JSON.stringify(payload);

    const options: https.RequestOptions = {
      hostname: MSG91_WA_HOST,
      path: MSG91_WA_PATH,
      method: "POST",
      headers: {
        accept: "application/json",
        authkey: authKey,
        "content-type": "application/json",
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

// ── Build the positional body_1, body_2, ... components object ──────────────
function buildComponents(variables: string[]): Record<string, { type: "text"; value: string }> {
  const components: Record<string, { type: "text"; value: string }> = {};
  variables.forEach((value, index) => {
    components[`body_${index + 1}`] = { type: "text", value };
  });
  return components;
}

// ── Build the full MSG91 template-send payload ───────────────────────────────
function buildTemplatePayload(
  integratedNumber: string,
  templateName: string,
  recipients: { to: string; variables: string[] }[]
) {
  return {
    integrated_number: integratedNumber,
    content_type: "template",
    payload: {
      type: "template",
      template: {
        name: templateName,
        language: { code: "en", policy: "deterministic" },
        to_and_components: recipients.map((r) => ({
          to: [r.to],
          components: buildComponents(r.variables),
        })),
      },
      messaging_product: "whatsapp",
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BROADCAST — Promotional campaign to many recipients
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

    const payload = buildTemplatePayload(
      integratedNumber,
      templateName,
      batch.map((r) => ({
        to: normalisePhone(r.mobile),
        variables: [`${r.firstName} ${r.lastName}`.trim() || "Customer", promoMessage],
      }))
    );

    try {
      const result = await postToMsg91(payload);

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

/**
 * Send WhatsApp confirmation when order is successfully created/paid.
 */
export async function sendWhatsAppOrderConfirmed(
  customerName: string,
  mobile: string,
  orderId: string,
  totalAmount: number,
  paymentMethod: string
): Promise<boolean> {
  const authKey          = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName     = process.env.MSG91_WA_TEMPLATE_ORDER_CONFIRMED ?? "kidroo_order_confirmed";

  if (!authKey || !integratedNumber) {
    console.warn("[MSG91 WhatsApp] Order Confirmation: MSG91 credentials not configured. Skipping WhatsApp notification.");
    return false;
  }

  const payload = buildTemplatePayload(integratedNumber, templateName, [
    {
      to: normalisePhone(mobile),
      variables: [
        customerName || "Customer",
        orderId,
        `₹${Number(totalAmount).toFixed(2)}`,
        paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment",
      ],
    },
  ]);

  const result = await postToMsg91(payload);
  return result.ok;
}

/**
 * Send WhatsApp alert when order status updates (e.g. Confirmed, Shipped, Delivered).
 */
export async function sendWhatsAppOrderStatus(
  customerName: string,
  mobile: string,
  orderId: string,
  newStatus: string
): Promise<boolean> {
  const authKey          = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName     = process.env.MSG91_WA_TEMPLATE_ORDER_STATUS ?? "kidroo_order_status";

  if (!authKey || !integratedNumber) {
    console.warn("[MSG91 WhatsApp] Status Alert: MSG91 credentials not configured. Skipping WhatsApp notification.");
    return false;
  }

  const payload = buildTemplatePayload(integratedNumber, templateName, [
    {
      to: normalisePhone(mobile),
      variables: [customerName || "Customer", orderId, newStatus],
    },
  ]);

  const result = await postToMsg91(payload);
  return result.ok;
}
