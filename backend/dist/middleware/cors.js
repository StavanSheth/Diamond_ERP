"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = void 0;
const cors_1 = __importDefault(require("cors"));
/**
 * CORS configuration.
 * Allows requests from the Vite dev server (localhost:5173) and any localhost port.
 */
exports.corsMiddleware = (0, cors_1.default)({
    origin: [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time'],
    credentials: true,
});
//# sourceMappingURL=cors.js.map