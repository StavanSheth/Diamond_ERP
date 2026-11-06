"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uninstallPreflightService = exports.UninstallPreflightService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const installation_service_1 = require("../installation.service");
const preservation_service_1 = require("../preservation/preservation.service");
const customer_data_detection_service_1 = require("./customer-data-detection.service");
const errors_1 = require("../../../errors");
const logging_1 = require("../../../infrastructure/logging");
class UninstallPreflightService {
    /**
     * Authoritative preflight inspection scanning active and deleted users, registered databases,
     * un-registered physical customer DBs, and verification state.
     */
    async getPreflightStatus() {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const userAppDataDir = (0, paths_1.getDataDir)();
        const detection = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
        const databases = detection.databases;
        const totalBackupsCount = await prisma_1.systemPrisma.backupRecord.count({
            where: { status: 'VERIFIED' },
        });
        const latestVerified = await prisma_1.systemPrisma.backupRecord.findFirst({
            where: { status: 'VERIFIED' },
            orderBy: { createdAt: 'desc' },
        });
        // Check preservation packages
        const preservationPackageCount = await prisma_1.systemPrisma.preservationPackage.count({
            where: { installationId: install.id, status: 'VERIFIED' },
        });
        const latestPreservation = await prisma_1.systemPrisma.preservationPackage.findFirst({
            where: { installationId: install.id, status: 'VERIFIED' },
            orderBy: { createdAt: 'desc' },
        });
        const pendingRestores = await prisma_1.systemPrisma.restoreRecord.count({
            where: { status: { in: ['PENDING', 'STAGING', 'ROLLBACK_READY', 'ACTIVATING'] } },
        });
        const pendingBackups = await prisma_1.systemPrisma.backupRecord.count({
            where: { status: { in: ['PENDING', 'CREATING', 'VERIFYING'] } },
        });
        const pendingPreservations = await prisma_1.systemPrisma.preservationPackage.count({
            where: { status: { in: ['PENDING', 'EXPORTING', 'BACKING_UP', 'VERIFYING'] } },
        });
        const pendingOperationsCount = pendingRestores + pendingBackups + pendingPreservations;
        // Classification State Machine (per Section 16 of specification)
        let classification = 'NO_CUSTOMER_DATA';
        let canSafelyUninstall = false;
        let warningMessage = null;
        const activeAuth = await prisma_1.systemPrisma.uninstallAuthorization.findFirst({
            where: {
                installationId: install.id,
                status: 'ISSUED',
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (databases.length === 0) {
            classification = 'NO_CUSTOMER_DATA';
            canSafelyUninstall = true;
            warningMessage = 'No customer databases found on this machine. Ready for uninstallation.';
        }
        else if (pendingOperationsCount > 0) {
            classification = 'BLOCKED';
            canSafelyUninstall = false;
            warningMessage = `Uninstall blocked: ${pendingOperationsCount} operations currently in progress. Complete or cancel them before proceeding.`;
        }
        else if (activeAuth) {
            classification = 'READY_FOR_UNINSTALL';
            canSafelyUninstall = true;
            warningMessage = 'Uninstall authorization is active and verified. You may proceed with Windows uninstallation.';
        }
        else if (latestPreservation && fs_1.default.existsSync(latestPreservation.destinationPath)) {
            classification = 'PRESERVATION_VERIFIED';
            canSafelyUninstall = false;
            warningMessage = 'Customer data verified and preserved. Authorization is required before uninstallation can proceed.';
        }
        else {
            classification = 'CUSTOMER_DATA_PRESENT';
            canSafelyUninstall = false;
            warningMessage = 'Customer databases detected. Diamond ERP uninstaller strictly preserves all customer databases in AppData by default. A verified preservation package (export & backup) is required before uninstallation can proceed.';
        }
        const lastDestSetting = await prisma_1.systemPrisma.setting.findUnique({
            where: { key: 'lastPreservationDestination' },
        }).catch(() => null);
        const lastPreservationDestination = lastDestSetting?.value || null;
        return {
            canSafelyUninstall,
            classification,
            userAppDataDir,
            userAppDataPreservedByDefault: true,
            activeDatabasesCount: databases.length,
            databases,
            totalBackupsCount,
            latestVerifiedBackupAt: latestVerified?.verifiedAt
                ? latestVerified.verifiedAt.toISOString()
                : null,
            preservationPackageCount,
            latestPreservationPackageId: latestPreservation?.packageId || null,
            latestPreservationVerifiedAt: latestPreservation?.verifiedAt
                ? latestPreservation.verifiedAt.toISOString()
                : null,
            lastPreservationDestination,
            applicationVersion: install.appVersion,
            installationId: install.installationId,
            pendingOperationsCount,
            warningMessage,
        };
    }
    /**
     * Issues a short-lived, one-time cryptographic uninstall authorization token.
     * Can ONLY be issued if the preservation package is 100% verified.
     */
    async issueUninstallAuthorization(packageId) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // 1. Locate package in DB
        const pkg = await prisma_1.systemPrisma.preservationPackage.findUnique({
            where: { packageId },
        });
        if (!pkg) {
            throw new errors_1.NotFoundError(`Preservation package "${packageId}" not found.`);
        }
        if (pkg.status !== 'VERIFIED') {
            throw new errors_1.ConflictError(`Cannot authorize uninstall: Preservation package status is "${pkg.status}", must be "VERIFIED".`);
        }
        // 2. Re-verify package artifacts on disk
        const verification = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.destinationPath);
        if (!verification.verified) {
            throw new errors_1.ConflictError(`Uninstall authorization rejected: Package verification failed: ${verification.error}`);
        }
        // 3. Generate one-time cryptographic token
        const authorizationId = crypto_1.default.randomUUID();
        const nonce = crypto_1.default.randomBytes(16).toString('hex');
        const createdAt = new Date();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity window
        // Invalidate any previous unused authorizations
        await prisma_1.systemPrisma.uninstallAuthorization.updateMany({
            where: { installationId: install.id, status: 'ISSUED' },
            data: { status: 'REVOKED' },
        });
        await prisma_1.systemPrisma.uninstallAuthorization.create({
            data: {
                authorizationId,
                installationId: install.id,
                preservationPackageId: pkg.id,
                manifestSha256: pkg.manifestSha256 || '',
                status: 'ISSUED',
                createdAt,
                expiresAt,
            },
        });
        // 4. Write machine-readable uninstall-authorization.json into AppData for the Windows installer atomically
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const tokenPayload = {
            authorizationId,
            installationId: install.installationId,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            preservationPackageId: pkg.packageId,
            preservationDestinationPath: pkg.destinationPath,
            preservationManifestHash: pkg.manifestSha256,
            verifiedAt: pkg.verifiedAt ? pkg.verifiedAt.toISOString() : createdAt.toISOString(),
            nonce,
            consumedAt: null,
            status: 'ISSUED',
        };
        const tmpTokenFilePath = `${tokenFilePath}.tmp_${crypto_1.default.randomUUID()}`;
        const fd = fs_1.default.openSync(tmpTokenFilePath, 'w');
        fs_1.default.writeSync(fd, JSON.stringify(tokenPayload, null, 2), 0, 'utf-8');
        fs_1.default.fsyncSync(fd);
        fs_1.default.closeSync(fd);
        fs_1.default.renameSync(tmpTokenFilePath, tokenFilePath);
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'UNINSTALL',
                entityId: authorizationId,
                eventType: 'UNINSTALL_AUTHORIZATION_ISSUED',
                description: `One-time uninstall authorization issued for package ${packageId}`,
                metadata: JSON.stringify(tokenPayload),
                performedBy: 'system',
            },
        });
        logging_1.logger.info(`[UninstallPreflightService] One-time uninstall authorization issued: ${authorizationId}`);
        return {
            authorizationId,
            installationId: install.installationId,
            preservationPackageId: pkg.packageId,
            manifestSha256: pkg.manifestSha256 || '',
            preservationDestinationPath: pkg.destinationPath,
            preservationManifestHash: pkg.manifestSha256 || '',
            nonce,
            status: 'ISSUED',
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            consumedAt: null,
            tokenFilePath,
        };
    }
    /**
     * Validates the machine-readable authorization token.
     * Performs deep independent verification:
     * - Token exists and valid JSON
     * - Not consumed, not expired, status == 'ISSUED'
     * - installationId matches current installation
     * - Destination directory exists
     * - preservation-manifest.json exists and SHA256 checksum matches
     * - PackageId in manifest matches authorization
     * - Control DB authorization record (if present) is not CONSUMED/REVOKED
     */
    async checkAuthorizationToken() {
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        if (!fs_1.default.existsSync(tokenFilePath)) {
            const msg = 'uninstall-authorization.json file does not exist in AppData.';
            return { valid: false, reason: msg, error: msg };
        }
        let token;
        try {
            token = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        }
        catch {
            const msg = 'Corrupted uninstall-authorization.json file.';
            return { valid: false, reason: msg, error: msg };
        }
        if (!token.authorizationId) {
            const msg = 'Authorization token is missing authorizationId.';
            return { valid: false, reason: msg, error: msg };
        }
        if (token.status !== 'ISSUED') {
            const msg = `Authorization token status is "${token.status}", must be "ISSUED".`;
            return { valid: false, reason: msg, error: msg };
        }
        if (token.consumedAt) {
            const msg = 'Uninstall authorization has already been consumed (single-use).';
            return { valid: false, reason: msg, error: msg };
        }
        if (new Date(token.expiresAt).getTime() < Date.now()) {
            const msg = 'Uninstall authorization has expired.';
            return { valid: false, reason: msg, error: msg };
        }
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (token.installationId && token.installationId !== install.installationId) {
            const msg = 'Authorization installation ID does not match current machine installation.';
            return { valid: false, reason: msg, error: msg };
        }
        if (!token.preservationDestinationPath || !fs_1.default.existsSync(token.preservationDestinationPath)) {
            const msg = 'Referenced preservation package destination directory does not exist.';
            return { valid: false, reason: msg, error: msg };
        }
        const manifestPath = path_1.default.join(token.preservationDestinationPath, 'preservation-manifest.json');
        if (!fs_1.default.existsSync(manifestPath)) {
            const msg = 'Preservation manifest file missing from destination directory.';
            return { valid: false, reason: msg, error: msg };
        }
        const actualManifestSha = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(manifestPath)).digest('hex');
        const expectedManifestSha = token.preservationManifestHash || token.manifestSha256;
        if (expectedManifestSha && expectedManifestSha !== actualManifestSha) {
            const msg = 'Preservation manifest SHA-256 mismatch (manifest tampered with or modified).';
            return { valid: false, reason: msg, error: msg };
        }
        try {
            const manifestJson = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
            if (token.preservationPackageId && manifestJson.packageId !== token.preservationPackageId) {
                const msg = 'Preservation package ID does not match manifest.';
                return { valid: false, reason: msg, error: msg };
            }
        }
        catch {
            const msg = 'Corrupt preservation manifest in package.';
            return { valid: false, reason: msg, error: msg };
        }
        // Also verify database status if accessible
        const dbAuth = await prisma_1.systemPrisma.uninstallAuthorization.findUnique({
            where: { authorizationId: token.authorizationId },
        }).catch(() => null);
        if (dbAuth) {
            if (dbAuth.status === 'CONSUMED' || dbAuth.consumedAt) {
                const msg = 'Authorization has already been marked CONSUMED in control plane.';
                return { valid: false, reason: msg, error: msg };
            }
            if (dbAuth.status === 'REVOKED') {
                const msg = 'Authorization has been REVOKED.';
                return { valid: false, reason: msg, error: msg };
            }
        }
        return { valid: true, token };
    }
    /**
     * Consumes the authorization token atomically so it can never be re-used.
     */
    async consumeAuthorizationToken(authorizationId) {
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        if (fs_1.default.existsSync(tokenFilePath)) {
            try {
                const token = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
                if (token.consumedAt || token.status === 'CONSUMED') {
                    return false;
                }
                token.consumedAt = new Date().toISOString();
                token.status = 'CONSUMED';
                const tmpFilePath = `${tokenFilePath}.tmp_${crypto_1.default.randomUUID()}`;
                const fd = fs_1.default.openSync(tmpFilePath, 'w');
                fs_1.default.writeSync(fd, JSON.stringify(token, null, 2), 0, 'utf-8');
                fs_1.default.fsyncSync(fd);
                fs_1.default.closeSync(fd);
                fs_1.default.renameSync(tmpFilePath, tokenFilePath);
                if (!authorizationId && token.authorizationId) {
                    authorizationId = token.authorizationId;
                }
            }
            catch (err) {
                logging_1.logger.warn(`[UninstallPreflightService] Error atomically updating authorization file: ${err}`);
            }
        }
        if (authorizationId) {
            await prisma_1.systemPrisma.uninstallAuthorization.updateMany({
                where: { authorizationId },
                data: {
                    consumedAt: new Date(),
                    status: 'CONSUMED',
                },
            }).catch(() => { });
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'UNINSTALL',
                    entityId: authorizationId,
                    eventType: 'UNINSTALL_AUTHORIZATION_CONSUMED',
                    description: `Uninstall authorization ${authorizationId} consumed.`,
                    performedBy: 'system',
                },
            }).catch(() => { });
        }
        return true;
    }
    /**
     * Legacy pre-uninstall backup bundle backward compatibility.
     */
    async createUninstallBackup(req, performedBy = 'system') {
        const res = await preservation_service_1.preservationService.createPreservationPackage({
            destinationDir: req.destinationDir,
            confirmPreservation: req.confirmPreUninstallBackup ?? req.confirmPreservation ?? true,
        }, performedBy);
        return {
            success: true,
            exportBundlePath: res.destinationPath,
            manifestPath: res.manifestPath || '',
            sizeBytes: res.sizeBytes,
            databasesBackedUp: 1,
            verifiedAt: res.verifiedAt || new Date().toISOString(),
        };
    }
    /**
     * Dedicated preservation destination validator
     */
    async validateDestination(destinationDir) {
        if (!destinationDir || typeof destinationDir !== 'string' || !destinationDir.trim()) {
            return {
                valid: false,
                canonicalPath: '',
                exists: false,
                writable: false,
                error: 'Destination path cannot be blank.',
            };
        }
        const canonical = path_1.default.resolve(destinationDir.trim());
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const databasesDir = (0, paths_1.getDatabasesDir)().toLowerCase();
        // Invariant: Destination cannot be identical to databases directory, control DB, or a DB file
        if (canonical.toLowerCase() === controlDb || canonical.toLowerCase() === databasesDir) {
            return {
                valid: false,
                canonicalPath: canonical,
                exists: fs_1.default.existsSync(canonical),
                writable: false,
                error: 'Preservation destination cannot be the active databases directory or control database.',
            };
        }
        if (canonical.toLowerCase().endsWith('.db')) {
            return {
                valid: false,
                canonicalPath: canonical,
                exists: fs_1.default.existsSync(canonical),
                writable: false,
                error: 'Preservation destination must be a folder, not a database file.',
            };
        }
        // When databasesDir is a dedicated subfolder (e.g. %LOCALAPPDATA%\DiamondERP\databases)
        if (databasesDir.endsWith('databases') && canonical.toLowerCase().startsWith(databasesDir + path_1.default.sep)) {
            return {
                valid: false,
                canonicalPath: canonical,
                exists: fs_1.default.existsSync(canonical),
                writable: false,
                error: 'Preservation destination cannot be inside the active databases directory.',
            };
        }
        const exists = fs_1.default.existsSync(canonical);
        try {
            if (exists) {
                const stat = fs_1.default.statSync(canonical);
                if (!stat.isDirectory()) {
                    return {
                        valid: false,
                        canonicalPath: canonical,
                        exists: true,
                        writable: false,
                        error: 'Destination path must be a directory, not a regular file.',
                    };
                }
            }
            else {
                fs_1.default.mkdirSync(canonical, { recursive: true });
            }
            // Probe write permissions
            const probeFile = path_1.default.join(canonical, `.probe_${Date.now()}_${crypto_1.default.randomBytes(4).toString('hex')}`);
            fs_1.default.writeFileSync(probeFile, 'DIAMOND_PRESERVATION_WRITE_TEST');
            fs_1.default.unlinkSync(probeFile);
            return {
                valid: true,
                canonicalPath: canonical,
                exists: true,
                writable: true,
                message: 'Destination directory is valid and writable.',
            };
        }
        catch (err) {
            return {
                valid: false,
                canonicalPath: canonical,
                exists,
                writable: false,
                error: `Destination directory is not writable: ${err.message || String(err)}`,
            };
        }
    }
    /**
     * Native Windows destination selection / directory picker helper.
     */
    async browseDestination() {
        const userHome = os_1.default.homedir();
        const suggestedPaths = [
            path_1.default.join(userHome, 'Documents', 'DiamondERP Backup'),
            path_1.default.join(userHome, 'Desktop', 'DiamondERP Backup'),
            path_1.default.join(userHome, 'DiamondERP Backup'),
            (0, paths_1.getExportDir)(),
        ];
        return {
            selectedPath: null,
            canceled: false,
            suggestedPaths,
        };
    }
    /**
     * Section 12: Automated Uninstall Flow.
     * Detects customer data -> Creates preservation package across all profiles -> Verifies package -> Issues authorization token.
     * If any step fails, fails closed and customer data is NOT deleted.
     */
    async runAutomatedUninstallPreservation(options = {}) {
        const performedBy = options.performedBy || 'system';
        logging_1.logger.info('[UninstallPreflightService] Starting automated uninstall preservation flow...');
        // 1. Detect customer data
        const preflight = await this.getPreflightStatus();
        if (preflight.classification === 'BLOCKED') {
            throw new errors_1.ConflictError(preflight.warningMessage || 'Uninstall blocked: pending operations in progress.');
        }
        // 2. Automatically create & verify preservation package for all profiles
        const preservationResult = await preservation_service_1.preservationService.createPreservationPackage({
            confirmPreservation: true,
            destinationDir: options.destinationDir || preflight.lastPreservationDestination || undefined,
            preserveAll: true,
        }, performedBy);
        if (preservationResult.status !== 'VERIFIED') {
            throw new errors_1.ConflictError('Automated preservation failed: Package could not be verified. Customer data has NOT been deleted.');
        }
        // 3. Issue uninstall authorization token automatically
        const authResult = await this.issueUninstallAuthorization(preservationResult.packageId);
        logging_1.logger.info(`[UninstallPreflightService] Automated uninstall flow completed successfully. Package: ${preservationResult.packageId}, Auth: ${authResult.authorizationId}`);
        return {
            success: true,
            preservationPackage: preservationResult,
            authorization: authResult,
        };
    }
}
exports.UninstallPreflightService = UninstallPreflightService;
exports.uninstallPreflightService = new UninstallPreflightService();
//# sourceMappingURL=uninstall-preflight.service.js.map