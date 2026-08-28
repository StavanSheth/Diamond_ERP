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
export declare class AuditService {
    logEvent(params: LogEventParams): Promise<{
        id: string;
        description: string | null;
        eventType: string;
        entityType: string;
        entityId: string;
        metadata: string | null;
        performedBy: string;
        performedAt: Date;
        ipAddress: string | null;
        deviceId: string | null;
        sessionId: string | null;
    }>;
    getAuditTrail(entityType: string, entityId: string): Promise<{
        id: string;
        description: string | null;
        eventType: string;
        entityType: string;
        entityId: string;
        metadata: string | null;
        performedBy: string;
        performedAt: Date;
        ipAddress: string | null;
        deviceId: string | null;
        sessionId: string | null;
    }[]>;
}
export declare const auditService: AuditService;
export {};
//# sourceMappingURL=audit.service.d.ts.map