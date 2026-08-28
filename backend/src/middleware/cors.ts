import cors from 'cors';

/**
 * CORS configuration.
 * Allows requests from the Vite dev server (localhost:5173) and any localhost port.
 */
export const corsMiddleware = cors({
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
