import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 WhatsApp Outbound Service
//
// Sends transactional WhatsApp template messages via MSG91.
// ALL sends are fire-and-forget — a send failure NEVER breaks the order flow.
//
// Required env vars:
//   MSG91_AUTH_KEY                      — Your MSG91 authentication key
//   MSG91_WA_TEMPLATE_ORDER_CONFIRMED   — Approved template name for order confirmation
//   MSG91_WA_TEMPLATE_ORDER_STATUS      — Approved template name for order status updates
//
// Template variable specs (must match what you set up in MSG91 dashboard):
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
// ─────────────────────────────────────────────────────────────────────────────

const MSG91_WA_URL = "control.msg91.com";
const MSG91_WA_PATH = "/api/v5/whatsapp/outbound/";

// ── Internal helper: POST JSON to MSG91 ──────────────────────────────────────
function postToMsg91(payload: object): Promise<void> {
  return new Promise((resolve) => {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
      console.warn("[MSG91 WhatsApp] MSG91_AUTH_KEY not set — skipping send.");
      return resolve();
    }

    const body = JSON.stringify(payload);

    const options: https.RequestOptions = {
      hostname: MSG91_WA_URL,
      path: MSG91_WA_PATH,
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
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[MSG91 WhatsApp] Message sent. Status: ${res.statusCode}`);
        } else {
          console.warn(
            `[MSG91 WhatsApp] Non-2xx response: ${res.statusCode} — ${data}`
          );
        }
        resolve();
      });
    });

    req.on("error", (err) => {
      console.error("[MSG91 WhatsApp] Request error:", err.message);
      resolve(); // Always resolve — never throw
    });

    req.write(body);
    req.end();
  });
}

// ── Normalise phone: strip leading + or 0, ensure country code prefix ─────────
function normalisePhone(phone: string): string {
  // Strip any non-digit characters except leading +
  const clean = phone.replace(/\D/g, "");
  // If already has country code (10+ digits starting with country code)
  if (clean.length >= 11) return clean;
  // Assume India (+91) if 10 digits
  return `91${clean}`;
}

// ── Build a WhatsApp template component array ─────────────────────────────────
function buildBodyComponent(variables: string[]) {
  return [
    {
      type: "body",
      parameters: variables.map((text) => ({ type: "text", text })),
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send an order confirmation WhatsApp message.
 *
 * Template variables:
 *   {{1}} customerName
 *   {{2}} orderId         (human-readable ID, e.g. KDR-20260421-00001)
 *   {{3}} totalAmount     (formatted string, e.g. "₹1,250.00")
 *   {{4}} paymentMethod   (e.g. "Cash on Delivery" or "Online Payment")
 *
 * @param phone         Recipient phone (any format — normalised internally)
 * @param customerName  Full name of the customer
 * @param orderId       Human-readable order ID
 * @param totalAmount   Numeric total — formatted as ₹X,XXX.XX
 * @param paymentMethod "cod" | "online"
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

    await postToMsg91(payload);
  } catch (err: any) {
    // Safety net — log but never propagate
    console.error("[MSG91 WhatsApp] sendOrderConfirmationWhatsApp error:", err?.message);
  }
}

/**
 * Send an order status update WhatsApp message.
 *
 * Template variables:
 *   {{1}} customerName
 *   {{2}} orderId
 *   {{3}} newStatus  (human-readable, e.g. "Shipped")
 *
 * @param phone        Recipient phone
 * @param customerName Full name of the customer
 * @param orderId      Human-readable order ID
 * @param newStatus    Raw order status string (auto-capitalised)
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

    // Capitalise first letter for readability (e.g. "shipped" → "Shipped")
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

    await postToMsg91(payload);
  } catch (err: any) {
    console.error("[MSG91 WhatsApp] sendOrderStatusWhatsApp error:", err?.message);
  }
}
