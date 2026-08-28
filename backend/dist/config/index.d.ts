export declare const config: {
    readonly port: number;
    readonly pollingInterval: number;
    readonly google: {
        readonly serviceAccountEmail: string;
        readonly privateKey: string;
        readonly sheetId: string;
        readonly worksheetName: string;
    };
    readonly retry: {
        readonly maxAttempts: number;
        readonly baseDelayMs: number;
        readonly retryableStatusCodes: readonly [429, 500, 503];
    };
};
/**
 * Validates that all required environment variables are present.
 * Call this on startup before initializing providers.
 */
export declare function validateConfig(): void;
//# sourceMappingURL=index.d.ts.map