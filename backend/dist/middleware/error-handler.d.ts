import { Request, Response, NextFunction } from 'express';
/**
 * Global error handler middleware.
 * Maps known error types to appropriate HTTP status codes.
 */
export declare function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=error-handler.d.ts.map