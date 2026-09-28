import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

export function createAuthRouter(): Router {
  const router = Router();

  // Layered rate limiters for public authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30, // 30 attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again later.' },
  });

  const bootstrapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many bootstrap attempts. Access temporarily suspended.' },
  });

  // Public routes (rate limited)
  router.post('/login', authLimiter, authController.login);
  router.post('/bootstrap', bootstrapLimiter, authController.bootstrap);

  // Protected routes (require authentication)
  router.get('/me', authenticate, authController.me);
  router.post('/change-password', authenticate, authController.changePassword);
  router.post('/logout', authenticate, authController.logout);

  // User lifecycle routes
  router.post('/users', authenticate, authController.createUser);
  router.post('/users/:userId/deactivate', authenticate, authController.deactivateUser);
  router.delete('/users/:userId', authenticate, authController.deactivateUser);
  router.post('/users/:userId/reactivate', authenticate, authController.reactivateUser);

  return router;
}
