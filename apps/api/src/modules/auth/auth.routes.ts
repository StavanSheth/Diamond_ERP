import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';

export function createAuthRouter(): Router {
  const router = Router();

  // Public routes (no authentication required)
  router.post('/login', authController.login);
  router.post('/bootstrap', authController.bootstrap);

  // Protected routes (require authentication)
  router.get('/me', authenticate, authController.me);
  router.post('/change-password', authenticate, authController.changePassword);
  router.post('/logout', authenticate, authController.logout);

  // Admin-only routes
  router.post('/users', authenticate, authorize('user.create'), authController.createUser);

  return router;
}
