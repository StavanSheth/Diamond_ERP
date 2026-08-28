"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.draftService = exports.DraftService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const audit_service_1 = require("./audit.service");
class DraftService {
    /**
     * Generate the next draft number: DR-000001, DR-000002, etc.
     */
    async _nextDraftNumber() {
        const lastDraft = await prisma_1.default.documentDraft.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { draftNumber: true },
        });
        if (!lastDraft)
            return 'DR-000001';
        const num = parseInt(lastDraft.draftNumber.replace('DR-', ''), 10);
        return `DR-${String(num + 1).padStart(6, '0')}`;
    }
    /**
     * Create a new draft with its initial revision.
     */
    async createDraft(params) {
        const draftNumber = await this._nextDraftNumber();
        // Default expiry: 30 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        const draft = await prisma_1.default.documentDraft.create({
            data: {
                draftNumber,
                entityType: params.entityType,
                entityId: params.entityId || null,
                ledgerId: params.ledgerId || null,
                createdBy: params.createdBy,
                updatedBy: params.createdBy,
                status: 'ACTIVE',
                version: 1,
                expiresAt,
                revisions: {
                    create: {
                        revisionNumber: 1,
                        snapshotSchemaVersion: 1,
                        snapshot: JSON.stringify(params.payload),
                        changeSummary: 'Draft created',
                        createdBy: params.createdBy,
                        deviceId: params.deviceId,
                        sessionId: params.sessionId,
                    },
                },
            },
            include: { revisions: true },
        });
        if (draft.revisions[0]) {
            await prisma_1.default.documentDraft.update({
                where: { id: draft.id },
                data: { latestRevisionId: draft.revisions[0].id }
            });
        }
        await audit_service_1.auditService.logEvent({
            entityType: params.entityType,
            entityId: draft.id,
            eventType: 'DRAFT_CREATED',
            description: `Draft ${draftNumber} created`,
            performedBy: params.createdBy,
        });
        return draft;
    }
    /**
     * Save a new revision of an existing draft (Level B — server sync).
     */
    async saveDraftRevision(draftId, params) {
        const draft = await prisma_1.default.documentDraft.findUnique({
            where: { id: draftId },
            include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
        });
        if (!draft)
            throw new Error('Draft not found');
        if (draft.status === 'COMMITTED' || draft.status === 'ABANDONED') {
            throw new Error(`Cannot update draft in ${draft.status} status`);
        }
        if (params.expectedVersion !== undefined && draft.version !== params.expectedVersion) {
            throw new Error('Concurrency conflict: DocumentDraft has been modified by another process.');
        }
        const nextRevisionNumber = (draft.revisions[0]?.revisionNumber ?? 0) + 1;
        const [revision] = await prisma_1.default.$transaction([
            prisma_1.default.draftRevision.create({
                data: {
                    draftId,
                    revisionNumber: nextRevisionNumber,
                    snapshotSchemaVersion: 1,
                    snapshot: JSON.stringify(params.payload),
                    changeSet: params.changeSet ? JSON.stringify(params.changeSet) : null,
                    changeSummary: params.changeSummary,
                    createdBy: params.updatedBy,
                    deviceId: params.deviceId,
                    sessionId: params.sessionId,
                },
            }),
            prisma_1.default.documentDraft.update({
                where: { id: draftId, version: draft.version },
                data: {
                    updatedBy: params.updatedBy,
                    status: 'SAVED',
                    version: draft.version + 1,
                },
            }),
        ]);
        // Update latest revision reference
        await prisma_1.default.documentDraft.update({
            where: { id: draftId },
            data: { latestRevisionId: revision.id }
        });
        return revision;
    }
    /**
     * Commit a draft: transitions to COMMITTED status.
     * The caller (controller) is responsible for actually creating the Transaction via TransactionService.
     */
    async commitDraft(draftId, createdBy) {
        const draft = await prisma_1.default.documentDraft.findUnique({ where: { id: draftId } });
        if (!draft)
            throw new Error('Draft not found');
        if (draft.status === 'COMMITTED')
            throw new Error('Draft already committed');
        const updated = await prisma_1.default.documentDraft.update({
            where: { id: draftId },
            data: { status: 'COMMITTED', updatedBy: createdBy },
        });
        await audit_service_1.auditService.logEvent({
            entityType: draft.entityType,
            entityId: draft.id,
            eventType: 'DRAFT_COMMITTED',
            description: `Draft ${draft.draftNumber} committed`,
            performedBy: createdBy,
        });
        return updated;
    }
    /**
     * Abandon a draft (soft-delete).
     */
    async abandonDraft(draftId) {
        return prisma_1.default.documentDraft.update({
            where: { id: draftId },
            data: { status: 'ABANDONED' },
        });
    }
    /**
     * Get a draft by ID with its current revision.
     */
    async getDraft(draftId) {
        return prisma_1.default.documentDraft.findUnique({
            where: { id: draftId },
            include: {
                revisions: { orderBy: { revisionNumber: 'desc' }, take: 5 },
            },
        });
    }
    /**
     * List drafts, optionally filtered.
     */
    async listDrafts(filters) {
        const where = {};
        if (filters?.status)
            where.status = filters.status;
        if (filters?.entityType)
            where.entityType = filters.entityType;
        if (filters?.createdBy)
            where.createdBy = filters.createdBy;
        // Exclude expired drafts by default (but keep committed/abandoned visible)
        return prisma_1.default.documentDraft.findMany({
            where: where,
            include: {
                revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
            },
            orderBy: { updatedAt: 'desc' },
        });
    }
}
exports.DraftService = DraftService;
exports.draftService = new DraftService();
//# sourceMappingURL=draft.service.js.map