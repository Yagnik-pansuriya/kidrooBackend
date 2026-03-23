import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import AppError from "../utils/appError";


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
        const errorMessages = error.issues.map((issue: any) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        
        const detailedErrorMessage = errorMessages.map(e => `${e.field}: ${e.message}`).join(', ');
        
        return next(new AppError(`Validation failed - ${detailedErrorMessage}`, 400));
      }
      return next(new AppError("Internal Server Error during validation", 500));
    }
  };
};
