"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = void 0;
const cors_1 = __importDefault(require("cors"));
const config_1 = require("../config");
/**
 * Production-hardened CORS middleware.
 * - Enforces explicit origins for browser clients.
 * - Allows non-browser / internal desktop clients (e.g. WebView2 standalone launcher) where Origin is absent.
 * - Allows all required ERP headers (X-Profile-Id, Idempotency-Key, X-Bootstrap-Secret, X-Request-ID).
 */
const allowedOrigins = config_1.config.corsOrigins;
exports.corsMiddleware = (0, cors_1.default)({
    origin: (origin, callback) => {
        // Non-browser or desktop requests (like WebView2 local app, curl, server-to-server) do not provide an Origin header
        if (!origin) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin) ||
            (!config_1.config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
            return callback(null, true);
        }
        callback(new Error(`CORS policy violation: Origin "${origin}" is not authorized.`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Profile-Id',
        'Idempotency-Key',
        'X-Bootstrap-Secret',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time'],
    credentials: true,
    maxAge: 86400, // 24 hour preflight cache
});
//# sourceMappingURL=cors.js.map