import { Request, Response, NextFunction } from 'express';
/**
 * Production-grade atomic idempotency middleware for mutating endpoints.
 * Enforces atomic reservation via a PENDING -> SUCCESS/FAILED state machine.
 *
 * Prevents race conditions:
 * - Request A and Request B arrive simultaneously with the same key.
 * - Only ONE can successfully insert the PENDING record due to @@unique([profileId, key]).
 * - The winning request proceeds to execute the business mutation.
 * - The losing request immediately receives 409 Conflict.
 * - Subsequent requests after completion replay the cached response.
 */
export declare function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Middleware factory requiring an explicit Idempotency-Key header on mutating HTTP requests.
 * Finding 14: Financial mutations must require idempotency keys to prevent duplicate posting.
 */
export declare function requireIdempotency(options?: {
    message?: string;
}): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=idempotency.d.ts.map