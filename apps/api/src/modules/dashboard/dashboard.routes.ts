import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { authorize } from '../../middleware/authorize';

/**
 * Create dashboard route.
 *
 * GET /api/dashboard — Returns computed KPIs
 */
export function createDashboardRouter(controller: DashboardController): Router {
  const router = Router();
  router.get('/', authorize('dashboard.read'), controller.getDashboard);
  return router;
}
