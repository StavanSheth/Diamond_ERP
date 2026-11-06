import { Request, Response } from 'express';
export declare class HealthController {
    private startTime;
    constructor();
    /**
     * GET /health — Returns backend and database status.
     */
    getHealth: (req: Request, res: Response) => Promise<void>;
    /**
     * GET /liveness — Kubernetes / Docker container liveness probe.
     * Confirms the Node process is responsive.
     */
    getLiveness: (_req: Request, res: Response) => Promise<void>;
    /**
     * GET /readiness — Kubernetes / orchestrator readiness probe.
     * Verifies database connectivity and profile configuration before accepting traffic.
     */
    getReadiness: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=health.controller.d.ts.map