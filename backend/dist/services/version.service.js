"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionService = exports.VersionService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const audit_service_1 = require("./audit.service");
class VersionService {
    /**
     * Create a new immutable version snapshot for an entity.
     * Automatically increments versionNumber and creates VersionChange records.
     */
    async createVersion(params) {
        // Determine next version number
        const latestVersion = await prisma_1.default.recordVersion.findFirst({
            where: { entityType: params.entityType, entityId: params.entityId },
            orderBy: { versionNumber: 'desc' },
        });
        const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
        const version = await prisma_1.default.recordVersion.create({
            data: {
                entityType: params.entityType,
                entityId: params.entityId,
                versionNumber: nextVersionNumber,
                versionType: params.versionType,
                snapshot: JSON.stringify(params.snapshot),
                changeSet: params.changeSet ? JSON.stringify(params.changeSet) : null,
                changeSummary: params.changeSummary,
                createdBy: params.createdBy,
                source: params.source || 'WEB',
                deviceId: params.deviceId,
                sessionId: params.sessionId,
                parentVersionId: params.parentVersionId || (latestVersion ? latestVersion.id : null),
                restoredFromVersionId: params.restoredFromVersionId,
                changes: params.changeSet
                    ? {
                        create: params.changeSet.map((c) => ({
                            fieldPath: c.path,
                            valueBefore: c.before !== undefined ? JSON.stringify(c.before) : null,
                            valueAfter: c.after !== undefined ? JSON.stringify(c.after) : null,
                        })),
                    }
                    : undefined,
            },
            include: { changes: true },
        });
        return version;
    }
    /**
     * Get the full version history for an entity, newest first.
     */
    async getVersionHistory(entityType, entityId) {
        return prisma_1.default.recordVersion.findMany({
            where: { entityType, entityId },
            include: { changes: true },
            orderBy: { versionNumber: 'desc' },
        });
    }
    /**
     * Get a single version by ID, including its field-level changes.
     */
    async getVersion(versionId) {
        return prisma_1.default.recordVersion.findUnique({
            where: { id: versionId },
            include: { changes: true },
        });
    }
    /**
     * Restore a previous version by creating a NEW version (V+1) with the restored snapshot.
     * DOES NOT delete any history — safe for ERP.
     */
    async restoreVersion(versionId, createdBy) {
        const oldVersion = await prisma_1.default.recordVersion.findUnique({
            where: { id: versionId },
        });
        if (!oldVersion)
            throw new Error('Version not found');
        const latestVersion = await prisma_1.default.recordVersion.findFirst({
            where: { entityType: oldVersion.entityType, entityId: oldVersion.entityId },
            orderBy: { versionNumber: 'desc' },
        });
        const restoredVersion = await this.createVersion({
            entityType: oldVersion.entityType,
            entityId: oldVersion.entityId,
            versionType: 'RESTORED',
            snapshot: JSON.parse(oldVersion.snapshot),
            changeSummary: `Restored from Version ${oldVersion.versionNumber}`,
            createdBy,
            parentVersionId: latestVersion?.id,
            restoredFromVersionId: oldVersion.id,
        });
        // Log the restore event
        await audit_service_1.auditService.logEvent({
            entityType: oldVersion.entityType,
            entityId: oldVersion.entityId,
            eventType: 'VERSION_RESTORED',
            description: `Restored to Version ${oldVersion.versionNumber}`,
            metadata: { restoredFromVersionId: oldVersion.id, newVersionId: restoredVersion.id },
            performedBy: createdBy,
        });
        return restoredVersion;
    }
    /**
     * Diff two version snapshots and return field-level differences.
     */
    async diffVersions(versionIdA, versionIdB) {
        const [a, b] = await Promise.all([
            prisma_1.default.recordVersion.findUnique({ where: { id: versionIdA } }),
            prisma_1.default.recordVersion.findUnique({ where: { id: versionIdB } }),
        ]);
        if (!a || !b)
            throw new Error('One or both versions not found');
        const snapshotA = JSON.parse(a.snapshot);
        const snapshotB = JSON.parse(b.snapshot);
        const diffs = this._deepDiff(snapshotA, snapshotB);
        return {
            versionA: { id: a.id, versionNumber: a.versionNumber, createdAt: a.createdAt },
            versionB: { id: b.id, versionNumber: b.versionNumber, createdAt: b.createdAt },
            changes: diffs,
        };
    }
    /**
     * Simple recursive diff between two objects.
     */
    _deepDiff(objA, objB, prefix = '') {
        const diffs = [];
        // Normalize arrays to maps if they have identifiable objects
        const normalizeArrays = (arr) => {
            if (!Array.isArray(arr))
                return arr;
            if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
                // Find a stable key
                const keyProp = arr[0].id ? 'id' : (arr[0].itemCode ? 'itemCode' : (arr[0].uuid ? 'uuid' : null));
                if (keyProp) {
                    return arr.reduce((acc, item) => {
                        acc[item[keyProp]] = item;
                        return acc;
                    }, {});
                }
            }
            return arr;
        };
        const normA = Array.isArray(objA) ? normalizeArrays(objA) : objA;
        const normB = Array.isArray(objB) ? normalizeArrays(objB) : objB;
        if (Array.isArray(normA) && Array.isArray(normB)) {
            if (JSON.stringify(normA) !== JSON.stringify(normB)) {
                diffs.push({ path: prefix, before: normA, after: normB });
            }
            return diffs;
        }
        const allKeys = new Set([...Object.keys(normA || {}), ...Object.keys(normB || {})]);
        for (const key of allKeys) {
            const path = prefix ? `${prefix}.${key}` : key;
            const valA = (normA || {})[key];
            const valB = (normB || {})[key];
            if (typeof valA === 'object' &&
                valA !== null &&
                typeof valB === 'object' &&
                valB !== null &&
                !Array.isArray(valA) &&
                !Array.isArray(valB)) {
                diffs.push(...this._deepDiff(valA, valB, path));
            }
            else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
                diffs.push({ path, before: valA, after: valB });
            }
        }
        return diffs;
    }
}
exports.VersionService = VersionService;
exports.versionService = new VersionService();
//# sourceMappingURL=version.service.js.map