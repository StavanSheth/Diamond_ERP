/**
 * Canonical typed application errors.
 * Replaces message string-matching with explicit error classes.
 */
export declare class DomainError extends Error {
    readonly statusCode: number;
    readonly details?: unknown;
    constructor(message: string, statusCode?: number, details?: unknown);
}
export declare class ValidationError extends DomainError {
    constructor(message?: string, details?: unknown);
}
export declare class AuthenticationError extends DomainError {
    constructor(message?: string);
}
export declare class AuthorizationError extends DomainError {
    constructor(message?: string);
}
export declare class NotFoundError extends DomainError {
    constructor(message?: string);
}
export declare class ConflictError extends DomainError {
    readonly currentVersion?: number;
    readonly clientVersion?: number;
    constructor(message?: string, currentVersion?: number, clientVersion?: number);
}
export declare class RateLimitError extends DomainError {
    constructor(message?: string);
}
export declare class DatabaseError extends DomainError {
    constructor(message?: string, details?: unknown);
}
/**
 * Thrown when optimistic concurrency control detects a conflict.
 * E.g., two users editing the same transaction simultaneously.
 * Finding 24: Version field must be enforced as true optimistic concurrency control.
 */
export declare class ConcurrencyConflictError extends DomainError {
    readonly currentVersion?: number;
    readonly clientVersion?: number;
    constructor(message?: string, currentVersion?: number, clientVersion?: number);
}
/**
 * Thrown when idempotency key reservation or replay fails.
 * Finding 14-18: Idempotency race conditions and replay semantics.
 */
export declare class IdempotencyConflictError extends DomainError {
    readonly idempotencyKey?: string;
    constructor(message?: string, idempotencyKey?: string);
}
/**
 * Thrown when a business rule or invariant is violated.
 * E.g., attempting to sell an already-sold diamond, reversing an unreversible transaction.
 * Finding 22-23: Financial/inventory invariants must be enforced at domain level.
 */
export declare class BusinessRuleError extends DomainError {
    constructor(message?: string, details?: unknown);
}
/**
 * Thrown when file storage operations fail.
 * Finding 31: Certificate DB/file lifecycle needs explicit error handling.
 */
export declare class StorageError extends DomainError {
    constructor(message?: string, details?: unknown);
}
/**
 * Thrown when database is unavailable.
 * Finding 57: Production startup should fail on DB connection failure.
 */
export declare class DatabaseUnavailableError extends DomainError {
    constructor(message?: string);
}
//# sourceMappingURL=index.d.ts.map