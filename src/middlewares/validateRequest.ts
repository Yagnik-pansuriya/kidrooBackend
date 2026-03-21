import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import AppError from "../utils/appError";

/**
 * Higher-order function that takes a Zod schema and returns an Express middleware
 * which validates req.body, req.query, or req.params.
 */
export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        // Collect all validation error messages gracefully
        const errorMessages = error.issues.map((issue: any) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        
        // Pass a formatted string to AppError which our global error handler catches
        const detailedErrorMessage = errorMessages.map(e => `${e.field}: ${e.message}`).join(', ');
        
        return next(new AppError(`Validation failed - ${detailedErrorMessage}`, 400));
      }
      return next(new AppError("Internal Server Error during validation", 500));
    }
  };
};
