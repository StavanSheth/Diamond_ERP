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
