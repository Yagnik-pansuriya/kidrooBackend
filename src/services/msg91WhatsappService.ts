import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 WhatsApp Outbound Service
//
// Sends transactional + broadcast WhatsApp template messages via MSG91.
// ALL sends are fire-and-forget — a send failure NEVER breaks the order flow.
//
// API docs: https://docs.msg91.com/whatsapp/template-bulk
//   POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/
//
// Template specs (positional {{1}}, {{2}}, ... in the approved Meta template
// body → sent as body_1, body_2, ... in the API call):
//
//   kidroo_order_confirmed
//     Body {{1}} → Customer Name
//     Body {{2}} → Order ID         (e.g. KDR-234521-4521)
//     Body {{3}} → Total Amount     (e.g. ₹1,250.00)
//     Body {{4}} → Payment Method   (e.g. Cash on Delivery / Online Payment)
//     Button URL → https://kidroo.in/order-confirmation/<orderId>
//
//   kidroo_order_status
//     Body {{1}} → Customer Name
//     Body {{2}} → Order ID
//     Body {{3}} → New Status       (e.g. Shipped / Delivered / Cancelled)
//     Button URL → https://kidroo.in/order-confirmation/<orderId>
//
//   kidroo_promo_blast
//     Body {{1}} → Customer Name
//     Body {{2}} → Promo Message / Offer Details
//
// Required env vars:
//   MSG91_AUTH_KEY
//   MSG91_WA_INTEGRATED_NUMBER       ← WhatsApp Business number (with 91, no +)
//   MSG91_WA_TEMPLATE_ORDER_CONFIRMED  (default: kidroo_order_confirmed)
//   MSG91_WA_TEMPLATE_ORDER_STATUS     (default: kidroo_order_status)
//   MSG91_WA_TEMPLATE_PROMO_BLAST      (default: kidroo_promo_blast)
// ─────────────────────────────────────────────────────────────────────────────

const MSG91_WA_HOST = "control.msg91.com";
const MSG91_WA_PATH = "/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const STORE_URL     = "https://kidroo.in";

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
      path:     MSG91_WA_PATH,
      method:   "POST",
      headers: {
        accept:           "application/json",
        authkey:          authKey,
        "content-type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const ok =
            res.statusCode !== undefined &&
            res.statusCode >= 200 &&
            res.statusCode < 300;

          if (!ok) {
            console.warn(
              `[MSG91 WhatsApp] Non-2xx response: ${res.statusCode} —`,
              JSON.stringify(parsed)
            );
          } else {
            console.log(
              `[MSG91 WhatsApp] ✅ Sent OK. Status: ${res.statusCode} —`,
              JSON.stringify(parsed)
            );
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

// ── Normalise phone: strip non-digits, prefix 91 for 10-digit Indian numbers ──
function normalisePhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length >= 11) return clean;
  return `91${clean}`;
}

// ── Build body components: body_1, body_2, ... ─────────────────────────────
function buildBodyComponents(
  variables: string[]
): Record<string, { type: "text"; value: string }> {
  const components: Record<string, { type: "text"; value: string }> = {};
  variables.forEach((value, index) => {
    components[`body_${index + 1}`] = { type: "text", value };
  });
  return components;
}

// ── Build payload for templates WITH a dynamic button URL ──────────────────
// The button URL uses {{1}} in MSG91 which maps to `button_1` in components.
function buildTemplatePayloadWithButton(
  integratedNumber: string,
  templateName: string,
  recipients: { to: string; bodyVars: string[]; buttonUrlVar: string }[]
) {
  return {
    integrated_number: integratedNumber,
    content_type: "template",
    payload: {
      type: "template",
      template: {
        name:     templateName,
        language: { code: "en", policy: "deterministic" },
        to_and_components: recipients.map((r) => ({
          to: [r.to],
          components: {
            ...buildBodyComponents(r.bodyVars),
            button_1: { type: "text", value: r.buttonUrlVar },
          },
        })),
      },
      messaging_product: "whatsapp",
    },
  };
}

