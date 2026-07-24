import { sendMsg91SMS, sendMsg91OTP, sendMsg91ResetPasswordOTP } from "./msg91";
import { sendTwilioSMS } from "./twilio";

// ═════════════════════════════════════════════════════════════════════════════
// sendOTP — Route OTP via SMS_PROVIDER env var (msg91 | twilio)
//
// ⚡ DEV MODE: OTP is ALWAYS printed to the server console in non-production
//    so you can test without a working SMS provider.
//
//   SMS_PROVIDER=msg91   → MSG91 OTP API v5 (DLT-compliant, India)
//   SMS_PROVIDER=twilio  → Twilio SMS (international)
// ═════════════════════════════════════════════════════════════════════════════
export const sendOTP = async (
  mobile: string,
  otp: string,
  context: "verification" | "password reset" = "verification"
): Promise<void> => {
  const provider = (process.env.SMS_PROVIDER || "msg91").toLowerCase();

  // ✅ Always log OTP to console in development so you can test without SMS
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`[OTP DEBUG] Mobile: +91${mobile}`);
    console.log(`[OTP DEBUG] OTP:    ${otp}`);
    console.log(`[OTP DEBUG] Context: ${context}`);
    console.log(`[OTP DEBUG] Provider: ${provider}`);
    console.log(`${"=".repeat(50)}\n`);
  }

  if (provider === "twilio") {
    await sendTwilioSMS(mobile, `Your Kidroo ${context} code is: ${otp}. Valid for 10 minutes. Do not share with anyone.`);
  } else {
    // MSG91: use separate DLT template for password reset vs signup
    if (context === "password reset") {
      await sendMsg91ResetPasswordOTP(mobile, otp);
    } else {
      await sendMsg91OTP(mobile, otp);
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// resendOTP — Same routing as sendOTP
// ═════════════════════════════════════════════════════════════════════════════
export const resendOTP = async (
  mobile: string,
  otp: string,
  context: "verification" | "password reset" = "verification"
): Promise<void> => {
  // Generate a fresh OTP send — MSG91 retry API sends old OTP causing mismatch
  await sendOTP(mobile, otp, context);
};

// ═════════════════════════════════════════════════════════════════════════════
// sendSMS — Plain transactional SMS (non-OTP)
// ═════════════════════════════════════════════════════════════════════════════
export const sendSMS = async (to: string, body: string): Promise<void> => {
  const provider = (process.env.SMS_PROVIDER || "msg91").toLowerCase();
  if (provider === "twilio") {
    await sendTwilioSMS(to, body);
  } else {
    await sendMsg91SMS(to, body);
  }
};
