import cors from 'cors';
import { config } from '../config';

/**
 * Production-hardened CORS middleware.
 * - Enforces explicit origins for browser clients.
 * - Allows non-browser / internal desktop clients (e.g. WebView2 standalone launcher) where Origin is absent.
 * - Allows all required ERP headers (X-Profile-Id, Idempotency-Key, X-Bootstrap-Secret, X-Request-ID).
 */
const allowedOrigins = config.corsOrigins;

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Non-browser or desktop requests (like WebView2 local app, curl, server-to-server) do not provide an Origin header
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
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
