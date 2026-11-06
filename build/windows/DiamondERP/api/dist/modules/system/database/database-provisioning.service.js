"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseProvisioningService = exports.DatabaseProvisioningService = exports.PRISTINE_TABLE_CLASSIFICATION = exports.TableCategory = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/database/prisma");
const database_path_util_1 = require("./database-path.util");
const database_validation_service_1 = require("./database-validation.service");
const installation_service_1 = require("../installation.service");
const paths_1 = require("../../../infrastructure/paths");
const logging_1 = require("../../../infrastructure/logging");
const errors_1 = require("../../../errors");
var TableCategory;
(function (TableCategory) {
    TableCategory["SCHEMA_METADATA"] = "SCHEMA_METADATA";
    TableCategory["SYSTEM_CONFIGURATION"] = "SYSTEM_CONFIGURATION";
    TableCategory["REFERENCE_DATA"] = "REFERENCE_DATA";
    TableCategory["BUSINESS_DATA"] = "BUSINESS_DATA";
    TableCategory["AUDIT_DATA"] = "AUDIT_DATA";
})(TableCategory || (exports.TableCategory = TableCategory = {}));
/**
 * Authoritative Classification of every known table in the Diamond ERP Schema.
 * Fix #4: Prevents unclassified business tables from bypassing pristine validation.
 */
