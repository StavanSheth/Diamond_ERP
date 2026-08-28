import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3001,
  pollingInterval: Number(process.env.POLLING_INTERVAL) || 3000,

  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    worksheetName: process.env.WORKSHEET_NAME || 'Stock_Master',
  },

  retry: {
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS) || 3,
    baseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 250,
    retryableStatusCodes: [429, 500, 503],
  },
} as const;

/**
 * Validates that all required environment variables are present.
 * Call this on startup before initializing providers.
 */
export function validateConfig(): void {
  const required: Array<{ key: string; value: string }> = [
    { key: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', value: config.google.serviceAccountEmail },
    { key: 'GOOGLE_PRIVATE_KEY', value: config.google.privateKey },
    { key: 'GOOGLE_SHEET_ID', value: config.google.sheetId },
  ];

  const missing = required.filter((r) => !r.value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map((m) => m.key).join(', ')}. ` +
        `Copy .env.example to .env and fill in the values.`,
    );
  }
}
