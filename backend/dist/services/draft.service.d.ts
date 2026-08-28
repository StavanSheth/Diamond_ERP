interface CreateDraftPayload {
    entityType: string;
    entityId?: string;
    ledgerId?: string;
    payload: Record<string, unknown>;
    createdBy: string;
    deviceId?: string;
    sessionId?: string;
}
export interface SaveDraftRevisionPayload {
    payload: Record<string, unknown>;
    changeSet?: Array<{
        path: string;
        before: unknown;
        after: unknown;
    }>;
    changeSummary?: string;
    updatedBy: string;
    expectedVersion?: number;
    deviceId?: string;
    sessionId?: string;
}
export declare class DraftService {
    /**
     * Generate the next draft number: DR-000001, DR-000002, etc.
     */
    private _nextDraftNumber;
    /**
     * Create a new draft with its initial revision.
     */
    createDraft(params: CreateDraftPayload): Promise<{
        revisions: {
            id: string;
            createdAt: Date;
            createdBy: string;
            deviceId: string | null;
            sessionId: string | null;
            revisionNumber: number;
            snapshotSchemaVersion: number;
            snapshot: string;
            changeSet: string | null;
            changeSummary: string | null;
            draftId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string | null;
        createdBy: string;
        version: number;
        entityType: string;
        entityId: string | null;
        draftNumber: string;
        updatedBy: string;
        latestRevisionId: string | null;
        expiresAt: Date | null;
    }>;
    /**
     * Save a new revision of an existing draft (Level B — server sync).
     */
    saveDraftRevision(draftId: string, params: SaveDraftRevisionPayload): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string;
        deviceId: string | null;
        sessionId: string | null;
        revisionNumber: number;
        snapshotSchemaVersion: number;
        snapshot: string;
        changeSet: string | null;
        changeSummary: string | null;
        draftId: string;
    }>;
    /**
     * Commit a draft: transitions to COMMITTED status.
     * The caller (controller) is responsible for actually creating the Transaction via TransactionService.
     */
    commitDraft(draftId: string, createdBy: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string | null;
        createdBy: string;
        version: number;
        entityType: string;
        entityId: string | null;
        draftNumber: string;
        updatedBy: string;
        latestRevisionId: string | null;
        expiresAt: Date | null;
    }>;
    /**
     * Abandon a draft (soft-delete).
     */
    abandonDraft(draftId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string | null;
        createdBy: string;
        version: number;
        entityType: string;
        entityId: string | null;
        draftNumber: string;
        updatedBy: string;
        latestRevisionId: string | null;
        expiresAt: Date | null;
    }>;
    /**
     * Get a draft by ID with its current revision.
     */
    getDraft(draftId: string): Promise<({
        revisions: {
            id: string;
            createdAt: Date;
            createdBy: string;
            deviceId: string | null;
            sessionId: string | null;
            revisionNumber: number;
            snapshotSchemaVersion: number;
            snapshot: string;
            changeSet: string | null;
            changeSummary: string | null;
            draftId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string | null;
        createdBy: string;
        version: number;
        entityType: string;
        entityId: string | null;
        draftNumber: string;
        updatedBy: string;
        latestRevisionId: string | null;
        expiresAt: Date | null;
    }) | null>;
    /**
     * List drafts, optionally filtered.
     */
    listDrafts(filters?: {
        status?: string;
        entityType?: string;
        createdBy?: string;
    }): Promise<({
        revisions: {
            id: string;
            createdAt: Date;
            createdBy: string;
            deviceId: string | null;
            sessionId: string | null;
            revisionNumber: number;
            snapshotSchemaVersion: number;
            snapshot: string;
            changeSet: string | null;
            changeSummary: string | null;
            draftId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string | null;
        createdBy: string;
        version: number;
        entityType: string;
        entityId: string | null;
        draftNumber: string;
        updatedBy: string;
        latestRevisionId: string | null;
        expiresAt: Date | null;
    })[]>;
}
export declare const draftService: DraftService;
export {};
//# sourceMappingURL=draft.service.d.ts.map