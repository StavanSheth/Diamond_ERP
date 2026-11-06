"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceContentType = enforceContentType;
/**
 * Strict Content-Type enforcement middleware (Finding 62).
 * Ensures that mutating HTTP requests (POST, PUT, PATCH) with a request body
 * declare an accepted Content-Type (application/json or multipart/form-data).
 * Rejects unexpected media types with 415 Unsupported Media Type.
 */
function enforceContentType(req, res, next) {
    const mutatingMethods = ['POST', 'PUT', 'PATCH'];
    if (!mutatingMethods.includes(req.method)) {
        return next();
    }
    const contentLength = req.headers['content-length'];
    const hasBody = contentLength !== undefined && parseInt(contentLength, 10) > 0;
    const isChunked = req.headers['transfer-encoding'] === 'chunked';
    if (!hasBody && !isChunked) {
        return next();
    }
    // Allow application/json and multipart/form-data
    if (req.is('application/json') || req.is('multipart/form-data')) {
        return next();
    }
    res.status(415).json({
        success: false,
        error: 'Unsupported Media Type',
        message: 'Requests with body payload must declare Content-Type: application/json or multipart/form-data',
    });
}
//# sourceMappingURL=content-type.js.map