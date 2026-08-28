import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';

/**
 * Create dashboard route.
 *
 * GET /api/dashboard — Returns computed KPIs
 */
export function createDashboardRouter(controller: DashboardController): Router {
  const router = Router();
  router.get('/', controller.getDashboard);
  return router;
}
