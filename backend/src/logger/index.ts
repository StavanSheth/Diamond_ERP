/**
 * Structured logger with request ID context.
 * All log output goes to console with timestamps and structured formatting.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, requestId: string | null, message: string): string {
  const ts = formatTimestamp();
  const reqPart = requestId ? ` [${requestId}]` : '';
  return `[${ts}]${reqPart} [${level}] ${message}`;
}

export const logger = {
  info(message: string, requestId?: string): void {
    console.log(formatMessage('INFO', requestId || null, message));
  },

  warn(message: string, requestId?: string): void {
    console.warn(formatMessage('WARN', requestId || null, message));
  },

  error(message: string, requestId?: string, error?: unknown): void {
    console.error(formatMessage('ERROR', requestId || null, message));
    if (error instanceof Error) {
      console.error(`  Stack: ${error.stack}`);
    }
  },

  debug(message: string, requestId?: string): void {
    console.debug(formatMessage('DEBUG', requestId || null, message));
  },

  /**
   * Log a sync operation with performance timing.
   */
  syncOperation(
    requestId: string,
    operation: string,
    metrics: { googleMs: number; totalMs: number; rowCount?: number },
  ): void {
    const rowPart = metrics.rowCount !== undefined ? ` | ${metrics.rowCount} rows` : '';
    const msg = `${operation} | Google: ${metrics.googleMs}ms | Total: ${metrics.totalMs}ms${rowPart}`;
    console.log(formatMessage('INFO', requestId, msg));
  },

  /**
   * Log a retry attempt.
   */
  retry(requestId: string, attempt: number, maxAttempts: number, statusCode: number): void {
    const msg = `Retry attempt ${attempt}/${maxAttempts} | Status: ${statusCode}`;
    console.warn(formatMessage('WARN', requestId, msg));
  },
};
