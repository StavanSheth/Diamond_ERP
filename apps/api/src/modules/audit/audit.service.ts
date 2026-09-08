import prisma from '../../infrastructure/database/prisma';

interface LogEventParams {
  entityType: string;
  entityId: string;
  eventType: string;
  description?: string;
  metadata?: Record<string, unknown>;
  performedBy: string;
  ipAddress?: string;
  deviceId?: string;
  sessionId?: string;
}

class AuditService {
  async logEvent(params: LogEventParams) {
    return prisma.auditEvent.create({
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

  async getAuditTrail(entityType: string, entityId: string) {
    return prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { performedAt: 'desc' },
    });
  }
}

export const auditService = new AuditService();

