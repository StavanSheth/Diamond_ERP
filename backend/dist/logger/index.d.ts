/**
 * Structured logger with request ID context.
 * All log output goes to console with timestamps and structured formatting.
 */
export declare const logger: {
    info(message: string, requestId?: string): void;
    warn(message: string, requestId?: string): void;
    error(message: string, requestId?: string, error?: unknown): void;
    debug(message: string, requestId?: string): void;
    /**
     * Log a sync operation with performance timing.
     */
    syncOperation(requestId: string, operation: string, metrics: {
        googleMs: number;
        totalMs: number;
        rowCount?: number;
    }): void;
    /**
     * Log a retry attempt.
     */
    retry(requestId: string, attempt: number, maxAttempts: number, statusCode: number): void;
};
//# sourceMappingURL=index.d.ts.map