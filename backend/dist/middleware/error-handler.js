"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../logger");
const provider_1 = require("../providers/google/provider");
const retry_1 = require("../providers/google/retry");
/**
 * Global error handler middleware.
 * Maps known error types to appropriate HTTP status codes.
 */
function errorHandler(err, req, res, _next) {
    const requestId = req.requestId || 'unknown';
    // ConflictError → 409
    if (err instanceof provider_1.ConflictError) {
        logger_1.logger.warn(`Conflict: ${err.message}`, requestId);
        res.status(409).json({
            success: false,
            error: err.message,
            syncStatus: 'error',
            requestId,
            currentVersion: err.currentVersion,
            clientVersion: err.clientVersion,
        });
        return;
    }
    // RowNotFoundError → 404
    if (err instanceof provider_1.RowNotFoundError) {
        logger_1.logger.warn(`Not found: ${err.message}`, requestId);
        res.status(404).json({
            success: false,
            error: err.message,
            syncStatus: 'error',
            requestId,
        });
        return;
    }
    // RetryExhaustedError → 503
    if (err instanceof retry_1.RetryExhaustedError) {
        logger_1.logger.error(`Retries exhausted: ${err.message}`, requestId, err);
        res.status(503).json({
            success: false,
            error: 'Google Sheets API is temporarily unavailable. Please try again later.',
            syncStatus: 'error',
            requestId,
        });
        return;
    }
    // Unknown errors → 500
    logger_1.logger.error(`Unhandled error: ${err.message}`, requestId, err);
    res.status(500).json({
        success: false,
        error: 'Internal server error.',
        syncStatus: 'error',
        requestId,
    });
}
//# sourceMappingURL=error-handler.js.map