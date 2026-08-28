"use strict";
/**
 * Structured logger with request ID context.
 * All log output goes to console with timestamps and structured formatting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function formatTimestamp() {
    return new Date().toISOString();
}
function formatMessage(level, requestId, message) {
    const ts = formatTimestamp();
    const reqPart = requestId ? ` [${requestId}]` : '';
    return `[${ts}]${reqPart} [${level}] ${message}`;
}
exports.logger = {
    info(message, requestId) {
        console.log(formatMessage('INFO', requestId || null, message));
    },
    warn(message, requestId) {
        console.warn(formatMessage('WARN', requestId || null, message));
    },
    error(message, requestId, error) {
        console.error(formatMessage('ERROR', requestId || null, message));
        if (error instanceof Error) {
            console.error(`  Stack: ${error.stack}`);
        }
    },
    debug(message, requestId) {
        console.debug(formatMessage('DEBUG', requestId || null, message));
    },
    /**
     * Log a sync operation with performance timing.
     */
    syncOperation(requestId, operation, metrics) {
        const rowPart = metrics.rowCount !== undefined ? ` | ${metrics.rowCount} rows` : '';
        const msg = `${operation} | Google: ${metrics.googleMs}ms | Total: ${metrics.totalMs}ms${rowPart}`;
        console.log(formatMessage('INFO', requestId, msg));
    },
    /**
     * Log a retry attempt.
     */
    retry(requestId, attempt, maxAttempts, statusCode) {
        const msg = `Retry attempt ${attempt}/${maxAttempts} | Status: ${statusCode}`;
        console.warn(formatMessage('WARN', requestId, msg));
    },
};
//# sourceMappingURL=index.js.map