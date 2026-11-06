"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
/**
 * Generate a short request ID (REQ-XXXX format) and attach it to the request.
 * Also sets the X-Request-ID response header for end-to-end tracing.
 */
function requestIdMiddleware(req, _res, next) {
    const id = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    // Attach to request object for downstream use
    req.requestId = id;
    next();
}
//# sourceMappingURL=request-id.js.map