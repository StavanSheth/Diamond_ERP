import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { RequestWithId } from './request-id';

/**
 * Middleware that logs request start/end and adds timing to response headers.
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  const requestId = (req as RequestWithId).requestId || 'unknown';

  logger.info(`→ ${req.method} ${req.path}`, requestId);

  res.setHeader('X-Request-ID', requestId);

  // Hook into response finish to log timing
  res.on('finish', () => {
    const duration = Math.round(performance.now() - start);
    logger.info(`← ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`, requestId);
  });

  next();
}
