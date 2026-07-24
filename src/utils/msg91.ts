import https from "https";
import AppError from "./appError";
import { normalizeToE164 } from "./phoneUtils";

// ─────────────────────────────────────────────────────────────────────────────
// MSG91 Utility — SMS + OTP
//
// SMS_PROVIDER=msg91 activates this module.
//
// Required env vars:
//   MSG91_AUTH_KEY        — Your MSG91 authentication key
//   MSG91_SENDER_ID       — 6-letter DLT-approved sender ID  (SMS only)
//   MSG91_ROUTE           — SMS route (default "4" = transactional)
//   MSG91_COUNTRY         — Country code (default "91" = India)
//   MSG91_TEMPLATE_ID     — DLT Template ID for OTP SMS     (optional but recommended)
//   MSG91_ENTITY_ID       — DLT Entity ID                   (optional but recommended)
//   MSG91_OTP_TEMPLATE_ID — MSG91 OTP template ID           (OTP API — create in MSG91 dashboard)
//
// OTP API docs: https://docs.msg91.com/otp/sendotp
// ─────────────────────────────────────────────────────────────────────────────

// ── Internal HTTP helper ──────────────────────────────────────────────────────
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
          "Content-Type": "application/json",
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

function getJson(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "GET", headers }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        resolve({ statusCode: response.statusCode ?? 500, body });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

// ── Normalize mobile to 10-digit Indian number for MSG91 ─────────────────────
const getIndianMobile = (mobile: string): string =>
  normalizeToE164(mobile).replace(/^\+91/, "");

// ── Read required auth key ────────────────────────────────────────────────────
const getAuthKey = (): string => {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) {
    throw new AppError(
      "MSG91 is not configured. Set MSG91_AUTH_KEY in your .env file.",
      500
    );
  }
  return key;
};

// ─────────────────────────────────────────────────────────────────────────────
// DLT-registered OTP message body.
//
// MUST match the approved DLT template (MSG91_TEMPLATE_ID) CHARACTER FOR
// CHARACTER, with {#numeric#} replaced by the OTP. Any deviation — a missing
// word, different casing, extra/missing punctuation — causes the operator to
// reject the SMS with "SMS not matched with DLT template".
//
// Registered text on Airtel DLT for template 1077038980000376744:
//   "Your Kidroo Toys OTP for Registration is {#numeric#}. Valid for 10
//    minutes. Do not share with anyone. - Team Kidroo toys"
//
// If you edit the template on the DLT portal, update this string to match.
// ─────────────────────────────────────────────────────────────────────────────
export const buildDltOtpMessage = (otp: string): string =>
  `Your Kidroo Toys OTP for Registration is ${otp}. Valid for 10 minutes. Do not share with anyone. - Team Kidroo toys`;

// ─────────────────────────────────────────────────────────────────────────────
// DLT-registered RESET PASSWORD message body.
//
// MUST match the DLT-approved template for MSG91_RESET_PASSWORD_TEMPLATE_ID
// character for character, with {#numeric#} replaced by the OTP.
//
// Register this exact text on your DLT portal and link it in MSG91 dashboard:
//   "Your Kidroo Toys OTP for Password Reset is {#numeric#}. Valid for 10
//    minutes. Do not share with anyone. - Team Kidroo Toys"
// ─────────────────────────────────────────────────────────────────────────────
export const buildDltResetPasswordMessage = (otp: string): string =>
  `Your Kidroo Toys OTP for Password Reset is ${otp}. Valid for 10 minutes. Do not share with anyone. - Team Kidroo Toys`;

// ═════════════════════════════════════════════════════════════════════════════
// 1.  MSG91 OTP API  (recommended for OTP verification in India)
//
//     Uses MSG91's managed OTP flow:
//       • /api/v5/otp        → send OTP
//       • /api/v5/otp/retry  → resend OTP
//       • /api/v5/otp/verify → verify OTP entered by user
//
//     MSG91 manages OTP generation internally when using this API.
//     Your backend still generates its own OTP and verifies via Redis
//     (see otpService.ts) — MSG91 OTP API is used ONLY for delivery.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send an OTP via MSG91's dedicated OTP API.
 *
 * @param mobile  10-digit Indian mobile number
 * @param otp     The OTP generated by otpService (6 digits)
 */
