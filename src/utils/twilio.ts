import twilio from "twilio";
import AppError from "./appError";

/**
 * Normalize Indian mobile to E.164 (+91XXXXXXXXXX).
 * Accepts 10-digit, 91XXXXXXXXXX, or +91XXXXXXXXXX formats.
 */
export const normalizeToE164 = (mobile: string): string => {
  const digits = mobile.replace(/\D/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits[2])) {
    return `+${digits}`;
  }

  throw new AppError("Invalid Indian mobile number format", 400);
};

/**
 * Send an SMS via Twilio.
 * Lazily reads env vars so missing config is caught at call-time, not import-time.
 */
export const sendSMS = async (to: string, body: string): Promise<void> => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new AppError(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.",
      500
    );
  }

  const client = twilio(accountSid, authToken);
  const toE164 = normalizeToE164(to);

  try {
    await client.messages.create({ body, from: fromNumber, to: toE164 });
  } catch (err: any) {
    throw new AppError(
      `Failed to send SMS: ${err.message ?? "Unknown Twilio error"}`,
      500
    );
  }
};
