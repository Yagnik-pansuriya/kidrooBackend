import jwt, { VerifyOptions } from "jsonwebtoken";
import AppError from "./appError";

export interface JWTPayload {
  id: string;
  email: string;
  role?: string;
  /**
   * "access" tokens are short-lived (15m) for API requests.
   * "refresh" tokens are long-lived (7d) for token renewal only.
   * NEVER accept a refresh token in authMiddleware.
   * NEVER accept an access token in refreshAccessToken.
   */
  type: "access" | "refresh";
}

/**
 * Internal token generator — use generateAccessToken / generateRefreshToken instead.
 */
const generateToken = (payload: JWTPayload, expiresIn: string): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) throw new AppError("JWT_SECRET not configured", 500);
  if (!payload.id) throw new AppError("User ID is required for token generation", 400);

  try {
    return jwt.sign(payload, secret, { expiresIn, algorithm: "HS256" } as any);
  } catch (error: any) {
    throw new AppError(`Error generating token: ${error.message}`, 500);
  }
};

/**
 * Generate a short-lived access token (15 minutes).
 */
export const generateAccessToken = (payload: Omit<JWTPayload, "type">): string =>
  generateToken({ ...payload, type: "access" }, "15m");

/**
 * Generate a long-lived refresh token (7 days).
 */
export const generateRefreshToken = (payload: Omit<JWTPayload, "type">): string =>
  generateToken({ ...payload, type: "refresh" }, "7d");

/**
 * Generate both access and refresh tokens.
 */
export const generateTokenPair = (payload: Omit<JWTPayload, "type">) => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  return { accessToken, refreshToken };
};

/**
 * Verify JWT token and optionally assert the expected type.
 * Throws 401 AppError on any failure.
 */
export const verifyToken = (token: string, expectedType?: "access" | "refresh"): JWTPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError("JWT_SECRET not configured", 500);

  try {
    const options: VerifyOptions = { algorithms: ["HS256"] };
    const decoded = jwt.verify(token, secret, options) as JWTPayload;

    // Enforce type separation: reject tokens used for the wrong purpose.
    // Backward-compatible: tokens without a type field are treated as access tokens.
    if (expectedType && decoded.type && decoded.type !== expectedType) {
      throw new AppError(
        `Invalid token type. Expected "${expectedType}", got "${decoded.type}".`,
        401,
      );
    }

    return decoded;
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    if (error.name === "TokenExpiredError") throw new AppError("Token has expired", 401);
    if (error.name === "JsonWebTokenError") throw new AppError("Invalid token", 401);
    throw new AppError(`Error verifying token: ${error.message}`, 401);
  }
};

/**
 * Decode JWT token without verification (use for logging only — never trust decoded data).
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload | null;
  } catch {
    return null;
  }
};
