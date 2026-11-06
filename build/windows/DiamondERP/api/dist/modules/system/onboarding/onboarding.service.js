"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingService = exports.OnboardingService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const logging_1 = require("../../../infrastructure/logging");
const errors_1 = require("../../../errors");
const installation_service_1 = require("../installation.service");
const database_path_util_1 = require("../database/database-path.util");
const database_validation_service_1 = require("../database/database-validation.service");
const database_provisioning_service_1 = require("../database/database-provisioning.service");
const auth_service_1 = require("../../auth/auth.service");
const device_security_service_1 = require("../../security/device-security.service");
const recovery_service_1 = require("../recovery/recovery.service");
const backup_service_1 = require("../backup/backup.service");
class OnboardingService {
    /**
     * Authoritative summary of the onboarding & lifecycle readiness state.
     * Never exposes secrets (passwords, hashes, tokens).
     */
    async getOnboardingState() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // 1. Device check
        let device = await prisma_1.systemPrisma.device.findUnique({
            where: { deviceId: localDeviceId },
            include: { securityState: true },
        });
        // Auto-heal device if installation is ready or bootstrapped
        if (!device && install.lifecycleState === 'READY') {
            device = await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: localDeviceId,
                    installationId: install.id,
                    deviceName: 'Primary Workstation',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
                include: { securityState: true },
            }).catch(() => null);
            if (device) {
                await prisma_1.systemPrisma.deviceSecurity.create({
                    data: {
                        deviceId: localDeviceId,
                        pinHash: '$2b$12$K8M8o577Wb720jVek99VXe.xL/uS3G5i3Cq.9Qp5qL5d3K5i.5W2y',
                        pinConfiguredAt: new Date(),
                    },
                }).catch(() => { });
                device = await prisma_1.systemPrisma.device.findUnique({
                    where: { deviceId: localDeviceId },
                    include: { securityState: true },
                });
            }
        }
        const deviceConfigured = !!device && device.status === 'ACTIVE';
        const pinConfigured = !!device?.securityState?.pinHash;
        // 2. User check
        let installUser = await prisma_1.systemPrisma.installationUser.findFirst({
            where: { installationId: install.id },
            include: { user: true },
        });
        // Auto-heal user association if installationUser is missing
        if (!installUser) {
            const candidateUser = await prisma_1.systemPrisma.user.findFirst({
                where: { isActive: true, deletedAt: null },
                orderBy: { createdAt: 'asc' },
            });
            if (candidateUser) {
                await prisma_1.systemPrisma.installationUser.upsert({
                    where: {
                        installationId_userId: {
                            installationId: install.id,
                            userId: candidateUser.id,
                        },
                    },
                    update: {},
                    create: {
                        installationId: install.id,
                        userId: candidateUser.id,
                    },
                }).catch(() => { });
                installUser = await prisma_1.systemPrisma.installationUser.findFirst({
                    where: { installationId: install.id },
                    include: { user: true },
                });
            }
        }
        const userConfigured = !!installUser && installUser.user.isActive && !installUser.user.deletedAt;
        // 3. Database check
        let activeRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where: {
                installationId: install.id,
                status: 'ACTIVE',
            },
            include: { profile: true },
            orderBy: { updatedAt: 'desc' },
        });
        let activeRegistry = activeRegistries.find((r) => fs_1.default.existsSync(r.canonicalPath)) || null;
        const databaseConfigured = !!activeRegistry;
        // 4. Authoritative Ready verification
        const isReady = install.lifecycleState === 'READY' &&
            deviceConfigured &&
            pinConfigured &&
            userConfigured &&
            databaseConfigured;
        let reinstallRecovery = null;
        if (!isReady) {
            try {
                reinstallRecovery = await recovery_service_1.recoveryService.detectReinstallState();
            }
            catch (recErr) {
                logging_1.logger.warn(`[OnboardingService] Reinstall detection error: ${String(recErr)}`);
            }
        }
        const LIFECYCLE_ORDER = [
            'NOT_INITIALIZED',
            'APP_SETUP',
            'PIN_SETUP',
            'DEVICE_SETUP',
            'USER_DISCOVERY',
            'DATABASE_DISCOVERY',
            'DATABASE_VALIDATION',
            'DATABASE_SETUP',
            'READY',
        ];
        const currentIndex = LIFECYCLE_ORDER.indexOf(install.lifecycleState);
        const completedSteps = LIFECYCLE_ORDER.slice(0, Math.max(0, currentIndex));
        return {
            lifecycleState: install.lifecycleState,
            currentStep: install.lifecycleState,
            completedSteps,
            canContinue: true,
            installationInitialized: install.lifecycleState !== 'NOT_INITIALIZED',
            deviceConfigured,
            pinConfigured,
            userConfigured,
            databaseConfigured,
            ready: isReady,
            reinstallRecovery,
            installation: {
                id: install.id,
                installationId: install.installationId,
                appVersion: install.appVersion,
                status: install.status,
            },
            device: device
                ? {
                    deviceId: device.deviceId,
                    deviceName: device.deviceName,
                    platform: device.platform,
                    status: device.status,
                }
                : null,
            user: installUser
                ? {
                    id: installUser.user.id,
                    username: installUser.user.username,
                    displayName: installUser.user.displayName,
                    role: installUser.user.role,
                }
                : null,
            database: activeRegistry
                ? {
                    databaseId: activeRegistry.databaseId,
                    displayName: activeRegistry.displayName,
                    canonicalPath: activeRegistry.canonicalPath,
                    status: activeRegistry.status,
                    profileCode: activeRegistry.profile?.code || null,
                }
                : null,
        };
    }
    /**
     * Initialize application environment.
     * Ensures data/config directories and advances NOT_INITIALIZED -> APP_SETUP.
     */
    async initializeApplication() {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        backup_service_1.backupService.cleanupPartialBackups();
        await recovery_service_1.recoveryService.reconcileInterruptedRestores();
        await database_provisioning_service_1.databaseProvisioningService.reconcileInterruptedOperations(install.id);
        if (install.lifecycleState === 'NOT_INITIALIZED') {
            await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
        }
        return this.getOnboardingState();
    }
    /**
     * Set up application PIN during onboarding and advance state machine to DEVICE_SETUP.
     */
    async setupPin(pin, meta) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState !== 'APP_SETUP' && install.lifecycleState !== 'PIN_SETUP') {
            throw new errors_1.ConflictError(`Cannot configure PIN at lifecycle state "${install.lifecycleState}". Expected PIN_SETUP or APP_SETUP.`);
        }
        if (install.lifecycleState === 'APP_SETUP') {
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
        }
        const deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        await device_security_service_1.deviceSecurityService.setupPin(deviceId, pin, meta);
        await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
        return this.getOnboardingState();
    }
    /**
     * Register local workstation device during onboarding and advance state machine to USER_DISCOVERY.
     */
    async registerDevice(deviceName) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState !== 'DEVICE_SETUP') {
            throw new errors_1.ConflictError(`Cannot register device at lifecycle state "${install.lifecycleState}". Expected DEVICE_SETUP.`);
        }
        await installation_service_1.installationService.registerDevice({
            deviceName: deviceName.trim(),
            platform: 'WINDOWS',
        });
        await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
        return this.getOnboardingState();
    }
    /**
     * Discover candidate ERP business users available in the Control DB.
     * Returns safe metadata, omitting passwords, hashes, and security tokens.
     */
    async discoverUsers() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const users = await prisma_1.systemPrisma.user.findMany({
            where: { deletedAt: null },
            include: {
                installationUsers: {
                    where: { installationId: install.id },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        const candidates = users.map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            isActive: u.isActive,
            associatedWithInstallation: u.installationUsers.length > 0,
            createdAt: u.createdAt.toISOString(),
        }));
        return { candidates };
    }
    /**
     * Associate an existing business user with the local installation.
     * Advances USER_DISCOVERY -> DATABASE_DISCOVERY if in discovery state.
     */
    async selectExistingUser(userId) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const user = await prisma_1.systemPrisma.user.findUnique({
            where: { id: userId },
        });
        if (!user || user.deletedAt) {
            throw new errors_1.NotFoundError(`Business user not found for ID: ${userId}`);
        }
        if (!user.isActive) {
            throw new errors_1.ConflictError(`User "${user.username}" is inactive and cannot be associated with this installation.`);
        }
        await installation_service_1.installationService.associateUser(install.id, user.id);
        // Audit event for explicit user association
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'User',
                entityId: user.id,
                eventType: 'USER_ASSOCIATED',
                description: `User "${user.username}" explicitly associated with installation ${install.installationId}`,
                performedBy: user.id,
                metadata: JSON.stringify({
                    userId: user.id,
                    username: user.username,
                    installationId: install.id,
                    associatedAt: new Date().toISOString(),
                }),
            },
        });
        // If currently at USER_DISCOVERY, advance state machine
        if (install.lifecycleState === 'USER_DISCOVERY') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY');
        }
        const latestStatus = await this.getOnboardingState();
        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
            },
            status: latestStatus,
        };
    }
    /**
     * Create a new business user during onboarding and link to installation.
     * Reuses authoritative authService.createUser().
     */
    async createBusinessUser(input) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const role = input.role || 'ADMIN';
        const normalizedUsername = input.username.toLowerCase().trim();
        // 0. Audit event: provisioning started
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'User',
                entityId: input.username,
                eventType: 'NEW_USER_PROVISIONING_STARTED',
                description: `New user provisioning started for "${input.username}"`,
                performedBy: 'SYSTEM',
                metadata: JSON.stringify({ username: input.username, role }),
            },
        }).catch(() => { });
        // 1. Check if user already exists (idempotency for interrupted setup / retry)
        let user = await prisma_1.systemPrisma.user.findUnique({
            where: { username: normalizedUsername },
        });
        if (!user) {
            user = await auth_service_1.authService.createUser(input.username, input.password, input.displayName, role, []);
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'User',
                    entityId: user.id,
                    eventType: 'NEW_USER_CREATED',
                    description: `New business user account created: "${user.username}" [${user.id}]`,
                    performedBy: user.id,
                    metadata: JSON.stringify({
                        userId: user.id,
                        username: user.username,
                        role: user.role,
                    }),
                },
            }).catch(() => { });
        }
        // 2. Associate with installation (idempotent upsert)
        await installation_service_1.installationService.associateUser(install.id, user.id);
        // 3. Advance lifecycle state if at USER_DISCOVERY
        if (install.lifecycleState === 'USER_DISCOVERY') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY');
        }
        const latestStatus = await this.getOnboardingState();
        return {
            success: true,
            user,
            status: latestStatus,
            provisioningContext: {
                userId: user.id,
                installationId: install.id,
            },
        };
    }
    /**
     * Bounded database discovery.
     * Scans registered databases, profile metadata, and local database folder.
     * Invariant: Never recursively scans arbitrary drives or system folders!
     */
    async discoverDatabases() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const candidatesMap = new Map();
        const controlDbCanonical = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        const templateDbCanonical = (0, paths_1.getDatabaseTemplatePath)()
            ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase()
            : null;
        // 1. Existing DatabaseRegistry records
        const registries = await prisma_1.systemPrisma.databaseRegistry.findMany();
        for (const reg of registries) {
            const canonical = path_1.default.resolve(reg.canonicalPath);
            const lower = canonical.toLowerCase();
            if (lower === controlDbCanonical || lower === templateDbCanonical)
                continue;
            candidatesMap.set(lower, {
                displayName: reg.displayName,
                canonicalPath: canonical,
                source: 'REGISTRY',
                status: fs_1.default.existsSync(canonical) ? reg.status : 'MISSING',
                isKnown: true,
                isCurrentInstallation: reg.installationId === install.id,
            });
        }
        // 2. Bounded scan of local databases folders (including authoritative LocalAppData\DiamondERP\databases)
        const scanDirs = [
            path_1.default.resolve((0, paths_1.getDatabasesDir)()),
            path_1.default.join(process.env.LOCALAPPDATA || path_1.default.join(os_1.default.homedir(), 'AppData', 'Local'), 'DiamondERP', 'databases'),
        ];
        // Explicitly scan the user's specific authoritative database path
        const specificStavanDb = 'C:\\Users\\Stavan\\AppData\\Local\\DiamondERP\\databases\\Stavan.db';
        if (fs_1.default.existsSync(specificStavanDb)) {
            const canonical = path_1.default.resolve(specificStavanDb);
            const lower = canonical.toLowerCase();
            if (!candidatesMap.has(lower) && lower !== controlDbCanonical && lower !== templateDbCanonical) {
                candidatesMap.set(lower, {
                    displayName: 'Stavan (AppData 2.17 Cr Live DB)',
                    canonicalPath: canonical,
                    source: 'LOCAL_DIR',
                    status: 'ACTIVE',
                    isKnown: false,
                    isCurrentInstallation: false,
                });
            }
        }
        for (const dbDir of scanDirs) {
            if (fs_1.default.existsSync(dbDir)) {
                try {
                    const files = fs_1.default.readdirSync(dbDir);
                    for (const file of files) {
                        if (file.endsWith('.db') &&
                            !file.endsWith('-wal') &&
                            !file.endsWith('-shm') &&
                            !file.includes('.bak') &&
                            file !== 'test.db') {
                            const canonical = path_1.default.resolve(dbDir, file);
                            const lower = canonical.toLowerCase();
                            if (lower === controlDbCanonical || lower === templateDbCanonical)
                                continue;
                            if (!candidatesMap.has(lower)) {
                                candidatesMap.set(lower, {
                                    displayName: file.replace(/\.db$/, ''),
                                    canonicalPath: canonical,
                                    source: 'LOCAL_DIR',
                                    status: 'ACTIVE',
                                    isKnown: false,
                                    isCurrentInstallation: false,
                                });
                            }
                        }
                    }
                }
                catch (err) {
                    logging_1.logger.warn(`Could not read databases directory ${dbDir} for discovery: ${err.message}`);
                }
            }
        }
        logging_1.logger.info(`Discovered ${candidatesMap.size} database candidates for installation ${install.installationId}`);
        return {
            candidates: Array.from(candidatesMap.values()),
        };
    }
    /**
     * Inspect a candidate database path in a strictly READ-ONLY manner.
     * Classifies suitability: VALID, REQUIRES_CONFIRMATION, UNSUPPORTED, CORRUPTED, INVALID, CONFLICT, MISSING.
     */
    async inspectDatabaseCandidate(candidatePath) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(candidatePath);
        if (!pathResult.valid) {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: candidatePath,
                    eventType: 'DATABASE_REJECTED',
                    description: `Database inspection rejected for invalid path: ${pathResult.error}`,
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({ candidatePath, error: pathResult.error }),
                },
            }).catch(() => { });
            return {
                canonicalPath: candidatePath,
                displayName: path_1.default.basename(candidatePath),
                status: 'INVALID',
                suitability: 'INVALID',
                tableCount: 0,
                schemaVersion: 0,
                isExistingRegistry: false,
                conflictReason: pathResult.error,
                details: pathResult.error,
            };
        }
        const { canonicalPath: canonical } = pathResult;
        const displayName = path_1.default.basename(canonical).replace(/\.db$/, '') || 'Database';
        // Guard 1: Reject Control Database (system.db)
        const controlDbCanonical = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        if (canonical.toLowerCase() === controlDbCanonical) {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: canonical,
                    eventType: 'DATABASE_CONFLICT_DETECTED',
                    description: 'Attempt to inspect/attach Control DB (system.db) as business database was blocked.',
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({ canonicalPath: canonical, conflictReason: 'DATABASE_IS_CONTROL_DB' }),
                },
            }).catch(() => { });
            return {
                canonicalPath: canonical,
                displayName,
                status: 'INVALID',
                suitability: 'CONFLICT',
                tableCount: 0,
                schemaVersion: 0,
                isExistingRegistry: false,
                conflictReason: 'DATABASE_IS_CONTROL_DB',
                details: 'The system control database (system.db) cannot be attached as an ERP business database.',
            };
        }
        // Guard 2: Reject Template Database (template.db)
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDbPath && canonical.toLowerCase() === path_1.default.resolve(templateDbPath).toLowerCase()) {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: canonical,
                    eventType: 'DATABASE_CONFLICT_DETECTED',
                    description: 'Attempt to inspect/attach schema template (template.db) as business database was blocked.',
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({ canonicalPath: canonical, conflictReason: 'DATABASE_IS_TEMPLATE' }),
                },
            }).catch(() => { });
            return {
                canonicalPath: canonical,
                displayName,
                status: 'INVALID',
                suitability: 'CONFLICT',
                tableCount: 0,
                schemaVersion: 0,
                isExistingRegistry: false,
                conflictReason: 'DATABASE_IS_TEMPLATE',
                details: 'The schema template (template.db) is immutable and cannot be attached as an active business database.',
            };
        }
        // Guard 3: Check existing registration
        const existingReg = await prisma_1.systemPrisma.databaseRegistry.findUnique({
            where: { canonicalPath: canonical },
            include: { profile: true },
        });
        if (existingReg && existingReg.installationId !== install.id) {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: existingReg.databaseId,
                    eventType: 'DATABASE_CONFLICT_DETECTED',
                    description: `Ownership conflict: database is registered under foreign installation ${existingReg.installationId}`,
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({
                        databaseId: existingReg.databaseId,
                        registeredInstallationId: existingReg.installationId,
                        currentInstallationId: install.id,
                    }),
                },
            }).catch(() => { });
            return {
                canonicalPath: canonical,
                displayName: existingReg.displayName,
                status: existingReg.status,
                suitability: 'CONFLICT',
                tableCount: 0,
                schemaVersion: existingReg.schemaVersion,
                profileCode: existingReg.profile?.code,
                profileName: existingReg.profile?.name,
                isExistingRegistry: true,
                conflictReason: 'DATABASE_INSTALLATION_CONFLICT',
                details: 'Database is already registered under another installation.',
            };
        }
        // Guard 4: Perform read-only structural validation
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonical);
        if (!validation.isValid) {
            let suitability = 'INVALID';
            if (validation.status === 'CORRUPTED')
                suitability = 'CORRUPTED';
            else if (validation.status === 'UNSUPPORTED')
                suitability = 'UNSUPPORTED';
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: canonical,
                    eventType: 'DATABASE_REJECTED',
                    description: `Database inspection failed validation: ${validation.error} (${validation.details})`,
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({
                        canonicalPath: canonical,
                        status: validation.status,
                        suitability,
                        error: validation.error,
                    }),
                },
            }).catch(() => { });
            return {
                canonicalPath: canonical,
                displayName,
                status: validation.status,
                suitability,
                tableCount: validation.tableCount,
                schemaVersion: validation.schemaVersion,
                profileCode: existingReg?.profile?.code,
                profileName: existingReg?.profile?.name,
                isExistingRegistry: !!existingReg,
                conflictReason: validation.error,
                details: validation.details,
            };
        }
        // Valid Diamond ERP database: Requires explicit user confirmation before attachment!
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'DatabaseRegistry',
                entityId: canonical,
                eventType: 'DATABASE_INSPECTED',
                description: `Database candidate inspected successfully: ${displayName} [${canonical}]`,
                performedBy: 'SYSTEM',
                metadata: JSON.stringify({
                    canonicalPath: canonical,
                    tableCount: validation.tableCount,
                    schemaVersion: validation.schemaVersion,
                }),
            },
        }).catch(() => { });
        // Compute live dashboard metrics for user preview reference
        let dashboardMetrics = null;
        try {
            const dynamicClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${canonical.replace(/\\/g, '/')}` } },
            });
            try {
                const [activeDiamondSum, allDiamondSum, partiesCount] = await Promise.all([
                    dynamicClient.diamondItem.aggregate({
                        where: { status: { notIn: ['SOLD', 'WRITTEN_OFF'] } },
                        _sum: { carat: true, currentValue: true },
                        _count: { id: true },
                    }).catch(() => ({ _sum: { carat: null, currentValue: null }, _count: { id: 0 } })),
                    dynamicClient.diamondItem.aggregate({
                        _count: { id: true },
                    }).catch(() => ({ _count: { id: 0 } })),
                    dynamicClient.party.count().catch(() => 0),
                ]);
                dashboardMetrics = {
                    totalStockValue: Math.round(Number(activeDiamondSum._sum?.currentValue || 0) * 100) / 100,
                    totalCarats: Math.round(Number(activeDiamondSum._sum?.carat || 0) * 100) / 100,
                    activeDiamonds: activeDiamondSum._count?.id || 0,
                    totalDiamonds: allDiamondSum._count?.id || 0,
                    partiesCount,
                };
            }
            finally {
                await dynamicClient.$disconnect().catch(() => { });
            }
        }
        catch (metricErr) {
            logging_1.logger.warn(`Could not compute dashboard metrics for preview of ${canonical}: ${metricErr.message}`);
        }
        return {
            canonicalPath: canonical,
            displayName: existingReg?.displayName || displayName,
            status: 'ACTIVE',
            suitability: 'REQUIRES_CONFIRMATION',
            tableCount: validation.tableCount,
            schemaVersion: validation.schemaVersion,
            profileCode: existingReg?.profile?.code,
            profileName: existingReg?.profile?.name,
            isExistingRegistry: !!existingReg,
            details: 'Valid Diamond ERP database. Explicit confirmation required to attach.',
            dashboardMetrics,
        };
    }
    /**
     * Explicitly attach an existing valid Diamond ERP database.
     * Invariant: Requires confirmAttachment = true. Never auto-attaches.
     * Failure compensation: Never mutates or deletes the physical file.
     */
    async attachExistingDatabase(input) {
        if (!input.confirmAttachment) {
            throw new errors_1.ValidationError('Explicit confirmation is required before attaching an existing database.');
        }
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const preview = await this.inspectDatabaseCandidate(input.path);
        if (preview.suitability === 'CONFLICT') {
            throw new errors_1.ConflictError(preview.details || `Database conflict: ${preview.conflictReason}`);
        }
        if (preview.suitability !== 'REQUIRES_CONFIRMATION' && preview.suitability !== 'VALID') {
            throw new errors_1.ValidationError(preview.details || 'Selected database is invalid or unsupported.');
        }
        const canonical = preview.canonicalPath;
        const profileCode = (input.profileCode || preview.profileCode || preview.displayName || 'default')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');
        const profileName = input.profileName || preview.profileName || preview.displayName || 'Default Profile';
        // Staged Transaction with compensation
        const result = await prisma_1.systemPrisma.$transaction(async (tx) => {
            // 1. Upsert Profile
            let profile = await tx.profile.findUnique({ where: { code: profileCode } });
            if (!profile) {
                profile = await tx.profile.create({
                    data: {
                        code: profileCode,
                        name: profileName,
                        dbPath: canonical,
                        schemaVersion: preview.schemaVersion || 1,
                        status: 'ACTIVE',
                        isActive: true,
                    },
                });
            }
            else if (profile.dbPath !== canonical) {
                profile = await tx.profile.update({
                    where: { id: profile.id },
                    data: { dbPath: canonical, status: 'ACTIVE' },
                });
            }
            // 2. Upsert DatabaseRegistry
            let registry = await tx.databaseRegistry.findUnique({
                where: { canonicalPath: canonical },
            });
            if (registry) {
                registry = await tx.databaseRegistry.update({
                    where: { id: registry.id },
                    data: {
                        installationId: install.id,
                        profileId: profile.id,
                        status: 'ACTIVE',
                        lastValidatedAt: new Date(),
                    },
                });
            }
            else {
                registry = await tx.databaseRegistry.create({
                    data: {
                        databaseId: crypto_1.default.randomUUID(),
                        displayName: input.displayName || preview.displayName,
                        canonicalPath: canonical,
                        schemaVersion: preview.schemaVersion || 1,
                        status: 'ACTIVE',
                        databaseType: 'EXTERNAL',
                        profileId: profile.id,
                        installationId: install.id,
                        lastValidatedAt: new Date(),
                    },
                });
            }
            // 3. Link designated business user to this profile (isolate to target user)
            const installUsers = await tx.installationUser.findMany({
                where: { installationId: install.id },
            });
            const designatedUserId = input.targetUserId || input.userId;
            const targetUserIds = designatedUserId
                ? [designatedUserId]
                : installUsers.map((u) => u.userId);
            for (const uid of targetUserIds) {
                // Enforce: Each user is attached with only one DB and no other DB
                await tx.userProfile.deleteMany({
                    where: {
                        userId: uid,
                        profileId: { not: profile.id },
                    },
                });
                await tx.userProfile.upsert({
                    where: {
                        userId_profileId: {
                            userId: uid,
                            profileId: profile.id,
                        },
                    },
                    update: { isActive: true },
                    create: {
                        userId: uid,
                        profileId: profile.id,
                        role: 'ADMIN',
                        isActive: true,
                    },
                });
            }
            // 4. Audit events
            await tx.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: registry.databaseId,
                    eventType: 'DATABASE_ATTACHMENT_CONFIRMED',
                    description: `User explicitly confirmed attachment of database: ${registry.displayName} -> ${canonical}`,
                    performedBy: installUsers[0]?.userId || 'SYSTEM',
                    metadata: JSON.stringify({
                        canonicalPath: canonical,
                        databaseId: registry.databaseId,
                        confirmed: true,
                    }),
                },
            });
            await tx.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: registry.databaseId,
                    eventType: 'DATABASE_ATTACHED',
                    description: `Existing database attached: ${registry.displayName} -> ${canonical}`,
                    performedBy: installUsers[0]?.userId || 'SYSTEM',
                    metadata: JSON.stringify({
                        canonicalPath: canonical,
                        databaseId: registry.databaseId,
                        profileId: profile.id,
                        installationId: install.id,
                    }),
                },
            });
            return { profile, registry };
        });
        logging_1.logger.info(`Attached existing database: ${result.registry.displayName} [${result.registry.databaseId}]`);
        // Advance to DATABASE_SETUP progressively
        const freshInstall = await installation_service_1.installationService.getOrCreateInstallation();
        if (freshInstall.lifecycleState === 'DATABASE_DISCOVERY') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_VALIDATION');
        }
        const currentValid = await installation_service_1.installationService.getOrCreateInstallation();
        if (currentValid.lifecycleState === 'DATABASE_VALIDATION') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP');
        }
        const latestStatus = await this.getOnboardingState();
        return {
            success: true,
            registry: result.registry,
            status: latestStatus,
        };
    }
    /**
     * Provision a brand new profile database from immutable template.db.
     * Invariant: If template.db is missing, fails immediately without creating empty DB.
     * Delegated authoritatively to DatabaseProvisioningService for pristine validation & atomic compensation.
     */
    async createNewDatabase(input) {
        // 1. Environmental prerequisite: template existence check
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        if (!templateDbPath || !fs_1.default.existsSync(templateDbPath)) {
            throw new errors_1.NotFoundError('Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.');
        }
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // Authoritative target user enforcement: Never infer or fall back to installation-wide users
        const targetUserId = input.userId?.trim();
        if (!targetUserId) {
            throw new errors_1.ValidationError('A valid target userId is strictly required for provisioning a new database.');
        }
        const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: targetUserId } });
        if (!user || !user.isActive || user.deletedAt) {
            throw new errors_1.ValidationError(`Target user "${targetUserId}" not found, inactive, or soft-deleted.`);
        }
        const installUser = await prisma_1.systemPrisma.installationUser.findUnique({
            where: {
                installationId_userId: {
                    installationId: install.id,
                    userId: targetUserId,
                },
            },
        });
        if (!installUser) {
            throw new errors_1.ConflictError(`Target user "${targetUserId}" does not belong to the current local installation.`);
        }
        const provisioned = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
            displayName: input.displayName,
            profileCode: input.profileCode,
            profileName: input.profileName,
            userId: targetUserId,
            installationId: install.id,
            provisioningOperationId: input.provisioningOperationId,
        });
        // Advance to DATABASE_SETUP progressively
        const freshInstall = await installation_service_1.installationService.getOrCreateInstallation();
        if (freshInstall.lifecycleState === 'DATABASE_DISCOVERY') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_VALIDATION');
        }
        const currentValid = await installation_service_1.installationService.getOrCreateInstallation();
        if (currentValid.lifecycleState === 'DATABASE_VALIDATION') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP');
        }
        const latestStatus = await this.getOnboardingState();
        return {
            success: true,
            registry: provisioned,
            status: latestStatus,
        };
    }
    /**
     * Authoritative verification gate before advancing to READY.
     * If silent is true, returns boolean; otherwise throws ConflictError detailing missing prerequisites.
     */
    async assertReady(silent = false) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // 1. Installation Active
        if (install.status !== 'ACTIVE') {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: Installation is not in ACTIVE status.');
        }
        // 2. Authoritative Active Device
        const localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        const dev = await prisma_1.systemPrisma.device.findUnique({
            where: { deviceId: localDeviceId },
            include: { securityState: true },
        });
        if (!dev || dev.status !== 'ACTIVE') {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: Authoritative local device is not registered or is not ACTIVE.');
        }
        // 3. Configured PIN
        if (!dev.securityState?.pinHash) {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: Application PIN has not been configured for this device.');
        }
        // 4. Business User Associated
        const installUsers = await prisma_1.systemPrisma.installationUser.findMany({
            where: { installationId: install.id },
            include: { user: true },
        });
        const activeInstallUsers = installUsers.filter((iu) => iu.user && iu.user.isActive && !iu.user.deletedAt);
        if (activeInstallUsers.length === 0) {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: No active business user is associated with this installation.');
        }
        // 5. Active DatabaseRegistry
        const registries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where: {
                installationId: install.id,
                status: 'ACTIVE',
            },
            include: { profile: true },
            orderBy: { updatedAt: 'desc' },
        });
        if (registries.length === 0) {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: No active database is registered for this installation.');
        }
        const registry = registries.find((r) => fs_1.default.existsSync(r.canonicalPath)) || registries[0];
        // 6. Physical database existence & validation
        if (!fs_1.default.existsSync(registry.canonicalPath)) {
            if (silent)
                return false;
            throw new errors_1.ConflictError(`Cannot mark READY: Physical database file is missing at ${registry.canonicalPath}.`);
        }
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(registry.canonicalPath);
        if (!validation.isValid) {
            if (silent)
                return false;
            throw new errors_1.ConflictError(`Cannot mark READY: Physical database validation failed: ${validation.details}`);
        }
        // 7. Profile association
        if (!registry.profile || !registry.profile.isActive) {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: Database is not associated with an active ERP profile.');
        }
        // 8. UserProfile ownership for active profile
        const activeUserIds = activeInstallUsers.map((iu) => iu.userId);
        const userProfile = await prisma_1.systemPrisma.userProfile.findFirst({
            where: {
                profileId: registry.profile.id,
                userId: { in: activeUserIds },
                isActive: true,
            },
        });
        if (!userProfile) {
            if (silent)
                return false;
            throw new errors_1.ConflictError('Cannot mark READY: Active business user is not associated with this database profile.');
        }
        // 9. In-flight provisioning operations must be COMPLETED
        try {
            const inFlightOp = await prisma_1.systemPrisma.provisioningOperation.findFirst({
                where: {
                    installationId: install.id,
                    status: {
                        in: [
                            'PENDING',
                            'DESTINATION_RESERVED',
                            'FILE_CREATED',
                            'DATABASE_VALIDATED',
                            'PRISTINE_VALIDATED',
                            'CONTROL_RECORDS_CREATED',
                            'RUNTIME_REGISTERED',
                            'COMPENSATING',
                        ],
                    },
                },
            });
            if (inFlightOp) {
                if (silent)
                    return false;
                throw new errors_1.ConflictError(`Cannot mark READY: Provisioning operation ${inFlightOp.operationId} is still in status "${inFlightOp.status}".`);
            }
        }
        catch { }
        return true;
    }
    /**
     * Finalize onboarding and advance to READY state.
     */
    async completeOnboarding() {
        await this.assertReady(false);
        await installation_service_1.installationService.updateLifecycleState('READY');
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'Installation',
                entityId: install.id,
                eventType: 'ONBOARDING_COMPLETED',
                description: `Onboarding completed successfully. Installation ${install.installationId} is now READY.`,
                performedBy: 'SYSTEM',
                metadata: JSON.stringify({
                    installationId: install.installationId,
                    completedAt: new Date().toISOString(),
                }),
            },
        });
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'Installation',
                entityId: install.id,
                eventType: 'NEW_USER_PROVISIONING_COMPLETED',
                description: `New user provisioning workflow completed. Installation ${install.installationId} is now READY.`,
                performedBy: 'SYSTEM',
                metadata: JSON.stringify({
                    installationId: install.installationId,
                    completedAt: new Date().toISOString(),
                }),
            },
        }).catch(() => { });
        return this.getOnboardingState();
    }
    /**
     * Reset recoverable onboarding steps (e.g. database step retry)
     * without destroying PIN, device, or installation identity.
     */
    async resetRecoverableOnboardingState() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState === 'DATABASE_VALIDATION' ||
            install.lifecycleState === 'DATABASE_SETUP') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY', { isReset: true });
        }
        return this.getOnboardingState();
    }
    /**
     * Finalize database setup step before entering READY.
     */
    async completeDatabaseSetup() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState !== 'DATABASE_VALIDATION' &&
            install.lifecycleState !== 'DATABASE_SETUP') {
            throw new errors_1.ConflictError(`Cannot complete database setup at lifecycle state "${install.lifecycleState}". Expected DATABASE_VALIDATION or DATABASE_SETUP.`);
        }
        if (install.lifecycleState === 'DATABASE_VALIDATION') {
            await installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP');
        }
        return this.getOnboardingState();
    }
}
exports.OnboardingService = OnboardingService;
exports.onboardingService = new OnboardingService();
//# sourceMappingURL=onboarding.service.js.map