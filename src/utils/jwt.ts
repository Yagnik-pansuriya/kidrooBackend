import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import AppError from "./appError";

interface JWTPayload {
  id: string;
  email: string;
  role?: string;
}

/**
 * Generate JWT token
 * @param payload - Token payload
 * @param expiresIn - Token expiration time (default from env)
 * @returns JWT token string
 */
export const generateToken = (
  payload: JWTPayload,
  expiresIn?: string,
): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError("JWT_SECRET not configured", 500);
  }

  if (!payload.id) {
    throw new AppError("User ID is required for token generation", 400);
  }

  try {
    const options: any = {
      expiresIn: expiresIn || process.env.JWT_EXPIRE || "7d",
      algorithm: "HS256",
    };

    const token = jwt.sign(payload, secret, options);
    return token;
  } catch (error: any) {
    throw new AppError(`Error generating token: ${error.message}`, 500);
  }
};

/**
 * Verify JWT token
 * @param token - JWT token to verify
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): JWTPayload => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError("JWT_SECRET not configured", 500);
  }

  try {
    const options: VerifyOptions = {
      algorithms: ["HS256"],
    };

    const decoded = jwt.verify(token, secret, options) as JWTPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw new AppError("Token has expired", 401);
    }
    if (error.name === "JsonWebTokenError") {
      throw new AppError("Invalid token", 401);
    }
    throw new AppError(`Error verifying token: ${error.message}`, 401);
  }
};

/**
 * Decode JWT token without verification
 * @param token - JWT token to decode
 * @returns Decoded token payload
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.decode(token) as JWTPayload | null;
    return decoded;
  } catch (error: any) {
    return null;
  }
};

/**
 * Generate both access and refresh tokens
 * @param payload - Token payload
 * @returns Object with access and refresh tokens
 */
export const generateTokenPair = (payload: JWTPayload) => {
  const accessToken = generateToken(payload, "15m");
  const refreshToken = generateToken(payload, "7d");

  return {
    accessToken,
    refreshToken,
  };
};
