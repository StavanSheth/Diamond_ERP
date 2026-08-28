interface CreateVersionParams {
    entityType: string;
    entityId: string;
    versionType: string;
    snapshot: Record<string, unknown>;
    changeSet?: Array<{
        path: string;
        before: unknown;
        after: unknown;
    }>;
    changeSummary?: string;
    createdBy: string;
    source?: string;
    deviceId?: string;
    sessionId?: string;
    parentVersionId?: string;
    restoredFromVersionId?: string;
}
export declare class VersionService {
    /**
     * Create a new immutable version snapshot for an entity.
     * Automatically increments versionNumber and creates VersionChange records.
     */
    createVersion(params: CreateVersionParams): Promise<{
        changes: {
            id: string;
            valueBefore: string | null;
            valueAfter: string | null;
            fieldPath: string;
            recordVersionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        createdBy: string;
        entityType: string;
        entityId: string;
        deviceId: string | null;
        sessionId: string | null;
        snapshotSchemaVersion: number;
        snapshot: string;
        changeSet: string | null;
        changeSummary: string | null;
        versionNumber: number;
        versionType: string;
        source: string | null;
        parentVersionId: string | null;
        restoredFromVersionId: string | null;
    }>;
    /**
     * Get the full version history for an entity, newest first.
     */
    getVersionHistory(entityType: string, entityId: string): Promise<({
        changes: {
            id: string;
            valueBefore: string | null;
            valueAfter: string | null;
            fieldPath: string;
            recordVersionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        createdBy: string;
        entityType: string;
        entityId: string;
        deviceId: string | null;
        sessionId: string | null;
        snapshotSchemaVersion: number;
        snapshot: string;
        changeSet: string | null;
        changeSummary: string | null;
        versionNumber: number;
        versionType: string;
        source: string | null;
        parentVersionId: string | null;
        restoredFromVersionId: string | null;
    })[]>;
    /**
     * Get a single version by ID, including its field-level changes.
     */
    getVersion(versionId: string): Promise<({
        changes: {
            id: string;
            valueBefore: string | null;
            valueAfter: string | null;
            fieldPath: string;
            recordVersionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        createdBy: string;
        entityType: string;
        entityId: string;
        deviceId: string | null;
        sessionId: string | null;
        snapshotSchemaVersion: number;
        snapshot: string;
        changeSet: string | null;
        changeSummary: string | null;
        versionNumber: number;
        versionType: string;
        source: string | null;
        parentVersionId: string | null;
        restoredFromVersionId: string | null;
    }) | null>;
    /**
     * Restore a previous version by creating a NEW version (V+1) with the restored snapshot.
     * DOES NOT delete any history — safe for ERP.
     */
    restoreVersion(versionId: string, createdBy: string): Promise<{
        changes: {
            id: string;
            valueBefore: string | null;
            valueAfter: string | null;
            fieldPath: string;
            recordVersionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        createdBy: string;
        entityType: string;
        entityId: string;
        deviceId: string | null;
        sessionId: string | null;
        snapshotSchemaVersion: number;
        snapshot: string;
        changeSet: string | null;
        changeSummary: string | null;
        versionNumber: number;
        versionType: string;
        source: string | null;
        parentVersionId: string | null;
        restoredFromVersionId: string | null;
    }>;
    /**
     * Diff two version snapshots and return field-level differences.
     */
    diffVersions(versionIdA: string, versionIdB: string): Promise<{
        versionA: {
            id: string;
            versionNumber: number;
            createdAt: Date;
        };
        versionB: {
            id: string;
            versionNumber: number;
            createdAt: Date;
        };
        changes: {
            path: string;
            before: unknown;
            after: unknown;
        }[];
    }>;
    /**
     * Simple recursive diff between two objects.
     */
    private _deepDiff;
}
export declare const versionService: VersionService;
export {};
//# sourceMappingURL=version.service.d.ts.map