import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../infrastructure/logging';

export const validateRequest = (schema: ZodSchema<any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        const zodErrors = (error as any).errors || [];
        logger.warn(`Validation failed: ${zodErrors.map((e: any) => e.message).join(', ')}`);
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: zodErrors.map((e: any) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return next(error);
    }
  };
};
