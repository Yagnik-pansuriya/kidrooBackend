import https from "https";
import AppError from "./appError";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 Email Utility — transactional emails via MSG91's Email API
//
// API docs: https://docs.msg91.com/email/send-email
//   POST https://control.msg91.com/api/v5/email/send
//
// Required env vars:
//   MSG91_AUTH_KEY                            (shared with SMS/OTP/WhatsApp)
//   MSG91_EMAIL_DOMAIN                        — verified domain (dashboard → Email → Domains)
//   MSG91_EMAIL_FROM_NAME / MSG91_EMAIL_FROM_ADDRESS
//   MSG91_EMAIL_OTP_TEMPLATE_ID                — dashboard → Email → Templates
//   MSG91_EMAIL_ORDER_CONFIRMED_TEMPLATE_ID
//
// IMPORTANT: the `variables` keys below (e.g. "name", "otp") are assumed —
// they MUST exactly match the ##variable## placeholders defined in your
// MSG91 email templates (case-sensitive), same rule as the SMS/OTP templates.
// Verify these against your dashboard and adjust if they don't match.
// ─────────────────────────────────────────────────────────────────────────────

interface HttpResponse {
  statusCode: number;
  body: string;
}

function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode ?? 500, body });
        });
      }
    );
    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

const getAuthKey = (): string => {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) {
    throw new AppError("MSG91 is not configured. Set MSG91_AUTH_KEY in your .env file.", 500);
  }
  return key;
};

interface SendMsg91EmailOptions {
  templateId: string;
  to: { name: string; email: string };
  variables: Record<string, string>;
}

/**
 * Low-level: send a single email via MSG91's template-based Email API.
 * Fire-and-forget by convention at the call sites below — a failed email
 * never blocks signup or order placement.
 */
async function sendMsg91Email(options: SendMsg91EmailOptions): Promise<boolean> {
  const authKey     = getAuthKey();
  const domain      = process.env.MSG91_EMAIL_DOMAIN;
  const fromName    = process.env.MSG91_EMAIL_FROM_NAME || "Kidroo Toys";
  const fromAddress = process.env.MSG91_EMAIL_FROM_ADDRESS;

  if (!domain || !fromAddress) {
    console.warn("[MSG91 Email] MSG91_EMAIL_DOMAIN or MSG91_EMAIL_FROM_ADDRESS not configured — skipping send.");
    return false;
  }

  const payload = {
    recipients: [
      {
        to: [{ name: options.to.name, email: options.to.email }],
        variables: options.variables,
      },
    ],
    from: { name: fromName, email: fromAddress },
    domain,
    template_id: options.templateId,
  };

  try {
    const response = await postJson(
      "https://control.msg91.com/api/v5/email/send",
      payload,
      { authkey: authKey }
    );

    if (response.statusCode >= 400) {
      console.error(`[MSG91 Email] Send failed (HTTP ${response.statusCode}): ${response.body}`);
      return false;
    }

    let parsed: any = {};
    try { parsed = JSON.parse(response.body); } catch { /* non-JSON is ok */ }

    if (parsed?.type === "error") {
      console.error(`[MSG91 Email] Delivery failed: ${parsed?.message || response.body}`);
      return false;
    }

    console.log(`[MSG91 Email] Sent OK to ${options.to.email} (template: ${options.templateId})`);
    return true;
  } catch (err: any) {
    console.error("[MSG91 Email] Request error:", err?.message);
    return false;
  }
}

/**
 * Send a signup/verification OTP email.
 * Assumed template variables: "name", "otp" — verify against your MSG91
 * dashboard template and update the keys below if they differ.
 */
export const sendMsg91OTPEmail = async (
  toEmail: string,
  toName: string,
  otp: string
): Promise<boolean> => {
  const templateId = process.env.MSG91_EMAIL_OTP_TEMPLATE_ID;
  if (!templateId) {
    console.warn("[MSG91 Email] MSG91_EMAIL_OTP_TEMPLATE_ID not set — skipping OTP email.");
    return false;
  }

  return sendMsg91Email({
    templateId,
    to: { name: toName || "there", email: toEmail },
    variables: {
      name: toName || "there",
      otp,
    },
  });
};

/**
 * Send an order-confirmation email.
 * Assumed template variables: "name", "order_id", "amount", "payment_method" —
 * verify against your MSG91 dashboard template and update the keys below if
 * they differ.
 */
export const sendMsg91OrderConfirmedEmail = async (
  toEmail: string,
  toName: string,
  orderId: string,
  totalAmount: number,
  paymentMethod: string
): Promise<boolean> => {
  const templateId = process.env.MSG91_EMAIL_ORDER_CONFIRMED_TEMPLATE_ID;
  if (!templateId) {
    console.warn("[MSG91 Email] MSG91_EMAIL_ORDER_CONFIRMED_TEMPLATE_ID not set — skipping order confirmation email.");
    return false;
  }

  return sendMsg91Email({
    templateId,
    to: { name: toName || "there", email: toEmail },
    variables: {
      name: toName || "there",
      order_id: orderId,
      amount: `₹${Number(totalAmount).toFixed(2)}`,
      payment_method: paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment",
    },
  });
};
