import cors from 'cors';

/**
 * CORS configuration.
 * Restricts cross-origin requests to configured domains.
 */
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
    ];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Task 23: Strict CORS Policies
    // Allow requests with no origin ONLY in development (like curl), or explicitly allow in production
    if (!origin) {
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error('Strict CORS: Origin missing'));
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Response-Time'],
  credentials: true,
});
