import { Response } from "express";
import AppError from "./appError";

interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  path?: string;
  domain?: string;
}

/**
 * Send security token in cookie
 * @param res - Express response object
 * @param token - Token to send
 * @param cookieName - Cookie name
 * @param options - Cookie options
 */
export const sendTokenCookie = (
  res: Response,
  token: string,
  cookieName: string = "token",
  options?: CookieOptions,
): void => {
  try {
    if (!token) {
      throw new AppError("Token is required", 400);
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Default secure cookie options
    const defaultOptions: CookieOptions = {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true, // Only accessible by server
      secure: isProduction, // Only send over HTTPS in production
      sameSite: "strict", // CSRF protection
      path: "/",
    };

    // Merge with custom options
    const finalOptions = { ...defaultOptions, ...options };

    // Set the cookie
    res.cookie(cookieName, token, finalOptions);
  } catch (error: any) {
    throw new AppError(`Error setting cookie: ${error.message}`, 500);
  }
};

/**
 * Send access and refresh tokens in separate cookies
 * @param res - Express response object
 * @param accessToken - Access token
 * @param refreshToken - Refresh token
 * @param options - Cookie options
 */
export const sendTokenCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  options?: CookieOptions,
): void => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    // Access token cookie (short-lived)
    const accessTokenOptions: CookieOptions = {
      maxAge: 15 * 60 * 1000, // 15 minutes
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      ...options,
    };

    // Refresh token cookie (long-lived)
    const refreshTokenOptions: CookieOptions = {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      ...options,
    };

    res.cookie("accessToken", accessToken, accessTokenOptions);
    res.cookie("refreshToken", refreshToken, refreshTokenOptions);
  } catch (error: any) {
    throw new AppError(`Error setting cookies: ${error.message}`, 500);
  }
};

/**
 * Clear authentication cookies
 * @param res - Express response object
 * @param cookieNames - Cookie names to clear
 */
export const clearCookies = (
  res: Response,
  cookieNames: string[] = ["token", "accessToken", "refreshToken"],
): void => {
  try {
    cookieNames.forEach((name) => {
      res.clearCookie(name, {
        path: "/",
      });
    });
  } catch (error: any) {
    throw new AppError(`Error clearing cookies: ${error.message}`, 500);
  }
};

/**
 * Get cookie value from request
 * @param req - Express request object
 * @param cookieName - Cookie name to retrieve
 * @returns Cookie value or null
 */
export const getCookie = (req: any, cookieName: string): string | null => {
  try {
    const cookies = req.cookies;

    if (!cookies || !cookies[cookieName]) {
      return null;
    }

    return cookies[cookieName];
  } catch (error) {
    return null;
  }
};
