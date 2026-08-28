import { Request, Response } from 'express';
import { GoogleSheetProvider } from '../../providers/google/provider';
/**
 * HealthController — provides application health status.
 */
export declare class HealthController {
    private readonly provider;
    private startTime;
    constructor(provider: GoogleSheetProvider);
    /**
     * GET /health — Returns backend, Google, and sheet connectivity status.
     */
    getHealth: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=health.controller.d.ts.map