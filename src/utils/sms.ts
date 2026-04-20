import AppError from "./appError";
import { sendMsg91SMS } from "./msg91";
import { sendTwilioSMS } from "./twilio";

export type SMSProvider = "twilio" | "msg91";

const getSMSProvider = (): SMSProvider => {
  const provider = (process.env.SMS_PROVIDER || "twilio").trim().toLowerCase();

  if (provider === "twilio" || provider === "msg91") {
    return provider;
  }

  throw new AppError(
    "Invalid SMS_PROVIDER. Use 'twilio' or 'msg91'.",
    500
  );
};

export const sendSMS = async (to: string, body: string): Promise<void> => {
  const provider = getSMSProvider();

  if (provider === "msg91") {
    await sendMsg91SMS(to, body);
    return;
  }

  await sendTwilioSMS(to, body);
};
