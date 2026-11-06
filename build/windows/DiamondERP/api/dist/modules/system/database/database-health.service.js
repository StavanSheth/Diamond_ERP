"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseHealthService = exports.DatabaseHealthService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const database_validation_service_1 = require("./database-validation.service");
const database_context_service_1 = require("../../../infrastructure/database/database-context.service");
const paths_1 = require("../../../infrastructure/paths");
const data_1 = require("../../../infrastructure/data");
class DatabaseHealthService {
    /**
     * Run comprehensive data health inspection across all ERP profiles and databases.
     */
    async checkHealth() {
        const profiles = await prisma_1.systemPrisma.profile.findMany({
            include: {
                databaseRegistries: true,
            },
            orderBy: { name: 'asc' },
        });
        const reportProfiles = [];
        let healthyCount = 0;
        const registeredPaths = new Set();
        for (const prof of profiles) {
            const issues = [];
            let dbContext = null;
            try {
                dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfile(prof.id);
            }
            catch (err) {
                issues.push(`Database Context Resolution Error: ${err.message}`);
            }
            const dbPath = dbContext?.canonicalPath || prof.dbPath || path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${prof.code}.db`);
            registeredPaths.add(path_1.default.resolve(dbPath).toLowerCase());
            const exists = fs_1.default.existsSync(dbPath);
            let readable = false;
            let sizeBytes = 0;
            if (exists) {
                try {
                    fs_1.default.accessSync(dbPath, fs_1.default.constants.R_OK);
                    readable = true;
                    sizeBytes = fs_1.default.statSync(dbPath).size;
                }
                catch {
                    issues.push('Database file exists but is not readable.');
                }
            }
            else {
                issues.push('Database file does not exist on disk.');
            }
            // SQLite integrity and schema check
            let integrityCheck = 'NOT_RUN';
            let tablesFound = [];
            let missingTables = [];
            let schemaVersion = prof.schemaVersion || 1;
            if (exists && readable) {
                const valResult = await database_validation_service_1.databaseValidationService.validateDatabase(dbPath);
                integrityCheck = valResult.integrityCheck || (valResult.isValid ? 'ok' : 'failed');
                tablesFound = valResult.tablesFound || [];
                missingTables = valResult.missingRequiredTables || [];
                if (valResult.schemaVersion)
                    schemaVersion = valResult.schemaVersion;
                if (!valResult.isValid) {
                    issues.push(`Integrity/Schema check failed: ${valResult.error || valResult.details}`);
                }
            }
            // Check WAL state
            let walState = 'CLEAN';
            if (fs_1.default.existsSync(`${dbPath}-wal`)) {
                walState = 'WAL_ACTIVE';
            }
            // Fetch last backup metadata for this profile
            const latestBackup = await prisma_1.systemPrisma.backupRecord.findFirst({
                where: { profileId: prof.id },
                orderBy: { createdAt: 'desc' },
            });
            const latestVerifiedBackup = await prisma_1.systemPrisma.backupRecord.findFirst({
                where: { profileId: prof.id, status: 'VERIFIED' },
                orderBy: { createdAt: 'desc' },
            });
            // Fetch last export metadata
            const latestExport = dbContext?.databaseId
                ? await prisma_1.systemPrisma.exportRecord.findFirst({
                    where: { databaseId: dbContext.databaseId },
                    orderBy: { createdAt: 'desc' },
                })
                : null;
            // Ownership invariants: Verify no duplicate profile assignment for this DB
            let ownershipValid = true;
            const otherRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
                where: {
                    canonicalPath: path_1.default.resolve(dbPath),
                    NOT: { profileId: prof.id },
                },
            });
            if (otherRegistries.length > 0) {
                ownershipValid = false;
                issues.push(`Ownership Conflict: Database path is simultaneously mapped to another profile/registry.`);
            }
            // Explicit Status Taxonomy (Section 16)
            let profileStatus = 'HEALTHY';
            if (!exists) {
                profileStatus = 'MISSING_DATABASE';
            }
            else if (!ownershipValid) {
                profileStatus = 'OWNERSHIP_CONFLICT';
            }
            else if (prof.databaseRegistries.length > 1) {
                profileStatus = 'MULTIPLE_DATABASES';
            }
            else if (prof.databaseRegistries.length === 0) {
                profileStatus = 'REGISTRY_CONFLICT';
            }
            else if (integrityCheck !== 'ok') {
                profileStatus = 'CORRUPTED_DATABASE';
            }
            else if (missingTables.length > 0) {
                profileStatus = 'SCHEMA_INVALID';
            }
            const isHealthy = profileStatus === 'HEALTHY';
            if (isHealthy)
                healthyCount++;
            reportProfiles.push({
                profileId: prof.id,
                profileCode: prof.code,
                profileName: prof.name,
                databaseId: dbContext?.databaseId || `db_${prof.code}`,
                databasePath: dbPath,
                exists,
                readable,
                sizeBytes,
                status: profileStatus,
                schemaVersion,
                integrityCheck,
                tablesFound,
                missingTables,
                walState,
                lastValidatedAt: prof.databaseRegistries[0]?.lastValidatedAt?.toISOString() || null,
                lastBackupAt: latestBackup?.createdAt?.toISOString() || null,
                lastVerifiedBackupAt: latestVerifiedBackup?.createdAt?.toISOString() || null,
                lastExportAt: latestExport?.createdAt?.toISOString() || null,
                isOrphaned: !prof.isActive,
                ownershipValid,
                issues,
            });
        }
        // Detect orphaned .db files in the databases directory
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const orphanedDatabases = [];
        const controlDbPath = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)() ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase() : '';
        if (fs_1.default.existsSync(databasesDir)) {
            const files = fs_1.default.readdirSync(databasesDir);
            for (const file of files) {
                if (!file.endsWith('.db'))
                    continue;
                const fullPath = path_1.default.resolve(databasesDir, file);
                const lower = fullPath.toLowerCase();
                if (lower === controlDbPath || lower === templateDbPath)
                    continue;
                if (!registeredPaths.has(lower)) {
                    orphanedDatabases.push({
                        path: fullPath,
                        sizeBytes: fs_1.default.statSync(fullPath).size,
                    });
                }
            }
        }
        const overallStatus = healthyCount === profiles.length && orphanedDatabases.length === 0
            ? 'HEALTHY'
            : healthyCount > 0
                ? 'WARNING'
                : 'CRITICAL';
        const diskSpace = data_1.dataLocationService.checkDiskSpace();
        return {
            overallStatus,
            dataRoot: (0, paths_1.getDataRoot)(),
            diskSpace: {
                freeBytes: diskSpace.freeBytes,
                totalBytes: diskSpace.totalBytes,
                freeGb: diskSpace.freeGb,
                totalGb: diskSpace.totalGb,
                status: diskSpace.status,
            },
            totalProfiles: profiles.length,
            healthyProfiles: healthyCount,
            orphanedDatabases,
            profiles: reportProfiles,
            generatedAt: new Date().toISOString(),
        };
    }
    async checkProfile(profileIdOrCode) {
        const report = await this.checkHealth();
        const clean = profileIdOrCode.trim().toLowerCase();
        const found = report.profiles.find((p) => p.profileId.toLowerCase() === clean || p.profileCode.toLowerCase() === clean);
        if (!found) {
            throw new Error(`Profile not found for health check: "${profileIdOrCode}"`);
        }
        return found;
    }
    async checkDatabase(databaseId) {
        const report = await this.checkHealth();
        const found = report.profiles.find((p) => p.databaseId === databaseId);
        if (!found) {
            throw new Error(`Database not found for health check: "${databaseId}"`);
        }
        return found;
    }
    async checkAllProfiles() {
        const report = await this.checkHealth();
        return report.profiles;
    }
}
exports.DatabaseHealthService = DatabaseHealthService;
exports.databaseHealthService = new DatabaseHealthService();
//# sourceMappingURL=database-health.service.js.map