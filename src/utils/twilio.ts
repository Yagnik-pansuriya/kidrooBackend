import twilio from "twilio";
import AppError from "./appError";
import { normalizeToE164 } from "./phoneUtils";

// Re-export for any code that imports normalizeToE164 from this module
export { normalizeToE164 } from "./phoneUtils";

/**
 * Send an SMS via Twilio.
 * Lazily reads env vars so missing config is caught at call-time, not import-time.
 */
export const sendTwilioSMS = async (to: string, body: string): Promise<void> => {
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

export const sendSMS = sendTwilioSMS;
