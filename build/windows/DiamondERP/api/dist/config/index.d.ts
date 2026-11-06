export declare const config: {
    readonly port: number;
    readonly host: string;
    readonly databaseUrl: string;
    readonly corsOrigins: string[];
    readonly isProduction: boolean;
    readonly retry: {
        readonly maxAttempts: number;
        readonly baseDelayMs: number;
        readonly retryableStatusCodes: readonly [429, 500, 503];
    };
};
/**
 * Validates application configuration.
 * Fails fast in production if security-critical variables are invalid.
 */
export declare function validateConfig(): void;
//# sourceMappingURL=index.d.ts.map