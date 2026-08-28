/**
 * Retry error — wraps the original error with retry context.
 */
export declare class RetryExhaustedError extends Error {
    readonly originalError: Error;
    readonly attempts: number;
    constructor(originalError: Error, attempts: number);
}
/**
 * Execute a function with exponential backoff retry.
 *
 * Retry flow:
 *   Attempt 1 → fail (429/500/503) → wait 250ms
 *   Attempt 2 → fail (429/500/503) → wait 500ms
 *   Attempt 3 → fail (429/500/503) → wait 1000ms
 *   FAIL → throw RetryExhaustedError
 *
 * Non-retryable errors (400, 401, 403, 404, etc.) are thrown immediately.
 */
export declare function withRetry<T>(fn: () => Promise<T>, requestId: string, operationName?: string): Promise<T>;
//# sourceMappingURL=retry.d.ts.map