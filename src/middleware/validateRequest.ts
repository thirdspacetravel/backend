import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const validationError = new Error(
          error.issues.map(e => e.message).join(', ')
        );
        
        (validationError as any).statusCode = 400;
        return next(validationError);
      }
      next(error);
    }
  };
}
