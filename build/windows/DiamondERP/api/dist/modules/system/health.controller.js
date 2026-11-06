"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const prisma_1 = require("../../infrastructure/database/prisma");
class HealthController {
    constructor() {
        /**
         * GET /health — Returns backend and database status.
         */
        this.getHealth = async (req, res) => {
            const requestId = req.requestId;
            const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);
            try {
                await prisma_1.systemPrisma.$queryRaw `SELECT 1`;
                res.status(200).json({
                    backend: 'OK',
                    database: 'Connected',
                    status: 'ok',
                    uptime: uptimeSeconds,
                    requestId,
                    timestamp: new Date().toISOString(),
                });
            }
            catch (err) {
                const sanitizedError = process.env.NODE_ENV === 'production' ? 'Database unreachable' : (err?.message || 'Database unreachable');
                res.status(503).json({
                    backend: 'OK',
                    database: 'Disconnected',
                    status: 'error',
                    error: sanitizedError,
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
        this.getLiveness = async (_req, res) => {
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
        this.getReadiness = async (req, res) => {
            const requestId = req.requestId;
            try {
                // 1. Verify database is reachable
                await prisma_1.systemPrisma.$queryRaw `SELECT 1`;
                // 2. Verify profiles are configured
                const profiles = (0, prisma_1.getAllProfiles)();
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
            }
            catch (err) {
                res.status(503).json({
                    status: 'not_ready',
                    probe: 'readiness',
                    error: err?.message || 'System dependencies not ready',
                    requestId,
                    timestamp: new Date().toISOString(),
                });
            }
        };
        this.startTime = Date.now();
    }
}
exports.HealthController = HealthController;
//# sourceMappingURL=health.controller.js.map