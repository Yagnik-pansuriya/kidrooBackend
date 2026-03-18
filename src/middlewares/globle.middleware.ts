import { Request, Response, NextFunction } from "express";

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;

  console.error("ERROR:", err);

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};