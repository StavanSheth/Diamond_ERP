import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../infrastructure/logging';
import { RequestWithId } from './request-id';
import {
  DomainError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  BusinessRuleError,
  StorageError,
  DatabaseUnavailableError,
} from '../errors';

// Re-export error classes for backward compatibility
export {
  DomainError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  BusinessRuleError,
  StorageError,
  DatabaseUnavailableError,
};

/**
 * Production-hardened global error handler middleware.
 * Maps typed domain errors to HTTP statuses and sanitizes internal details in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as RequestWithId).requestId || 'unknown';

  // 1. Domain Typed Errors
  if (err instanceof DomainError) {
    logger.warn(`[${err.name}] ${err.message} (status ${err.statusCode})`, requestId);
    const body: Record<string, unknown> = {
      success: false,
      error: err.message,
      requestId,
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    if (err instanceof ConflictError) {
      if (err.currentVersion !== undefined) body.currentVersion = err.currentVersion;
      if (err.clientVersion !== undefined) body.clientVersion = err.clientVersion;
    }
    if (err instanceof ConcurrencyConflictError) {
      if (err.currentVersion !== undefined) body.currentVersion = err.currentVersion;
      if (err.clientVersion !== undefined) body.clientVersion = err.clientVersion;
    }
    if (err instanceof IdempotencyConflictError) {
      if (err.idempotencyKey !== undefined) body.idempotencyKey = err.idempotencyKey;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    logger.warn(`Validation failed: ${err.message}`, requestId);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
      requestId,
    });
    return;
  }

  // 3. Prisma Known Request Errors
  const prismaCode = (err as any).code;
  if (typeof prismaCode === 'string') {
    if (prismaCode === 'P2025') {
      logger.warn(`Prisma not found: ${err.message}`, requestId);
      res.status(404).json({
        success: false,
        error: 'The requested resource was not found.',
        requestId,
      });
      return;
    }

    if (prismaCode === 'P2002') {
      const target = (err as any).meta?.target;
      const field = Array.isArray(target) ? target.join(', ') : (target || 'field');
      logger.warn(`Prisma unique constraint violation on ${field}: ${err.message}`, requestId);
      res.status(409).json({
        success: false,
        error: `A record with this ${field} already exists.`,
        requestId,
      });
      return;
    }

    if (prismaCode === 'P2003') {
      logger.warn(`Prisma foreign key constraint violation: ${err.message}`, requestId);
      res.status(400).json({
        success: false,
        error: 'Invalid reference: referenced entity does not exist or has dependent records.',
        requestId,
      });
      return;
    }

    if (prismaCode === 'P2034') {
      logger.warn(`Prisma transaction concurrency conflict: ${err.message}`, requestId);
      res.status(409).json({
        success: false,
        error: 'Concurrent transaction conflict. Please retry the operation.',
        requestId,
      });
      return;
    }
  }

  // 4. CORS Policy Violations
  if (err.message && err.message.startsWith('CORS policy violation')) {
    logger.warn(`CORS rejected: ${err.message}`, requestId);
    res.status(403).json({
      success: false,
      error: err.message,
      requestId,
    });
    return;
  }

  // 5. Unhandled / Internal Server Errors
  logger.error(`Unhandled error: ${err.message}`, requestId, err);

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error.' : err.message,
    requestId,
  });
}
