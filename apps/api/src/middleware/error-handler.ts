import { Request, Response, NextFunction } from 'express';
import { logger } from '../infrastructure/logging';
import { RequestWithId } from './request-id';

export class ConflictError extends Error {
  constructor(
    message: string,
    public readonly currentVersion?: number,
    public readonly clientVersion?: number
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Global error handler middleware.
 * Maps known error types to appropriate HTTP status codes.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as RequestWithId).requestId || 'unknown';

  // ConflictError → 409
  if (err instanceof ConflictError) {
    logger.warn(`Conflict: ${err.message}`, requestId);
    res.status(409).json({
      success: false,
      error: err.message,
      requestId,
      currentVersion: err.currentVersion,
      clientVersion: err.clientVersion,
    });
    return;
  }

  // NotFoundError → 404
  if (err instanceof NotFoundError) {
    logger.warn(`Not found: ${err.message}`, requestId);
    res.status(404).json({
      success: false,
      error: err.message,
      requestId,
    });
    return;
  }

  // Prisma known error codes (P2025 = record not found, P2002 = unique constraint)
  if ((err as any).code === 'P2025') {
    logger.warn(`Prisma not found: ${err.message}`, requestId);
    res.status(404).json({
      success: false,
      error: 'Record not found.',
      requestId,
    });
    return;
  }

  if ((err as any).code === 'P2002') {
    const target = (err as any).meta?.target || 'field';
    logger.warn(`Prisma unique constraint: ${err.message}`, requestId);
    res.status(409).json({
      success: false,
      error: `A record with this ${target} already exists.`,
      requestId,
    });
    return;
  }

  // Validation errors (message starts with known patterns)
  if (
    err.message.includes('reconciliation failed') ||
    err.message.includes('required') ||
    err.message.includes('not found')
  ) {
    logger.warn(`Validation error: ${err.message}`, requestId);
    res.status(400).json({
      success: false,
      error: err.message,
      requestId,
    });
    return;
  }

  // Unknown errors → 500
  logger.error(`Unhandled error: ${err.message}`, requestId, err);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
    requestId,
  });
}
