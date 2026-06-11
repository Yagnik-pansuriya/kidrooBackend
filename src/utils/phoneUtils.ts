import AppError from "./appError";

// ─────────────────────────────────────────────────────────────────────────────
// Phone Number Utilities — provider-agnostic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an Indian mobile number to E.164 format (+91XXXXXXXXXX).
 * Accepts:
 *   • 10-digit numbers starting with 6-9   → +91XXXXXXXXXX
 *   • 12-digit numbers starting with 91   → +91XXXXXXXXXX
 *   • Already formatted +91XXXXXXXXXX      → returned as-is
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
 * Extract the plain 10-digit Indian mobile number from any format.
 * Used by MSG91 which expects a 10-digit number (no country prefix).
 */
export const getIndianMobile10 = (mobile: string): string =>
  normalizeToE164(mobile).replace(/^\+91/, "");