export const sendMsg91OTP = async (mobile: string, otp: string): Promise<void> => {
  const authKey     = getAuthKey();
  const templateId  = process.env.MSG91_OTP_TEMPLATE_ID;
  const mobile10    = getIndianMobile(mobile);

  // MSG91_OTP_VIA_SMS=true routes OTP through the v2 sendsms API instead of the
  // OTP API. Use this when you need every DLT value (sender, route, country,
  // DLT_TE_ID, DLT_PE_ID) sent explicitly in the request — the OTP API accepts
  // none of them and resolves them from the template instead, which is why they
  // show up blank in MSG91's failure logs.
  if (process.env.MSG91_OTP_VIA_SMS === "true") {
    console.log("[MSG91 OTP] Routing via v2 sendsms API (explicit DLT params).");
    await sendMsg91SMS(mobile, buildDltOtpMessage(otp));
    return;
  }

  if (!templateId) {
    // Fall back to plain SMS if no OTP template configured
    console.warn("[MSG91 OTP] MSG91_OTP_TEMPLATE_ID not set — falling back to plain SMS.");
    await sendMsg91SMS(mobile, buildDltOtpMessage(otp));
    return;
  }

  // authkey MUST be a URL query param — NOT an HTTP header
  // Per MSG91 Send OTP docs (docs.msg91.com/otp/sendotp):
  //   ?template_id=...&mobile=...&authkey=...&otp=...
  // "otp" is the documented query param for supplying your own pre-generated
  // OTP value (MSG91 auto-generates one only if this is omitted).
  // realTimeResponse=1 bypasses MSG91's response cache and returns the actual
  // failure reason instead of a generic/stale one — essential for debugging.
  const url =
    `https://control.msg91.com/api/v5/otp` +
    `?template_id=${encodeURIComponent(templateId)}` +
    `&mobile=91${mobile10}` +
    `&authkey=${encodeURIComponent(authKey)}` +
    `&otp=${encodeURIComponent(otp)}` +
    `&realTimeResponse=1`;

  // Body carries any additional custom template variables (case-sensitive,
  // must match the ##VARNAME## placeholders defined in the MSG91 template).
  // The otp_verification template's variable is named ##number## — confirmed
  // from the MSG91 dashboard template preview.
  const payload = {
    number: otp
  };


  // FIX 3: Always log so you can see the OTP + MSG91 response in server terminal
  console.log(`\n${'='.repeat(55)}`);
  console.log(`[MSG91 OTP] Sending to  : +91${mobile10}`);
  console.log(`[MSG91 OTP] OTP value   : ${otp}`);
  console.log(`[MSG91 OTP] Template ID : ${templateId}`);
  console.log(`[MSG91 OTP] Payload     : ${JSON.stringify(payload)}`);
  console.log(`${'='.repeat(55)}\n`);

  try {
    // FIX 1 continued: no authkey in headers — it is already in the URL
    const response = await postJson(url, payload, {});

    console.log(`[MSG91 OTP] Response HTTP : ${response.statusCode}`);
    console.log(`[MSG91 OTP] Response Body : ${response.body}`);

    if (response.statusCode >= 400) {
      throw new AppError(
        `MSG91 OTP send failed (HTTP ${response.statusCode}): ${response.body}`,
        500
      );
    }

    // MSG91 returns HTTP 200 even on errors — must always check the body!
    // Success: {"type":"success","message":"84XXXXXXXX"}
    // Error:   {"type":"error","message":"Authentication failed"}
    //          {"type":"error","message":"Template not found or not approved"}
    //          {"type":"error","message":"Insufficient balance"}
    let parsed: any = {};
    try { parsed = JSON.parse(response.body); } catch { /* non-JSON is ok */ }

    if (parsed?.type === "error") {
      const reason = parsed?.message || parsed?.code || response.body;
      throw new AppError(
        `MSG91 OTP delivery failed: "${reason}". ` +
        `Check: (1) Template approved & Active in MSG91 dashboard? ` +
        `(2) Wallet has balance? (3) Auth key valid? ` +
        `(4) DLT: header+template+brand all linked on the operator portal?`,
        500
      );
    }

    console.log(`[MSG91 OTP] SUCCESS — OTP delivered to +91${mobile10}`);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `MSG91 OTP send error: ${err.message ?? "Unknown error"}`,
      500
    );
  }
};

