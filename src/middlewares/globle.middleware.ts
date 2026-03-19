import { Request, Response, NextFunction } from "express";

const isProduction = process.env.NODE_ENV === "production";

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = err.statusCode || 500;
  const requestId = req.headers["x-request-id"] || "unknown";

  // Always log errors server-side
  console.error(`[${requestId}] ERROR:`, {
    message: err.message,
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Production: Don't expose sensitive details
  if (isProduction) {
    if (err.isOperational) {
      // Operational error - safe to send to client
      return res.status(statusCode).json({
        success: false,
        message: err.message,
        requestId,
      });
    } else {
      // Programming or unknown error - don't expose details
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        requestId,
      });
    }
  }

  // Development: Send full error details
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: err.stack,
    ...(err.errors && { errors: err.errors }),
    requestId,
  });
};
