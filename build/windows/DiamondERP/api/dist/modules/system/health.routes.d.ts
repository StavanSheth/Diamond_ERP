import { Router } from 'express';
import { HealthController } from './health.controller';
/**
 * Health and observability routes.
 *
 * GET /health — Comprehensive health report
 * GET /health/liveness — Fast liveness probe
 * GET /health/readiness — Dependency readiness check
 */
export declare function createHealthRouter(controller: HealthController): Router;
//# sourceMappingURL=health.routes.d.ts.map