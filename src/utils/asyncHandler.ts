import { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  (fn: RequestHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

//IN EVERY ROUTES USE THIS ASYNC HANDLER TO CATCH ALL THE ERRORS IN ASYNC FUNCTIONS AND PASS IT TO GLOBAL ERROR HANDLER
