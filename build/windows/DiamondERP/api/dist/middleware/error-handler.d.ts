import { Request, Response, NextFunction } from 'express';
import { DomainError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError, DatabaseError, ConcurrencyConflictError, IdempotencyConflictError, BusinessRuleError, StorageError, DatabaseUnavailableError } from '../errors';
export { DomainError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError, DatabaseError, ConcurrencyConflictError, IdempotencyConflictError, BusinessRuleError, StorageError, DatabaseUnavailableError, };
/**
 * Production-hardened global error handler middleware.
 * Maps typed domain errors to HTTP statuses and sanitizes internal details in production.
 */
export declare function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=error-handler.d.ts.map