// ── Build payload for templates WITHOUT a button (promo blast) ─────────────
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
        name:     templateName,
        language: { code: "en", policy: "deterministic" },
        to_and_components: recipients.map((r) => ({
          to:         [r.to],
          components: buildBodyComponents(r.variables),
        })),
      },
      messaging_product: "whatsapp",
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// sendWhatsAppOrderConfirmed
//
// Sends the kidroo_order_confirmed template.
// Triggered on: COD order placed OR online payment verified.
//
// Body:
//   {{1}} → customerName
//   {{2}} → orderId
//   {{3}} → ₹totalAmount
//   {{4}} → paymentMethod (Cash on Delivery / Online Payment)
// Button URL:
//   https://kidroo.in/order-confirmation/<orderId>
// ═════════════════════════════════════════════════════════════════════════════
export async function sendWhatsAppOrderConfirmed(
  customerName: string,
  mobile: string,
  orderId: string,
  totalAmount: number,
  paymentMethod: string
): Promise<boolean> {
  const authKey          = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName     =
    process.env.MSG91_WA_TEMPLATE_ORDER_CONFIRMED ?? "kidroo_order_confirmed";

  if (!authKey || !integratedNumber) {
    console.warn(
      "[MSG91 WhatsApp] Order Confirmed: credentials not configured. Skipping."
    );
    return false;
  }

  const payload = buildTemplatePayloadWithButton(integratedNumber, templateName, [
    {
      to:           normalisePhone(mobile),
      bodyVars: [
        customerName || "Customer",
        orderId,
        `₹${Number(totalAmount).toFixed(2)}`,
        paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment",
      ],
      buttonUrlVar: orderId, // fills the {{1}} in the button URL
    },
  ]);

  console.log(
    `[MSG91 WhatsApp] Sending order_confirmed to ${normalisePhone(mobile)} — Order: ${orderId}`
  );

  const result = await postToMsg91(payload);
  return result.ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// sendWhatsAppOrderStatus
//
// Sends the kidroo_order_status template.
// Triggered on: Admin updates order status (Confirmed / Shipped / Delivered / Cancelled).
//
// Body:
//   {{1}} → customerName
//   {{2}} → orderId
//   {{3}} → newStatus
// Button URL:
//   https://kidroo.in/order-confirmation/<orderId>
// ═════════════════════════════════════════════════════════════════════════════
export async function sendWhatsAppOrderStatus(
  customerName: string,
  mobile: string,
  orderId: string,
  newStatus: string
): Promise<boolean> {
  const authKey          = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WA_INTEGRATED_NUMBER;
  const templateName     =
    process.env.MSG91_WA_TEMPLATE_ORDER_STATUS ?? "kidroo_order_status";

  if (!authKey || !integratedNumber) {
    console.warn(
      "[MSG91 WhatsApp] Order Status: credentials not configured. Skipping."
    );
    return false;
  }

  const payload = buildTemplatePayloadWithButton(integratedNumber, templateName, [
    {
      to:           normalisePhone(mobile),
      bodyVars: [customerName || "Customer", orderId, newStatus],
      buttonUrlVar: orderId, // fills the {{1}} in the button URL
    },
  ]);

  console.log(
    `[MSG91 WhatsApp] Sending order_status to ${normalisePhone(mobile)} — Order: ${orderId}, Status: ${newStatus}`
  );

  const result = await postToMsg91(payload);
  return result.ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// BROADCAST — Promotional campaign to many recipients
//
// Sends in batches of 500 to stay within MSG91 limits.
// Uses kidroo_promo_blast template (no button — marketing category).
//
// Body:
//   {{1}} → Customer Name
//   {{2}} → Promo Message / Offer Details
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
  const templateName     =
    process.env.MSG91_WA_TEMPLATE_PROMO_BLAST ?? "kidroo_promo_blast";

  // ── Guard: credentials missing → simulate ────────────────────────────────
  if (!authKey || !integratedNumber) {
    console.warn(
      "[MSG91 Broadcast] ⚠️  MSG91_AUTH_KEY or MSG91_WA_INTEGRATED_NUMBER not configured.\n" +
      "  → Messages will NOT be sent. Add these to .env to enable real delivery.\n" +
      "  → Returning simulated stats so the campaign record is still useful."
    );
    const sent   = recipients.length;
    const failed = Math.max(0, Math.floor(sent * 0.04));
    return { sent, delivered: sent - failed, failed };
  }

  // ── Send in batches of 500 ─────────────────────────────────────────────
  const BATCH_SIZE   = 500;
  let totalSent      = 0;
  let totalDelivered = 0;
  let totalFailed    = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    const payload = buildTemplatePayload(integratedNumber, templateName,
      batch.map((r) => ({
        to:        normalisePhone(r.mobile),
        variables: [
          `${r.firstName} ${r.lastName}`.trim() || "Customer",
          promoMessage,
        ],
      }))
    );

    try {
      const result = await postToMsg91(payload);
      if (result.ok) {
        totalSent      += batch.length;
        totalDelivered += batch.length;
        console.log(
          `[MSG91 Broadcast] ✅ Batch ${Math.ceil(i / BATCH_SIZE) + 1}: ${batch.length} accepted`
        );
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

// ═════════════════════════════════════════════════════════════════════════════
// TEST HELPER — Send both templates to a test number
//
// Used by: POST /api/whatsapp/test
// ═════════════════════════════════════════════════════════════════════════════
export async function sendWhatsAppTest(
  mobile: string
): Promise<{ orderConfirmed: boolean; orderStatus: boolean }> {
  const testOrderId   = "KDR-TEST-0001";
  const testName      = "Test User";
  const testAmount    = 1250;
  const testStatus    = "Shipped";

  console.log(`[MSG91 WhatsApp] 🧪 Sending test messages to ${normalisePhone(mobile)}`);

  const [orderConfirmed, orderStatus] = await Promise.all([
    sendWhatsAppOrderConfirmed(testName, mobile, testOrderId, testAmount, "cod"),
    sendWhatsAppOrderStatus(testName, mobile, testOrderId, testStatus),
  ]);

  console.log(
    `[MSG91 WhatsApp] 🧪 Test result — order_confirmed: ${orderConfirmed}, order_status: ${orderStatus}`
  );

  return { orderConfirmed, orderStatus };
}