/**
 * Send a FORGOT PASSWORD OTP via MSG91 SMS (v2 sendsms API).
 * Uses MSG91_RESET_PASSWORD_TEMPLATE_ID (separate DLT template from signup).
 *
 * @param mobile  10-digit Indian mobile number
 * @param otp     The OTP generated by otpService (6 digits)
 */
export const sendMsg91ResetPasswordOTP = async (mobile: string, otp: string): Promise<void> => {
  const resetTemplateId = process.env.MSG91_RESET_PASSWORD_TEMPLATE_ID;

  if (!resetTemplateId || resetTemplateId.startsWith("REPLACE_")) {
    // Fall back to plain sendMsg91SMS with the reset password message
    console.warn("[MSG91 ResetPwd] MSG91_RESET_PASSWORD_TEMPLATE_ID not set — sending via SMS fallback.");
    await sendMsg91SMS(mobile, buildDltResetPasswordMessage(otp));
    return;
  }

  // Temporarily override DLT_TE_ID by calling sendMsg91SMS with the reset template
  const authKey   = getAuthKey();
  const senderId  = process.env.MSG91_SENDER_ID;
  const route     = process.env.MSG91_ROUTE    || "4";
  const country   = process.env.MSG91_COUNTRY  || "91";
  const entityId  = process.env.MSG91_ENTITY_ID;
  const mobile10  = getIndianMobile(mobile);
  const body      = buildDltResetPasswordMessage(otp);

  if (!senderId) {
    throw new AppError("MSG91 SMS is not configured. Set MSG91_SENDER_ID in your .env file.", 500);
  }

  const payload: Record<string, unknown> = {
    sender: senderId,
    route,
    country,
    DLT_TE_ID: resetTemplateId,          // ← reset password DLT template
    sms: [{ message: body, to: [mobile10] }],
  };

  if (entityId) payload.DLT_PE_ID = entityId;

  console.log(`\n${"=".repeat(55)}`);
  console.log(`[MSG91 ResetPwd] Sending to  : +91${mobile10}`);
  console.log(`[MSG91 ResetPwd] OTP value   : ${otp}`);
  console.log(`[MSG91 ResetPwd] DLT_TE_ID   : ${resetTemplateId}`);
  console.log(`[MSG91 ResetPwd] Message     : ${body}`);
  console.log(`${"=".repeat(55)}\n`);

  try {
    const response = await postJson(
      `https://api.msg91.com/api/v2/sendsms?country=${country}`,
      payload,
      { authkey: authKey }
    );

    console.log(`[MSG91 ResetPwd] Response HTTP : ${response.statusCode}`);
    console.log(`[MSG91 ResetPwd] Response Body : ${response.body}`);

    if (response.statusCode >= 400) {
      throw new AppError(`MSG91 reset password SMS failed (${response.statusCode}): ${response.body}`, 500);
    }

    let parsed: any = {};
    try { parsed = JSON.parse(response.body); } catch { /* non-JSON ok */ }

    if (parsed?.type === "error") {
      const reason = parsed?.message || parsed?.code || response.body;
      throw new AppError(
        `MSG91 reset password SMS delivery failed: "${reason}". ` +
        `Check: (1) DLT template approved? (2) Template text matches exactly? (3) Wallet balance?`,
        500
      );
    }

    console.log(`[MSG91 ResetPwd] SUCCESS — OTP delivered to +91${mobile10}`);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`MSG91 reset password SMS error: ${err.message ?? "Unknown error"}`, 500);
  }
};

/**
 * Resend OTP via MSG91's OTP retry API.
 * Call this when user requests a resend.
 *
 * @param mobile  10-digit Indian mobile number
 * @param retryType  "text" (default) or "voice"
 */