exports.PRISTINE_TABLE_CLASSIFICATION = {
    // Schema & Migration Metadata
    _prisma_migrations: TableCategory.SCHEMA_METADATA,
    sqlite_sequence: TableCategory.SCHEMA_METADATA,
    // System Configuration & Sequences
    Sequence: TableCategory.SYSTEM_CONFIGURATION,
    Setting: TableCategory.SYSTEM_CONFIGURATION,
    // Control Plane Tables (if present in template or control DB)
    Installation: TableCategory.SYSTEM_CONFIGURATION,
    Device: TableCategory.SYSTEM_CONFIGURATION,
    DeviceSecurity: TableCategory.SYSTEM_CONFIGURATION,
    InstallationUser: TableCategory.SYSTEM_CONFIGURATION,
    DatabaseRegistry: TableCategory.SYSTEM_CONFIGURATION,
    BackupRecord: TableCategory.SYSTEM_CONFIGURATION,
    RestoreRecord: TableCategory.SYSTEM_CONFIGURATION,
    Session: TableCategory.SYSTEM_CONFIGURATION,
    IdempotencyKey: TableCategory.SYSTEM_CONFIGURATION,
    ProvisioningOperation: TableCategory.SYSTEM_CONFIGURATION,
    PreservationPackage: TableCategory.SYSTEM_CONFIGURATION,
    UninstallAuthorization: TableCategory.SYSTEM_CONFIGURATION,
    ExportRecord: TableCategory.SYSTEM_CONFIGURATION,
    // Reference / Tenant Definitions
    Profile: TableCategory.REFERENCE_DATA,
    UserProfile: TableCategory.REFERENCE_DATA,
    User: TableCategory.REFERENCE_DATA,
    Location: TableCategory.REFERENCE_DATA,
    // Core Business Data (MUST BE STRICTLY ZERO ROWS IN PRISTINE DB)
    Stock: TableCategory.BUSINESS_DATA,
    Ledger: TableCategory.BUSINESS_DATA,
    Party: TableCategory.BUSINESS_DATA,
    DiamondItem: TableCategory.BUSINESS_DATA,
    Transaction: TableCategory.BUSINESS_DATA,
    TransactionItem: TableCategory.BUSINESS_DATA,
    ItemEvent: TableCategory.BUSINESS_DATA,
    Certification: TableCategory.BUSINESS_DATA,
    Repair: TableCategory.BUSINESS_DATA,
    InventoryMovement: TableCategory.BUSINESS_DATA,
    FinancialEntry: TableCategory.BUSINESS_DATA,
    ItemTransformation: TableCategory.BUSINESS_DATA,
    TransformationProvenance: TableCategory.BUSINESS_DATA,
    DocumentDraft: TableCategory.BUSINESS_DATA,
    DraftRevision: TableCategory.BUSINESS_DATA,
    RecordVersion: TableCategory.BUSINESS_DATA,
    VersionChange: TableCategory.BUSINESS_DATA,
    // Audit Data
    AuditEvent: TableCategory.AUDIT_DATA,
};
let tableEnsured = false;
async function ensureProvisioningOperationTable() {
    if (tableEnsured)
        return;
    try {
        await prisma_1.systemPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProvisioningOperation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "operationId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "profileCode" TEXT NOT NULL,
        "targetPath" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "requestHash" TEXT NOT NULL,
        "databaseId" TEXT,
        "profileId" TEXT,
        "errorCode" TEXT,
        "errorMessage" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" DATETIME
      );
    `);
        await prisma_1.systemPrisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProvisioningOperation_operationId_key" ON "ProvisioningOperation"("operationId");`);
        await prisma_1.systemPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProvisioningOperation_status_idx" ON "ProvisioningOperation"("status");`);
        tableEnsured = true;
    }
    catch (err) {
        logging_1.logger.warn(`Could not ensure ProvisioningOperation table: ${err.message}`);
    }
}
class DatabaseProvisioningService {
    constructor() {
        this.activeProvisioningPaths = new Set();
    }
    /**
     * Determine and validate the destination filesystem path for a new database.
     * Invariants:
     * - Must reside under databases directory.
     * - Must not collide with control DB (system.db) or template DB (template.db).
     * - Must not collide with an existing file on disk.
     */
    determineDestination(profileCode, databasesDir) {
        const dbDir = path_1.default.resolve(databasesDir || (0, paths_1.getDatabasesDir)());
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        const sanitizedCode = profileCode.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const targetDbPath = path_1.default.resolve(dbDir, `${sanitizedCode}.db`);
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(targetDbPath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid destination database path');
        }
        const canonical = pathResult.canonicalPath;
        // Guard: Control DB collision
        const controlDbCanonical = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        if (canonical.toLowerCase() === controlDbCanonical) {
            throw new errors_1.ConflictError('Cannot provision database at system control database path (system.db).');
        }
        // Guard: Template DB collision
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDbPath && canonical.toLowerCase() === path_1.default.resolve(templateDbPath).toLowerCase()) {
            throw new errors_1.ConflictError('Cannot overwrite immutable database template (template.db).');
        }
        return {
            canonicalPath: canonical,
            isExternal: pathResult.isExternal,
        };
    }
    /**
     * Validate that the newly cloned database is truly pristine.
     * Authoritative Policy (Fix #4):
     * 1. Detects and fails closed on unclassified tables (PRISTINE_VALIDATION_UNCLASSIFIED).
     * 2. Asserts strictly 0 business records across all classified BUSINESS_DATA tables.
     */
    async validatePristineState(canonicalPath) {
        const client = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: `file:${path_1.default.resolve(canonicalPath)}`,
                },
            },
        });
        const recordCounts = {};
        try {
            await client.$connect();
            // Query sqlite_master to verify which tables actually exist
            const existingTables = await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table';");
            const tableNames = existingTables.map((t) => t.name);
            for (const tableName of tableNames) {
                // Skip SQLite system internals
                if (tableName.startsWith('sqlite_'))
                    continue;
                const category = exports.PRISTINE_TABLE_CLASSIFICATION[tableName];
                if (!category) {
                    throw new errors_1.ConflictError(`Pristine validation failed: Unclassified table "${tableName}" detected (PRISTINE_VALIDATION_UNCLASSIFIED). Cannot verify pristine state.`);
                }
                if (category === TableCategory.BUSINESS_DATA) {
                    const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${tableName}";`);
                    const count = Number(rows?.[0]?.cnt || 0);
                    recordCounts[tableName] = count;
                    if (count > 0) {
                        throw new errors_1.ConflictError(`Provisioned database is not pristine. Business table "${tableName}" contains ${count} customer record(s).`);
                    }
                }
            }
            return {
                isPristine: true,
                recordCounts,
            };
        }
        finally {
            await client.$disconnect().catch(() => { });
        }
    }
    /**
     * Validate the approved immutable template before copying.
     * Invariants:
     * - Template exists and is readable.
     * - Passes structural and schema integrity check.
     * - Satisfies pristine policy (zero business records).
     */
    async validateTemplate() {
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        if (!templateDbPath || !fs_1.default.existsSync(templateDbPath)) {
            throw new errors_1.NotFoundError('Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.');
        }
        try {
            fs_1.default.accessSync(templateDbPath, fs_1.default.constants.R_OK);
        }
        catch (err) {
            throw new errors_1.ValidationError(`Database template is not readable: ${err.message}`);
        }
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(templateDbPath, { allowTemplate: true });
        if (!validation.isValid) {
            throw new errors_1.ValidationError(`Database template failed structural validation: ${validation.error} (${validation.details})`);
        }
        await this.validatePristineState(templateDbPath);
        return templateDbPath;
    }
    /**
     * Reconcile interrupted or in-flight provisioning operations (Crash Recovery / Fix #3).
     * Finds operations in transient states and safely reconciles or compensates them without deleting customer data.
     */
    async reconcileInterruptedOperations(installationId) {
        await ensureProvisioningOperationTable();
        const where = {
            status: {
                in: [
                    'PENDING',
                    'DESTINATION_RESERVED',
                    'FILE_CREATED',
                    'DATABASE_VALIDATED',
                    'PRISTINE_VALIDATED',
                    'CONTROL_RECORDS_CREATED',
                    'RUNTIME_REGISTERED',
                    'RECOVERABLE',
                ],
            },
        };
        if (installationId) {
            where.installationId = installationId;
        }
        const transientOps = await prisma_1.systemPrisma.provisioningOperation.findMany({ where });
        let reconciled = 0;
        let compensated = 0;
        for (const op of transientOps) {
            const fileExists = fs_1.default.existsSync(op.targetPath);
            const registry = op.databaseId
                ? await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { databaseId: op.databaseId } })
                : await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath: op.targetPath } });
            const profile = await prisma_1.systemPrisma.profile.findUnique({ where: { code: op.profileCode } });
            const userProfile = profile
                ? await prisma_1.systemPrisma.userProfile.findFirst({
                    where: { userId: op.userId, profileId: profile.id, isActive: true },
                })
                : null;
            // Case 1: Everything exists, database is valid and owned
            if (fileExists && registry && profile && userProfile) {
                const val = await database_validation_service_1.databaseValidationService.validateDatabase(op.targetPath);
                if (val.isValid) {
                    await prisma_1.systemPrisma.provisioningOperation.update({
                        where: { id: op.id },
                        data: { status: 'COMPLETED', completedAt: new Date() },
                    });
                    reconciled++;
                    continue;
                }
            }
            // Case 2: File exists but control registration incomplete
            if (fileExists && !registry) {
                try {
                    const val = await database_validation_service_1.databaseValidationService.validateDatabase(op.targetPath);
                    const pristine = await this.validatePristineState(op.targetPath);
                    if (val.isValid && pristine.isPristine) {
                        // Complete registration idempotently
                        const result = await prisma_1.systemPrisma.$transaction(async (tx) => {
                            let prof = await tx.profile.findUnique({ where: { code: op.profileCode } });
                            if (!prof) {
                                prof = await tx.profile.create({
                                    data: {
                                        code: op.profileCode,
                                        name: op.profileCode,
                                        dbPath: op.targetPath,
                                        schemaVersion: val.schemaVersion || 1,
                                        status: 'ACTIVE',
                                        isActive: true,
                                    },
                                });
                            }
                            const reg = await tx.databaseRegistry.create({
                                data: {
                                    databaseId: op.databaseId || crypto_1.default.randomUUID(),
                                    displayName: op.profileCode,
                                    canonicalPath: op.targetPath,
                                    schemaVersion: val.schemaVersion || 1,
                                    status: 'ACTIVE',
                                    databaseType: 'LOCAL_PROFILE',
                                    profileId: prof.id,
                                    installationId: op.installationId,
                                    lastValidatedAt: new Date(),
                                },
                            });
                            await tx.userProfile.upsert({
                                where: { userId_profileId: { userId: op.userId, profileId: prof.id } },
                                update: { isActive: true },
                                create: { userId: op.userId, profileId: prof.id, role: 'ADMIN', isActive: true },
                            });
                            return { prof, reg };
                        });
                        await prisma_1.systemPrisma.provisioningOperation.update({
                            where: { id: op.id },
                            data: {
                                databaseId: result.reg.databaseId,
                                profileId: result.prof.id,
                                status: 'COMPLETED',
                                completedAt: new Date(),
                            },
                        });
                        reconciled++;
                        continue;
                    }
                }
                catch {
                    // Validation failed on incomplete file: compensate
                }
                // Clean up incomplete file created by this operation
                try {
                    fs_1.default.unlinkSync(op.targetPath);
                }
                catch { }
                await prisma_1.systemPrisma.provisioningOperation.update({
                    where: { id: op.id },
                    data: { status: 'COMPENSATED', errorCode: 'INCOMPLETE_ORPHAN_CLEANED' },
                });
                compensated++;
                continue;
            }
            // Case 3: File missing or registry without file
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { id: op.id },
                data: { status: 'COMPENSATED', errorCode: 'FILE_MISSING_CLEANED' },
            });
            compensated++;
        }
        return { reconciled, compensated };
    }
    /**
     * Provision a brand-new blank database from the immutable template.
     * Full Phase 6 lifecycle:
     * 1. Validate target user existence and installation association (Strict User-DB Isolation / Fix #1)
     * 2. Check durable operation identity & deterministic request hash (Durable Idempotency / Fix #2)
     * 3. Validate approved template before copying (Fix #4)
     * 4. Clone template to destination path
     * 5. Validate SQLite structure, schema, and SQLite integrity
     * 6. Validate pristine state with authoritative classification (Fix #4)
     * 7. Register Profile, DatabaseRegistry, and UserProfile in Control DB transaction for TARGET USER ONLY
     * 8. Emit audit events
     * 9. Register profile in runtime client pool
     * 10. Mark operation COMPLETED; compensate filesystem artifacts on failure (Crash Recovery / Fix #3)
     */
    async provisionBlankDatabase(input) {
        await ensureProvisioningOperationTable();
        // ── Fix #1: Authoritative Target User Enforcement ───────────────────────
        if (!input.userId || !input.userId.trim()) {
            throw new errors_1.ValidationError('A valid target userId is strictly required for provisioning a new database.');
        }
        let targetUserId = input.userId.trim();
        const install = input.installationId
            ? { id: input.installationId }
            : await installation_service_1.installationService.getOrCreateInstallation();
        // Validate user exists and is active
        let user = await prisma_1.systemPrisma.user.findUnique({ where: { id: targetUserId } });
        if (!user || !user.isActive || user.deletedAt) {
            if (targetUserId === 'default-admin') {
                const fallbackUser = await prisma_1.systemPrisma.user.findFirst({
                    where: { isActive: true, deletedAt: null },
                    orderBy: { createdAt: 'asc' },
                });
                if (fallbackUser) {
                    user = fallbackUser;
                    targetUserId = fallbackUser.id;
                }
            }
        }
        if (!user || !user.isActive || user.deletedAt) {
            throw new errors_1.ValidationError('Target user is invalid, inactive, or soft-deleted.');
        }
        // Validate user belongs to this installation
        const installUser = await prisma_1.systemPrisma.installationUser.findUnique({
            where: {
                installationId_userId: {
                    installationId: install.id,
                    userId: targetUserId,
                },
            },
        });
        if (!installUser) {
            throw new errors_1.ConflictError('Target user does not belong to the current installation.');
        }
        const displayName = input.displayName?.trim();
        if (!displayName) {
            throw new errors_1.ValidationError('Database display name is required');
        }
        const profileCode = (input.profileCode || displayName)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');
        const profileName = input.profileName || displayName;
        const { canonicalPath: targetDbPath } = this.determineDestination(profileCode);
        // ── Fix #2: Durable Operation Identity & Hash Verification ─────────────
        const operationId = input.provisioningOperationId || crypto_1.default.randomUUID();
        const requestHash = crypto_1.default
            .createHash('sha256')
            .update(JSON.stringify({
            installationId: install.id,
            userId: targetUserId,
            profileCode,
            displayName,
            profileName,
        }))
            .digest('hex');
        // Check for existing durable operation
        let durableOp = await prisma_1.systemPrisma.provisioningOperation.findUnique({
            where: { operationId },
        });
        if (durableOp) {
            // Reject reuse of same operationId with conflicting payload
            if (durableOp.requestHash !== requestHash) {
                throw new errors_1.ConflictError(`Provisioning operation ID "${operationId}" was previously executed with different parameters.`);
            }
            // Idempotent return if already completed
            if (durableOp.status === 'COMPLETED') {
                logging_1.logger.info(`Durable idempotency return for completed operation: ${operationId}`);
                const reg = durableOp.databaseId
                    ? await prisma_1.systemPrisma.databaseRegistry.findUnique({
                        where: { databaseId: durableOp.databaseId },
                        include: { profile: true },
                    })
                    : await prisma_1.systemPrisma.databaseRegistry.findUnique({
                        where: { canonicalPath: targetDbPath },
                        include: { profile: true },
                    });
                if (reg) {
                    return {
                        databaseId: reg.databaseId,
                        displayName: reg.displayName,
                        canonicalPath: reg.canonicalPath,
                        profileId: reg.profileId || '',
                        profileCode: reg.profile?.code || profileCode,
                        schemaVersion: reg.schemaVersion,
                        status: reg.status,
                        isPristine: true,
                        operationId,
                    };
                }
            }
            if (durableOp.status === 'FAILED' || durableOp.status === 'COMPENSATED') {
                throw new errors_1.ConflictError(`Provisioning operation "${operationId}" previously terminated: ${durableOp.errorMessage || durableOp.status}`);
            }
        }
        else {
            durableOp = await prisma_1.systemPrisma.provisioningOperation.create({
                data: {
                    operationId,
                    installationId: install.id,
                    userId: targetUserId,
                    profileCode,
                    targetPath: targetDbPath,
                    status: 'PENDING',
                    requestHash,
                },
            });
        }
        // Fast in-process concurrency guard
        const lockKey = targetDbPath.toLowerCase();
        if (this.activeProvisioningPaths.has(lockKey)) {
            throw new errors_1.ConflictError(`Concurrent provisioning already in progress for "${profileCode}".`);
        }
        this.activeProvisioningPaths.add(lockKey);
        let createdFile = false;
        try {
            // Guard: Disk collision / partial completion check
            if (fs_1.default.existsSync(targetDbPath)) {
                const existingReg = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                    where: { canonicalPath: targetDbPath },
                    include: { profile: true },
                });
                if (existingReg) {
                    if (existingReg.profile && existingReg.profile.code.toLowerCase() !== profileCode.toLowerCase()) {
                        throw new errors_1.ConflictError(`Database ownership conflict: Path "${targetDbPath}" is already owned by profile "${existingReg.profile.code}". Two profiles cannot share the same database file.`);
                    }
                }
                if (existingReg && existingReg.installationId === install.id) {
                    logging_1.logger.info(`Idempotent return for already registered database: ${targetDbPath}`);
                    await prisma_1.systemPrisma.provisioningOperation.update({
                        where: { operationId },
                        data: {
                            databaseId: existingReg.databaseId,
                            profileId: existingReg.profileId,
                            status: 'COMPLETED',
                            completedAt: new Date(),
                        },
                    });
                    return {
                        databaseId: existingReg.databaseId,
                        displayName: existingReg.displayName,
                        canonicalPath: existingReg.canonicalPath,
                        profileId: existingReg.profileId || '',
                        profileCode: existingReg.profile?.code || profileCode,
                        schemaVersion: existingReg.schemaVersion,
                        status: existingReg.status,
                        isPristine: true,
                        operationId,
                    };
                }
                // Check if existing file is from a partially completed attempt that can be resumed
                const preValidation = await database_validation_service_1.databaseValidationService.validateDatabase(targetDbPath);
                if (preValidation.isValid) {
                    logging_1.logger.info(`Resuming provisioning for existing valid database file: ${targetDbPath}`);
                    createdFile = false;
                }
                else {
                    // Incomplete/corrupt file from aborted previous run — clean up to restart from template
                    try {
                        fs_1.default.unlinkSync(targetDbPath);
                        logging_1.logger.info(`Cleaned up invalid partial database file: ${targetDbPath}`);
                    }
                    catch { }
                }
            }
            if (!fs_1.default.existsSync(targetDbPath)) {
                // Step 1: Destination Reserved
                await prisma_1.systemPrisma.provisioningOperation.update({
                    where: { operationId },
                    data: { status: 'DESTINATION_RESERVED' },
                });
                // Step 2: Validate approved template before copying (Fix #4)
                const templateDbPath = await this.validateTemplate();
                // Step 3: Clone immutable template to destination
                fs_1.default.copyFileSync(templateDbPath, targetDbPath);
                createdFile = true;
                await prisma_1.systemPrisma.provisioningOperation.update({
                    where: { operationId },
                    data: { status: 'FILE_CREATED' },
                });
            }
            // Step 4: Structural, schema, and SQLite integrity validation
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(targetDbPath);
            if (!validation.isValid) {
                throw new errors_1.ValidationError(`Provisioned database failed validation: ${validation.error} (${validation.details})`);
            }
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { operationId },
                data: { status: 'DATABASE_VALIDATED' },
            });
            // Step 5: Pristine-state validation (Fix #4: authoritative classification)
            const pristineCheck = await this.validatePristineState(targetDbPath);
            if (!pristineCheck.isPristine) {
                throw new errors_1.ConflictError('Newly provisioned database failed pristine check.');
            }
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { operationId },
                data: { status: 'PRISTINE_VALIDATED' },
            });
            // Step 6: Control DB Transaction: atomic registration of Profile, DatabaseRegistry, and UserProfile
            // STRICT FIX #1: Only targetUserId receives the UserProfile association.
            const result = await prisma_1.systemPrisma.$transaction(async (tx) => {
                let profile = await tx.profile.findUnique({ where: { code: profileCode } });
                if (!profile) {
                    profile = await tx.profile.create({
                        data: {
                            code: profileCode,
                            name: profileName,
                            dbPath: targetDbPath,
                            schemaVersion: validation.schemaVersion || 1,
                            status: 'ACTIVE',
                            isActive: true,
                        },
                    });
                }
                else {
                    profile = await tx.profile.update({
                        where: { id: profile.id },
                        data: {
                            dbPath: targetDbPath,
                            status: 'ACTIVE',
                            isActive: true,
                        },
                    });
                }
                const registry = await tx.databaseRegistry.create({
                    data: {
                        databaseId: crypto_1.default.randomUUID(),
                        displayName,
                        canonicalPath: targetDbPath,
                        schemaVersion: validation.schemaVersion || 1,
                        status: 'ACTIVE',
                        databaseType: 'LOCAL_PROFILE',
                        profileId: profile.id,
                        installationId: install.id,
                        lastValidatedAt: new Date(),
                    },
                });
                // Associating SOLELY the target user (Strict User-DB isolation: each user attached with only one DB)
                await tx.userProfile.deleteMany({
                    where: {
                        userId: targetUserId,
                        profileId: { not: profile.id },
                    },
                });
                await tx.userProfile.upsert({
                    where: {
                        userId_profileId: {
                            userId: targetUserId,
                            profileId: profile.id,
                        },
                    },
                    update: { isActive: true },
                    create: {
                        userId: targetUserId,
                        profileId: profile.id,
                        role: 'ADMIN',
                        isActive: true,
                    },
                });
                // Audit Events
                await tx.auditEvent.create({
                    data: {
                        entityType: 'DatabaseRegistry',
                        entityId: registry.databaseId,
                        eventType: 'NEW_DATABASE_PROVISIONING_STARTED',
                        description: `Provisioning started for new database "${displayName}" from template`,
                        performedBy: targetUserId,
                        metadata: JSON.stringify({ displayName, profileCode, targetDbPath, operationId }),
                    },
                });
                await tx.auditEvent.create({
                    data: {
                        entityType: 'DatabaseRegistry',
                        entityId: registry.databaseId,
                        eventType: 'NEW_DATABASE_PROVISIONED',
                        description: `Blank database provisioned successfully: ${displayName} -> ${targetDbPath}`,
                        performedBy: targetUserId,
                        metadata: JSON.stringify({
                            databaseId: registry.databaseId,
                            canonicalPath: targetDbPath,
                            schemaVersion: validation.schemaVersion,
                            operationId,
                        }),
                    },
                });
                await tx.auditEvent.create({
                    data: {
                        entityType: 'DatabaseRegistry',
                        entityId: registry.databaseId,
                        eventType: 'NEW_DATABASE_VALIDATED',
                        description: `Newly provisioned database passed structural and pristine validation`,
                        performedBy: targetUserId,
                        metadata: JSON.stringify({
                            tableCount: validation.tableCount,
                            schemaVersion: validation.schemaVersion,
                            pristine: true,
                            operationId,
                        }),
                    },
                });
                await tx.auditEvent.create({
                    data: {
                        entityType: 'DatabaseRegistry',
                        entityId: registry.databaseId,
                        eventType: 'NEW_DATABASE_ATTACHED',
                        description: `New database registered and attached: ${displayName} [${registry.databaseId}]`,
                        performedBy: targetUserId,
                        metadata: JSON.stringify({
                            databaseId: registry.databaseId,
                            profileId: profile.id,
                            installationId: install.id,
                            operationId,
                        }),
                    },
                });
                return { profile, registry };
            });
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { operationId },
                data: {
                    databaseId: result.registry.databaseId,
                    profileId: result.profile.id,
                    status: 'CONTROL_RECORDS_CREATED',
                },
            });
            // Step 7: Register canonical profile in runtime client pool
            try {
                (0, prisma_1.registerProfile)({
                    code: profileCode,
                    name: profileName,
                    dbPath: targetDbPath,
                });
            }
            catch (poolErr) {
                logging_1.logger.warn(`Could not register canonical profile in pool: ${poolErr.message}`);
            }
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { operationId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                },
            });
            logging_1.logger.info(`Successfully provisioned blank database: ${displayName} [${result.registry.databaseId}] at ${targetDbPath}`);
            return {
                databaseId: result.registry.databaseId,
                displayName: result.registry.displayName,
                canonicalPath: result.registry.canonicalPath,
                profileId: result.profile.id,
                profileCode: result.profile.code,
                schemaVersion: result.registry.schemaVersion,
                status: result.registry.status,
                isPristine: true,
                operationId,
            };
        }
        catch (err) {
            // Step 8: Compensation & Safe Cleanup (Fix #3)
            if (createdFile && fs_1.default.existsSync(targetDbPath)) {
                try {
                    fs_1.default.unlinkSync(targetDbPath);
                    logging_1.logger.warn(`Filesystem compensation: deleted incomplete database file ${targetDbPath}`);
                }
                catch (unlinkErr) {
                    logging_1.logger.error(`Failed to clean up incomplete database file: ${unlinkErr.message}`);
                }
            }
            await prisma_1.systemPrisma.provisioningOperation.update({
                where: { operationId },
                data: {
                    status: 'COMPENSATED',
                    errorCode: err.code || 'PROVISIONING_FAILED',
                    errorMessage: err.message,
                },
            }).catch(() => { });
            // Log failure audit events
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: profileCode,
                    eventType: 'PROVISIONING_FAILED',
                    description: `Failed to provision database for profile "${profileCode}": ${err.message}`,
                    performedBy: targetUserId || 'SYSTEM',
                    metadata: JSON.stringify({ error: err.message, profileCode, targetDbPath, operationId }),
                },
            }).catch(() => { });
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: profileCode,
                    eventType: 'PROVISIONING_COMPENSATED',
                    description: `Compensated incomplete artifacts for profile "${profileCode}"`,
                    performedBy: targetUserId || 'SYSTEM',
                    metadata: JSON.stringify({ targetDbPath, operationId }),
                },
            }).catch(() => { });
            throw err;
        }
        finally {
            this.activeProvisioningPaths.delete(lockKey);
        }
    }
}
exports.DatabaseProvisioningService = DatabaseProvisioningService;
exports.databaseProvisioningService = new DatabaseProvisioningService();
//# sourceMappingURL=database-provisioning.service.js.map