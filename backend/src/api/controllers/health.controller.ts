import { Request, Response } from 'express';
import { GoogleSheetProvider } from '../../providers/google/provider';
import { RequestWithId } from '../../middleware/request-id';
import { HealthResponse } from '../../dto/api-response.dto';

/**
 * HealthController — provides application health status.
 */
export class HealthController {
  private startTime: number;

  constructor(private readonly provider: GoogleSheetProvider) {
    this.startTime = Date.now();
  }

  /**
   * GET /health — Returns backend, Google, and sheet connectivity status.
   */
  getHealth = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req as RequestWithId).requestId;

    try {
      const health = await this.provider.healthCheck();
      const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);

      const response: HealthResponse = {
        backend: 'OK',
        google: health.connected ? 'Connected' : 'Disconnected',
        sheet: health.reachable ? 'Reachable' : 'Unreachable',
        lastSync: this.provider.getLastSyncTime(),
        uptime: uptimeSeconds,
        requestId,
      };

      const statusCode = health.connected && health.reachable ? 200 : 503;
      res.status(statusCode).json(response);
    } catch {
      const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);

      const response: HealthResponse = {
        backend: 'OK',
        google: 'Disconnected',
        sheet: 'Unreachable',
        lastSync: this.provider.getLastSyncTime(),
        uptime: uptimeSeconds,
        requestId,
      };

      res.status(503).json(response);
    }
  };
}
