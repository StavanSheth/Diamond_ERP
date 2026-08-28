import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { RequestWithId } from './request-id';
import { ConflictError, RowNotFoundError } from '../providers/google/provider';
import { RetryExhaustedError } from '../providers/google/retry';

/**
 * Global error handler middleware.
 * Maps known error types to appropriate HTTP status codes.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as RequestWithId).requestId || 'unknown';

  // ConflictError → 409
  if (err instanceof ConflictError) {
    logger.warn(`Conflict: ${err.message}`, requestId);
    res.status(409).json({
      success: false,
      error: err.message,
      syncStatus: 'error',
      requestId,
      currentVersion: err.currentVersion,
      clientVersion: err.clientVersion,
    });
    return;
  }

  // RowNotFoundError → 404
  if (err instanceof RowNotFoundError) {
    logger.warn(`Not found: ${err.message}`, requestId);
    res.status(404).json({
      success: false,
      error: err.message,
      syncStatus: 'error',
      requestId,
    });
    return;
  }

  // RetryExhaustedError → 503
  if (err instanceof RetryExhaustedError) {
    logger.error(`Retries exhausted: ${err.message}`, requestId, err);
    res.status(503).json({
      success: false,
      error: 'Google Sheets API is temporarily unavailable. Please try again later.',
      syncStatus: 'error',
      requestId,
    });
    return;
  }

  // Unknown errors → 500
  logger.error(`Unhandled error: ${err.message}`, requestId, err);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
    syncStatus: 'error',
    requestId,
  });
}
