"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
/**
 * HealthController — provides application health status.
 */
class HealthController {
    constructor(provider) {
        this.provider = provider;
        /**
         * GET /health — Returns backend, Google, and sheet connectivity status.
         */
        this.getHealth = async (req, res) => {
            const requestId = req.requestId;
            try {
                const health = await this.provider.healthCheck();
                const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);
                const response = {
                    backend: 'OK',
                    google: health.connected ? 'Connected' : 'Disconnected',
                    sheet: health.reachable ? 'Reachable' : 'Unreachable',
                    lastSync: this.provider.getLastSyncTime(),
                    uptime: uptimeSeconds,
                    requestId,
                };
                const statusCode = health.connected && health.reachable ? 200 : 503;
                res.status(statusCode).json(response);
            }
            catch {
                const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);
                const response = {
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
        this.startTime = Date.now();
    }
}
exports.HealthController = HealthController;
//# sourceMappingURL=health.controller.js.map