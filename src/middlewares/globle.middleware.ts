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

  console.error(`[${requestId}] ERROR:`, {
    message: err.message,
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (isProduction) {
    if (err.isOperational) {
      return res.status(statusCode).json({
        success: false,
        message: err.message,
        requestId,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
        requestId,
      });
    }
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: err.stack,
    ...(err.errors && { errors: err.errors }),
    requestId,
  });
};
