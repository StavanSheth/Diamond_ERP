"use strict";
/**
 * Canonical typed application errors.
 * Replaces message string-matching with explicit error classes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseUnavailableError = exports.StorageError = exports.BusinessRuleError = exports.IdempotencyConflictError = exports.ConcurrencyConflictError = exports.DatabaseError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.DomainError = void 0;
class DomainError extends Error {
    constructor(message, statusCode = 400, details) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.DomainError = DomainError;
class ValidationError extends DomainError {
    constructor(message = 'Validation failed', details) {
        super(message, 400, details);
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends DomainError {
    constructor(message = 'Authentication required') {
        super(message, 401);
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends DomainError {
    constructor(message = 'Access denied') {
        super(message, 403);
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends DomainError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends DomainError {
    constructor(message = 'Conflict detected', currentVersion, clientVersion) {
        super(message, 409);
        this.currentVersion = currentVersion;
        this.clientVersion = clientVersion;
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends DomainError {
    constructor(message = 'Too many requests. Please try again later.') {
        super(message, 429);
    }
}
exports.RateLimitError = RateLimitError;
class DatabaseError extends DomainError {
    constructor(message = 'Database operation failed', details) {
        super(message, 500, details);
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Thrown when optimistic concurrency control detects a conflict.
 * E.g., two users editing the same transaction simultaneously.
 * Finding 24: Version field must be enforced as true optimistic concurrency control.
 */
class ConcurrencyConflictError extends DomainError {
    constructor(message = 'Concurrent modification detected. Please reload and try again.', currentVersion, clientVersion) {
        super(message, 409);
        this.currentVersion = currentVersion;
        this.clientVersion = clientVersion;
    }
}
exports.ConcurrencyConflictError = ConcurrencyConflictError;
/**
 * Thrown when idempotency key reservation or replay fails.
 * Finding 14-18: Idempotency race conditions and replay semantics.
 */
class IdempotencyConflictError extends DomainError {
    constructor(message = 'Idempotency conflict', idempotencyKey) {
        super(message, 409);
        this.idempotencyKey = idempotencyKey;
    }
}
exports.IdempotencyConflictError = IdempotencyConflictError;
/**
 * Thrown when a business rule or invariant is violated.
 * E.g., attempting to sell an already-sold diamond, reversing an unreversible transaction.
 * Finding 22-23: Financial/inventory invariants must be enforced at domain level.
 */
class BusinessRuleError extends DomainError {
    constructor(message = 'Business rule violation', details) {
        super(message, 422, details);
    }
}
exports.BusinessRuleError = BusinessRuleError;
/**
 * Thrown when file storage operations fail.
 * Finding 31: Certificate DB/file lifecycle needs explicit error handling.
 */
class StorageError extends DomainError {
    constructor(message = 'Storage operation failed', details) {
        super(message, 500, details);
    }
}
exports.StorageError = StorageError;
/**
 * Thrown when database is unavailable.
 * Finding 57: Production startup should fail on DB connection failure.
 */
class DatabaseUnavailableError extends DomainError {
    constructor(message = 'Database is unavailable. Please try again later.') {
        super(message, 503);
    }
}
exports.DatabaseUnavailableError = DatabaseUnavailableError;
//# sourceMappingURL=index.js.map