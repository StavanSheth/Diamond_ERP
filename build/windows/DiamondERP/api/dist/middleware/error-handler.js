"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseUnavailableError = exports.StorageError = exports.BusinessRuleError = exports.IdempotencyConflictError = exports.ConcurrencyConflictError = exports.DatabaseError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.DomainError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const logging_1 = require("../infrastructure/logging");
const errors_1 = require("../errors");
Object.defineProperty(exports, "DomainError", { enumerable: true, get: function () { return errors_1.DomainError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return errors_1.AuthenticationError; } });
Object.defineProperty(exports, "AuthorizationError", { enumerable: true, get: function () { return errors_1.AuthorizationError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return errors_1.NotFoundError; } });
Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function () { return errors_1.ConflictError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_1.RateLimitError; } });
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return errors_1.DatabaseError; } });
Object.defineProperty(exports, "ConcurrencyConflictError", { enumerable: true, get: function () { return errors_1.ConcurrencyConflictError; } });
Object.defineProperty(exports, "IdempotencyConflictError", { enumerable: true, get: function () { return errors_1.IdempotencyConflictError; } });
Object.defineProperty(exports, "BusinessRuleError", { enumerable: true, get: function () { return errors_1.BusinessRuleError; } });
Object.defineProperty(exports, "StorageError", { enumerable: true, get: function () { return errors_1.StorageError; } });
Object.defineProperty(exports, "DatabaseUnavailableError", { enumerable: true, get: function () { return errors_1.DatabaseUnavailableError; } });
/**
 * Production-hardened global error handler middleware.
 * Maps typed domain errors to HTTP statuses and sanitizes internal details in production.
 */
function errorHandler(err, req, res, _next) {
    const requestId = req.requestId || 'unknown';
    // 1. Domain Typed Errors
    if (err instanceof errors_1.DomainError) {
        logging_1.logger.warn(`[${err.name}] ${err.message} (status ${err.statusCode})`, requestId);
        const body = {
            success: false,
            error: err.message,
            requestId,
        };
        if (err.details !== undefined) {
            body.details = err.details;
        }
        if (err instanceof errors_1.ConflictError) {
            if (err.currentVersion !== undefined)
                body.currentVersion = err.currentVersion;
            if (err.clientVersion !== undefined)
                body.clientVersion = err.clientVersion;
        }
        if (err instanceof errors_1.ConcurrencyConflictError) {
            if (err.currentVersion !== undefined)
                body.currentVersion = err.currentVersion;
            if (err.clientVersion !== undefined)
                body.clientVersion = err.clientVersion;
        }
        if (err instanceof errors_1.IdempotencyConflictError) {
            if (err.idempotencyKey !== undefined)
                body.idempotencyKey = err.idempotencyKey;
        }
        res.status(err.statusCode).json(body);
        return;
    }
    // 2. Zod Validation Errors
    if (err instanceof zod_1.ZodError) {
        logging_1.logger.warn(`Validation failed: ${err.message}`, requestId);
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: err.flatten().fieldErrors,
            requestId,
        });
        return;
    }
    // 3. Prisma Known Request Errors
    const prismaCode = err.code;
    if (typeof prismaCode === 'string') {
        if (prismaCode === 'P2025') {
            logging_1.logger.warn(`Prisma not found: ${err.message}`, requestId);
            res.status(404).json({
                success: false,
                error: 'The requested resource was not found.',
                requestId,
            });
            return;
        }
        if (prismaCode === 'P2002') {
            const target = err.meta?.target;
            const field = Array.isArray(target) ? target.join(', ') : (target || 'field');
            logging_1.logger.warn(`Prisma unique constraint violation on ${field}: ${err.message}`, requestId);
            res.status(409).json({
                success: false,
                error: `A record with this ${field} already exists.`,
                requestId,
            });
            return;
        }
        if (prismaCode === 'P2003') {
            logging_1.logger.warn(`Prisma foreign key constraint violation: ${err.message}`, requestId);
            res.status(400).json({
                success: false,
                error: 'Invalid reference: referenced entity does not exist or has dependent records.',
                requestId,
            });
            return;
        }
        if (prismaCode === 'P2034') {
            logging_1.logger.warn(`Prisma transaction concurrency conflict: ${err.message}`, requestId);
            res.status(409).json({
                success: false,
                error: 'Concurrent transaction conflict. Please retry the operation.',
                requestId,
            });
            return;
        }
    }
    // 4. CORS Policy Violations
    if (err.message && err.message.startsWith('CORS policy violation')) {
        logging_1.logger.warn(`CORS rejected: ${err.message}`, requestId);
        res.status(403).json({
            success: false,
            error: err.message,
            requestId,
        });
        return;
    }
    // 5. Unhandled / Internal Server Errors
    logging_1.logger.error(`Unhandled error: ${err.message}`, requestId, err);
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
        success: false,
        error: isProduction ? 'Internal server error.' : err.message,
        requestId,
    });
}
//# sourceMappingURL=error-handler.js.map