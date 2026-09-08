import { Request, Response } from 'express';
import prisma from '../../infrastructure/database/prisma';
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
      await prisma.$queryRaw`SELECT 1`;
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
}
