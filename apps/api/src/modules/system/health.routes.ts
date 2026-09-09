import { Router } from 'express';
import { HealthController } from './health.controller';

/**
 * Health and observability routes.
 *
 * GET /health — Comprehensive health report
 * GET /health/liveness — Fast liveness probe
 * GET /health/readiness — Dependency readiness check
 */
export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.getHealth);
  router.get('/liveness', controller.getLiveness);
  router.get('/readiness', controller.getReadiness);
  return router;
}
