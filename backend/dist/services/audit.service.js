"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
class AuditService {
    async logEvent(params) {
        return prisma_1.default.auditEvent.create({
            data: {
                entityType: params.entityType,
                entityId: params.entityId,
                eventType: params.eventType,
                description: params.description,
                metadata: params.metadata ? JSON.stringify(params.metadata) : null,
                performedBy: params.performedBy,
                ipAddress: params.ipAddress,
                deviceId: params.deviceId,
                sessionId: params.sessionId,
            },
        });
    }
    async getAuditTrail(entityType, entityId) {
        return prisma_1.default.auditEvent.findMany({
            where: { entityType, entityId },
            orderBy: { performedAt: 'desc' },
        });
    }
}
exports.AuditService = AuditService;
exports.auditService = new AuditService();
//# sourceMappingURL=audit.service.js.map