import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

/**
 * Create health route.
 *
 * GET /health — Returns application health status
 */
export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.getHealth);
  return router;
}
