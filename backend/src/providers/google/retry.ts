import { config } from '../../config';
import { logger } from '../../logger';

/**
 * Retry error — wraps the original error with retry context.
 */
export class RetryExhaustedError extends Error {
  public readonly originalError: Error;
  public readonly attempts: number;

  constructor(originalError: Error, attempts: number) {
    super(`All ${attempts} retry attempts exhausted: ${originalError.message}`);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
    this.attempts = attempts;
  }
}

/**
 * Check if an error has a retryable HTTP status code.
 */
function isRetryable(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === null) return false;
  return (config.retry.retryableStatusCodes as readonly number[]).includes(statusCode);
}

/**
 * Extract HTTP status code from various error shapes.
 */
function getStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'number') return err.code;
    if (typeof err.status === 'number') return err.status;
    if (typeof err.response === 'object' && err.response !== null) {
      const resp = err.response as Record<string, unknown>;
      if (typeof resp.status === 'number') return resp.status;
    }
  }
  return null;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
export async function withRetry<T>(
  fn: () => Promise<T>,
  requestId: string,
  operationName: string = 'operation',
): Promise<T> {
  const { maxAttempts, baseDelayMs } = config.retry;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      if (!isRetryable(error) || attempt === maxAttempts) {
        if (attempt > 1) {
          logger.error(
            `${operationName} failed after ${attempt} attempts: ${err.message}`,
            requestId,
          );
        }
        throw attempt === maxAttempts && isRetryable(error)
          ? new RetryExhaustedError(err, maxAttempts)
          : err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const statusCode = getStatusCode(error) || 0;

      logger.retry(requestId, attempt, maxAttempts, statusCode);
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Unexpected retry failure');
}
