import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3002,
  databaseUrl: process.env.DATABASE_URL || 'file:../Stavan.db',
  retry: {
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS) || 3,
    baseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 250,
    retryableStatusCodes: [429, 500, 503],
  },
} as const;

/**
 * Validates basic application configuration.
 */
export function validateConfig(): void {
  // No external mandatory cloud keys needed for local SQLite operation
}
