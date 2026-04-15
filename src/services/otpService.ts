import crypto from "crypto";
import { redis } from "../config/redis";
import AppError from "../utils/appError";

// ── Constants ─────────────────────────────────────────────────────
const OTP_TTL_SECONDS = 5 * 60;        // OTP valid for 5 min
const PENDING_TTL_SECONDS = 10 * 60;   // Pending record lives 10 min (allows 1 resend)
const RESEND_COOLDOWN_SECONDS = 60;    // 60-second cooldown between resends
const MAX_OTP_ATTEMPTS = 5;            // Brute-force guard

// ── Redis key factory ─────────────────────────────────────────────
const KEY = {
  signup: (mobile: string) => `otp:signup:${mobile}`,
  forgot: (mobile: string) => `otp:forgot:${mobile}`,
  cooldown: (mobile: string) => `otp:cooldown:${mobile}`,
};

// ── Interfaces ────────────────────────────────────────────────────
export interface PendingSignupPayload {
  firstName: string;
  lastName: string;
  mobile: string;
  /** Plaintext — hashed by Customer model pre-save hook on DB insert */
  password: string;
  email?: string;
  alternatePhone?: string;
}

interface StoredSignup extends PendingSignupPayload {
  otpHash: string;
  expiresAt: number;
  attempts: number;
}

interface StoredForgot {
  otpHash: string;
  expiresAt: number;
  attempts: number;
}

// ── OTP generation ────────────────────────────────────────────────
const generateRawOTP = (): string =>
  crypto.randomInt(100_000, 1_000_000).toString();

const hashOTP = (otp: string): string =>
  crypto.createHash("sha256").update(otp).digest("hex");

// ═══════════════════════════════════════════════════════════════
// SIGNUP OTP
// ═══════════════════════════════════════════════════════════════

/**
 * Generate, hash, and store signup OTP in Redis.
 * Returns the raw OTP (caller must send it via SMS — never store plain).
 */
export async function generateAndStoreSignupOTP(
  payload: PendingSignupPayload
): Promise<string> {
  const otp = generateRawOTP();

  const stored: StoredSignup = {
    ...payload,
    otpHash: hashOTP(otp),
    expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
    attempts: 0,
  };

  await redis.set(
    KEY.signup(payload.mobile),
    JSON.stringify(stored),
    "EX",
    PENDING_TTL_SECONDS
  );

  return otp;
}

/** Returns pending signup data (without OTP hash) or null if expired/not found. */
export async function getPendingSignup(
  mobile: string
): Promise<PendingSignupPayload | null> {
  const raw = await redis.get(KEY.signup(mobile));
  if (!raw) return null;
  const { otpHash, expiresAt, attempts, ...payload } = JSON.parse(raw) as StoredSignup;
  return payload;
}

/**
 * Verify signup OTP. On success, deletes the Redis key and returns the payload.
 * On failure, increments attempt counter (invalidates after MAX_OTP_ATTEMPTS).
 */
export async function verifySignupOTP(
  mobile: string,
  otp: string
): Promise<PendingSignupPayload> {
  const key = KEY.signup(mobile);
  const raw = await redis.get(key);

  if (!raw) {
    throw new AppError("OTP expired or not found. Please sign up again.", 400);
  }

  const stored = JSON.parse(raw) as StoredSignup;

  if (Date.now() > stored.expiresAt) {
    await redis.del(key);
    throw new AppError("OTP has expired. Please request a new one.", 400);
  }

  if (stored.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(key);
    throw new AppError(
      "Too many incorrect attempts. Please request a new OTP.",
      429
    );
  }

  if (hashOTP(otp) !== stored.otpHash) {
    stored.attempts += 1;
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(stored), "EX", Math.max(ttl, 1));

    const left = MAX_OTP_ATTEMPTS - stored.attempts;
    throw new AppError(
      left > 0
        ? `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} remaining.`
        : "Too many incorrect attempts. Please request a new OTP.",
      400
    );
  }

  // ✅ Valid — delete key so OTP can't be replayed
  await redis.del(key);

  const { otpHash, expiresAt, attempts, ...payload } = stored;
  return payload;
}

/**
 * Refresh signup OTP (for resend). Resets attempt counter and extends TTL.
 * Caller must check cooldown BEFORE calling this.
 */
export async function refreshSignupOTP(mobile: string): Promise<string> {
  const key = KEY.signup(mobile);
  const raw = await redis.get(key);

  if (!raw) {
    throw new AppError("No pending signup found. Please start over.", 404);
  }

  const stored = JSON.parse(raw) as StoredSignup;
  const otp = generateRawOTP();

  stored.otpHash = hashOTP(otp);
  stored.expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
  stored.attempts = 0;

  await redis.set(key, JSON.stringify(stored), "EX", PENDING_TTL_SECONDS);
  return otp;
}

// ═══════════════════════════════════════════════════════════════
// FORGOT PASSWORD OTP
// ═══════════════════════════════════════════════════════════════

/** Generate, hash, and store a forgot-password OTP. Returns raw OTP. */
export async function generateAndStoreForgotOTP(mobile: string): Promise<string> {
  const otp = generateRawOTP();

  const stored: StoredForgot = {
    otpHash: hashOTP(otp),
    expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
    attempts: 0,
  };

  await redis.set(
    KEY.forgot(mobile),
    JSON.stringify(stored),
    "EX",
    PENDING_TTL_SECONDS
  );

  return otp;
}

/**
 * Verify forgot-password OTP. On success, deletes the Redis key.
 * Throws on expiry, wrong OTP, or too many attempts.
 */
export async function verifyForgotOTP(mobile: string, otp: string): Promise<void> {
  const key = KEY.forgot(mobile);
  const raw = await redis.get(key);

  if (!raw) {
    throw new AppError("OTP expired or not found. Please request a new one.", 400);
  }

  const stored = JSON.parse(raw) as StoredForgot;

  if (Date.now() > stored.expiresAt) {
    await redis.del(key);
    throw new AppError("OTP has expired. Please request a new one.", 400);
  }

  if (stored.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(key);
    throw new AppError(
      "Too many incorrect attempts. Please request a new OTP.",
      429
    );
  }

  if (hashOTP(otp) !== stored.otpHash) {
    stored.attempts += 1;
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(stored), "EX", Math.max(ttl, 1));

    const left = MAX_OTP_ATTEMPTS - stored.attempts;
    throw new AppError(
      left > 0
        ? `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} remaining.`
        : "Too many incorrect attempts. Please request a new OTP.",
      400
    );
  }

  await redis.del(key);
}

// ═══════════════════════════════════════════════════════════════
// RESEND COOLDOWN
// ═══════════════════════════════════════════════════════════════

/** Returns seconds remaining in cooldown (0 = no cooldown active). */
export async function getResendCooldown(mobile: string): Promise<number> {
  const ttl = await redis.ttl(KEY.cooldown(mobile));
  return Math.max(ttl, 0);
}

/** Set a 60-second resend cooldown for the given mobile. */
export async function setResendCooldown(mobile: string): Promise<void> {
  await redis.set(KEY.cooldown(mobile), "1", "EX", RESEND_COOLDOWN_SECONDS);
}
