import dotenv from 'dotenv';
import path from 'path';
import { getDatabasesDir } from '../infrastructure/paths';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3002,
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(getDatabasesDir(), 'Stavan.db')}`,
  corsOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5175',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3002',
      ],
  isProduction: process.env.NODE_ENV === 'production',
  retry: {
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS) || 3,
    baseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 250,
    retryableStatusCodes: [429, 500, 503],
  },
} as const;

/**
 * Validates application configuration.
 * Fails fast in production if security-critical variables are invalid.
 */
export function validateConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const errors: string[] = [];

    const secret = process.env.JWT_SECRET;
    if (secret && secret.length < 32) {
      errors.push('JWT_SECRET must be configured with at least 32 characters in production.');
    }

    if (errors.length > 0) {
      const msg = `[FATAL] Production configuration validation failed:\n` + errors.map((e) => `  - ${e}`).join('\n');
      console.error(msg);
      throw new Error(msg);
    }
  }
}