export const resendMsg91OTP = async (
  mobile: string,
  retryType: "text" | "voice" = "text"
): Promise<void> => {
  const authKey  = getAuthKey();
  const mobile10 = getIndianMobile(mobile);

  // Per MSG91 Resend OTP docs (docs.msg91.com/otp/resend-otp):
  // ?authkey=&retrytype=&mobile=  — authkey is a URL query param here too,
  // NOT an HTTP header (this differs from Verify OTP, which uses a header).
  const url =
    `https://control.msg91.com/api/v5/otp/retry` +
    `?authkey=${encodeURIComponent(authKey)}` +
    `&retrytype=${retryType}` +
    `&mobile=91${mobile10}`;

  try {
    const response = await getJson(url, {});

    if (response.statusCode >= 400) {
      throw new AppError(
        `MSG91 OTP resend failed (${response.statusCode}): ${response.body}`,
        500
      );
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `MSG91 OTP resend error: ${err.message ?? "Unknown error"}`,
      500
    );
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 2.  MSG91 Plain SMS API  (used when OTP template is not configured,
//     or for non-OTP transactional messages)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send a plain transactional SMS via MSG91 v2 API.
 *
 * @param to    10-digit Indian mobile (or E.164 +91...)
 * @param body  SMS message text
 */
export const sendMsg91SMS = async (to: string, body: string): Promise<void> => {
  const authKey   = getAuthKey();
  const senderId  = process.env.MSG91_SENDER_ID;
  const route     = process.env.MSG91_ROUTE    || "4";
  const country   = process.env.MSG91_COUNTRY  || "91";
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const entityId   = process.env.MSG91_ENTITY_ID;
  const mobile     = getIndianMobile(to);

  if (!senderId) {
    throw new AppError(
      "MSG91 SMS is not configured. Set MSG91_SENDER_ID in your .env file.",
      500
    );
  }

  const payload: Record<string, unknown> = {
    sender: senderId,
    route,
    country,
    sms: [
      {
        message: body,
        to: [mobile],
      },
    ],
  };

  if (templateId) payload.DLT_TE_ID = templateId;
  if (entityId)   payload.DLT_PE_ID = entityId;

  // Log every value being sent — these are the exact fields that showed as
  // blank ("Sender: -", "Country Code: 0") in MSG91's failure logs when the
  // OTP API was used, because that endpoint doesn't accept them.
  console.log(`\n${"=".repeat(55)}`);
  console.log(`[MSG91 SMS] Endpoint    : api/v2/sendsms`);
  console.log(`[MSG91 SMS] Sender ID   : ${senderId}`);
  console.log(`[MSG91 SMS] Route       : ${route}`);
  console.log(`[MSG91 SMS] Country     : ${country}`);
  console.log(`[MSG91 SMS] DLT_TE_ID   : ${templateId ?? "(not set)"}`);
  console.log(`[MSG91 SMS] DLT_PE_ID   : ${entityId ?? "(not set)"}`);
  console.log(`[MSG91 SMS] To          : ${mobile}`);
  console.log(`[MSG91 SMS] Message     : ${body}`);
  console.log(`${"=".repeat(55)}\n`);

  try {
    const response = await postJson(
      `https://api.msg91.com/api/v2/sendsms?country=${country}`,
      payload,
      { authkey: authKey }
    );

    console.log(`[MSG91 SMS] Response HTTP : ${response.statusCode}`);
    console.log(`[MSG91 SMS] Response Body : ${response.body}`);

    if (response.statusCode >= 400) {
      throw new AppError(
        `MSG91 SMS failed (${response.statusCode}): ${response.body || "Unknown error"}`,
        500
      );
    }

    // MSG91 returns HTTP 200 even on errors — the body is the source of truth.
    let parsed: any = {};
    try { parsed = JSON.parse(response.body); } catch { /* non-JSON is ok */ }

    if (parsed?.type === "error") {
      const reason = parsed?.message || parsed?.code || response.body;
      throw new AppError(
        `MSG91 SMS delivery failed: "${reason}". ` +
        `If this mentions a DLT template mismatch, the message text must match ` +
        `the registered template for DLT_TE_ID ${templateId} character for character.`,
        500
      );
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `Failed to send SMS via MSG91: ${err.message ?? "Unknown error"}`,
      500
    );
  }
};
