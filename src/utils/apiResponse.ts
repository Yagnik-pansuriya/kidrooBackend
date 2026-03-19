import { Response } from "express";

/**
 * Standard API Response Interface
 */
export interface ApiResponsePayload {
  success: boolean;
  message?: string;
  data?: any;
  accessToken?: string;
  refreshToken?: string;
  timestamp?: string;
}

/**
 * Send standardized success response
 * @param res - Express Response object
 * @param statusCode - HTTP status code (default: 200)
 * @param message - Response message
 * @param data - Response data payload
 * @param tokens - Optional tokens (accessToken, refreshToken)
 */

export const sendSuccessResponse = (
  res: Response,
  statusCode: number = 200,
  message: string = "Success",
  data?: any,
  tokens?: { accessToken?: string; refreshToken?: string },
): Response => {
  const responsePayload: ApiResponsePayload = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data) {
    responsePayload.data = data;
  }

  if (tokens?.accessToken) {
    responsePayload.accessToken = tokens.accessToken;
  }

  if (tokens?.refreshToken) {
    responsePayload.refreshToken = tokens.refreshToken;
  }

  return res.status(statusCode).json(responsePayload);
};

/**
 * Send standardized error response
 * @param res - Express Response object
 * @param statusCode - HTTP status code (default: 500)
 * @param message - Error message
 * @param errors - Optional error details/validation errors
 */

export const sendErrorResponse = (
  res: Response,
  statusCode: number = 500,
  message: string = "Internal Server Error",
  errors?: any,
): Response => {
  const responsePayload: any = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };

  if (errors) {
    responsePayload.errors = errors;
  }

  return res.status(statusCode).json(responsePayload);
};

/**
 * Paginated response helper
 * @param res - Express Response object
 * @param statusCode - HTTP status code
 * @param message - Response message
 * @param data - Array of data items
 * @param pagination - Pagination details
 */
export const sendPaginatedResponse = (
  res: Response,
  statusCode: number = 200,
  message: string = "Success",
  data: any[],
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  },
): Response => {
  const responsePayload: any = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (pagination) {
    responsePayload.pagination = pagination;
  }

  return res.status(statusCode).json(responsePayload);
};

/**
 * Validation error response helper
 * @param res - Express Response object
 * @param validationErrors - Array of validation errors
 */
export const sendValidationErrorResponse = (
  res: Response,
  validationErrors: Array<{ field: string; message: string }>,
): Response => {
  return res.status(400).json({
    success: false,
    message: "Validation error",
    errors: validationErrors,
    timestamp: new Date().toISOString(),
  });
};
