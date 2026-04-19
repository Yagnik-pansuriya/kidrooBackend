import Razorpay from "razorpay";

let razorpayInstance: Razorpay | null = null;

/**
 * Lazily initialize Razorpay only when actually needed (e.g. order creation).
 * This prevents the server from crashing at startup if RAZORPAY_KEY_ID / KEY_SECRET
 * are missing or placeholder values.
 */
export function getRazorpayInstance(): Razorpay {
  if (!razorpayInstance) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret || key_id.includes("XXXX") || key_secret.includes("XXXX")) {
      throw new Error(
        "Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment."
      );
    }

    razorpayInstance = new Razorpay({ key_id, key_secret });
  }

  return razorpayInstance;
}

// Default export for backward compatibility — lazy getter
export default { get instance() { return getRazorpayInstance(); } };
