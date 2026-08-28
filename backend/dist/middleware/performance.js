"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceMiddleware = performanceMiddleware;
const logger_1 = require("../logger");
/**
 * Middleware that logs request start/end and adds timing to response headers.
 */
function performanceMiddleware(req, res, next) {
    const start = performance.now();
    const requestId = req.requestId || 'unknown';
    logger_1.logger.info(`→ ${req.method} ${req.path}`, requestId);
    res.setHeader('X-Request-ID', requestId);
    // Hook into response finish to log timing
    res.on('finish', () => {
        const duration = Math.round(performance.now() - start);
        logger_1.logger.info(`← ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`, requestId);
    });
    next();
}
//# sourceMappingURL=performance.js.map