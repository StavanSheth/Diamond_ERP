import { Request, Response } from 'express';
import { systemPrisma, getAllProfiles } from '../../infrastructure/database/prisma';
import { RequestWithId } from '../../middleware/request-id';

export class HealthController {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * GET /health — Returns backend and database status.
   */
  getHealth = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req as RequestWithId).requestId;
    const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);

    try {
      await systemPrisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        backend: 'OK',
        database: 'Connected',
        status: 'ok',
        uptime: uptimeSeconds,
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        backend: 'OK',
        database: 'Disconnected',
        status: 'error',
        error: err?.message || 'Database unreachable',
        uptime: uptimeSeconds,
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /liveness — Kubernetes / Docker container liveness probe.
   * Confirms the Node process is responsive.
   */
  getLiveness = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'ok',
      probe: 'liveness',
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * GET /readiness — Kubernetes / orchestrator readiness probe.
   * Verifies database connectivity and profile configuration before accepting traffic.
   */
  getReadiness = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req as RequestWithId).requestId;
    try {
      // 1. Verify database is reachable
      await systemPrisma.$queryRaw`SELECT 1`;

      // 2. Verify profiles are configured
      const profiles = getAllProfiles();
      if (profiles.length === 0) {
        throw new Error('No canonical profiles configured');
      }

      res.status(200).json({
        status: 'ready',
        probe: 'readiness',
        configuredProfiles: profiles,
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'not_ready',
        probe: 'readiness',
        error: err?.message || 'System dependencies not ready',
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  };
}
