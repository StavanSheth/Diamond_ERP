"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const logger_1 = require("../logger");
/**
 * SyncService — wraps repository calls with performance measurement,
 * structured logging, and API response formatting.
 *
 * Every operation is timed at three levels:
 * - requestTime: time before calling Google API
 * - googleApiTime: time spent in Google API calls
 * - processingTime: time after Google API returns
 */
class SyncService {
    constructor(repository) {
        this.repository = repository;
    }
    async getAll(requestId) {
        return this.executeWithMetrics(requestId, 'GET stocks', () => this.repository.getAll(requestId));
    }
    async create(data, requestId) {
        return this.executeWithMetrics(requestId, 'POST stock', () => this.repository.create(data, requestId));
    }
    async update(id, data, requestId) {
        return this.executeWithMetrics(requestId, `PUT stock/${id}`, () => this.repository.update(id, data, requestId));
    }
    async delete(id, requestId) {
        return this.executeWithMetrics(requestId, `DELETE stock/${id}`, () => this.repository.delete(id, requestId));
    }
    /**
     * Execute a repository operation with full performance measurement.
     */
    async executeWithMetrics(requestId, operationName, operation) {
        const totalStart = performance.now();
        const requestStart = performance.now();
        let googleApiTime = 0;
        let rows = [];
        try {
            const googleStart = performance.now();
            rows = await operation();
            googleApiTime = Math.round(performance.now() - googleStart);
        }
        catch (error) {
            const totalTime = Math.round(performance.now() - totalStart);
            logger_1.logger.error(`${operationName} | FAILED | Total: ${totalTime}ms`, requestId, error);
            throw error;
        }
        const requestTime = Math.round(performance.now() - requestStart - googleApiTime);
        const processingTime = Math.round(performance.now() - totalStart - googleApiTime);
        const totalTime = Math.round(performance.now() - totalStart);
        const metrics = {
            requestTimeMs: requestTime > 0 ? requestTime : 0,
            googleApiTimeMs: googleApiTime,
            processingTimeMs: processingTime > 0 ? processingTime : 0,
            totalTimeMs: totalTime,
        };
        logger_1.logger.syncOperation(requestId, operationName, {
            googleMs: googleApiTime,
            totalMs: totalTime,
            rowCount: rows.length,
        });
        const now = new Date().toISOString();
        return {
            success: true,
            data: rows,
            syncStatus: 'success',
            googleLatency: googleApiTime,
            lastSyncedAt: now,
            requestId,
            performance: metrics,
        };
    }
}
exports.SyncService = SyncService;
//# sourceMappingURL=sync.service.js.map