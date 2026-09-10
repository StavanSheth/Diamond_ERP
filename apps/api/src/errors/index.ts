/**
 * Canonical typed application errors.
 * Replaces message string-matching with explicit error classes.
 */

export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, details);
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends DomainError {
  public readonly currentVersion?: number;
  public readonly clientVersion?: number;

  constructor(message = 'Conflict detected', currentVersion?: number, clientVersion?: number) {
    super(message, 409);
    this.currentVersion = currentVersion;
    this.clientVersion = clientVersion;
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429);
  }
}

export class DatabaseError extends DomainError {
  constructor(message = 'Database operation failed', details?: unknown) {
    super(message, 500, details);
  }
}

/**
 * Thrown when optimistic concurrency control detects a conflict.
 * E.g., two users editing the same transaction simultaneously.
 * Finding 24: Version field must be enforced as true optimistic concurrency control.
 */
export class ConcurrencyConflictError extends DomainError {
  public readonly currentVersion?: number;
  public readonly clientVersion?: number;

  constructor(message = 'Concurrent modification detected. Please reload and try again.', currentVersion?: number, clientVersion?: number) {
    super(message, 409);
    this.currentVersion = currentVersion;
    this.clientVersion = clientVersion;
  }
}

/**
 * Thrown when idempotency key reservation or replay fails.
 * Finding 14-18: Idempotency race conditions and replay semantics.
 */
export class IdempotencyConflictError extends DomainError {
  public readonly idempotencyKey?: string;

  constructor(message = 'Idempotency conflict', idempotencyKey?: string) {
    super(message, 409);
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Thrown when a business rule or invariant is violated.
 * E.g., attempting to sell an already-sold diamond, reversing an unreversible transaction.
 * Finding 22-23: Financial/inventory invariants must be enforced at domain level.
 */
export class BusinessRuleError extends DomainError {
  constructor(message = 'Business rule violation', details?: unknown) {
    super(message, 422, details);
  }
}

/**
 * Thrown when file storage operations fail.
 * Finding 31: Certificate DB/file lifecycle needs explicit error handling.
 */
export class StorageError extends DomainError {
  constructor(message = 'Storage operation failed', details?: unknown) {
    super(message, 500, details);
  }
}

/**
 * Thrown when database is unavailable.
 * Finding 57: Production startup should fail on DB connection failure.
 */
export class DatabaseUnavailableError extends DomainError {
  constructor(message = 'Database is unavailable. Please try again later.') {
    super(message, 503);
  }
}

