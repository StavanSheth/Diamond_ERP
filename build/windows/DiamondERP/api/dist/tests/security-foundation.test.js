"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../infrastructure/database/prisma");
const installation_service_1 = require("../modules/system/installation.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const auth_service_1 = require("../modules/auth/auth.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 3: Security Invariants, Identity Isolation & DB Integrity', () => {
    (0, vitest_1.beforeEach)(async () => {
        // Reset or ensure installation
        await installation_service_1.installationService.getOrCreateInstallation();
    });
    (0, vitest_1.describe)('1. Lifecycle Progression Invariants', () => {
        (0, vitest_1.it)('enforces Invariant 1: PIN_SETUP cannot complete if PIN is not configured', async () => {
            // Move to APP_SETUP -> PIN_SETUP
            await installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', { isReset: true });
            await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
            const localDevId = installation_service_1.installationService.getOrGenerateDeviceId();
            // Ensure local device security record has NO PIN configured
            await prisma_1.systemPrisma.deviceSecurity.deleteMany({
                where: { deviceId: localDevId },
            });
            // Attempting to advance to DEVICE_SETUP without configured PIN must fail with ConflictError (authoritative default)
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(errors_1.ConflictError);
            // Now configure PIN
            await installation_service_1.installationService.registerDevice({
                deviceName: 'Local-Terminal',
            });
            await device_security_service_1.deviceSecurityService.setupPin(localDevId, '839201');
            // Now advancing to DEVICE_SETUP succeeds!
            const updated = await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
            (0, vitest_1.expect)(updated.lifecycleState).toBe('DEVICE_SETUP');
        });
        (0, vitest_1.it)('enforces Invariant 2: DEVICE_SETUP cannot complete if no active device is registered', async () => {
            const localDevId = installation_service_1.installationService.getOrGenerateDeviceId();
            // Revoke the local device
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localDevId },
                data: { status: 'REVOKED' },
            });
            // Attempting to advance to USER_DISCOVERY with a revoked device must fail
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY')).rejects.toThrow(errors_1.ConflictError);
            // Reactivate device
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localDevId },
                data: { status: 'ACTIVE' },
            });
            // Advancing to USER_DISCOVERY now succeeds
            const updated = await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
            (0, vitest_1.expect)(updated.lifecycleState).toBe('USER_DISCOVERY');
        });
    });
    (0, vitest_1.describe)('2. Strict Identity Separation: User Password vs Application Device PIN', () => {
        (0, vitest_1.it)('proves business user password changes and device PIN changes are completely independent', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const devId = `dev-iso-${Date.now()}`;
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Iso-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const pin1 = '519284';
            const pin2 = '739201';
            await device_security_service_1.deviceSecurityService.setupPin(devId, pin1);
            const username = `multiuser-${Date.now()}`;
            const pw1 = 'PasswordAlpha123!';
            const pw2 = 'PasswordBeta456!';
            const user = await auth_service_1.authService.createUser(username, pw1, 'Isolation Test User', 'ADMIN');
            // Step A: Change user business password from pw1 to pw2
            await auth_service_1.authService.changePassword(user.id, pw1, pw2);
            // Verify: Device PIN1 still verifies successfully!
            const verifyPin1AfterPwChange = await device_security_service_1.deviceSecurityService.verifyPin(devId, pin1);
            (0, vitest_1.expect)(verifyPin1AfterPwChange.success).toBe(true);
            // Step B: Change Device PIN from PIN1 to PIN2
            await device_security_service_1.deviceSecurityService.changePin(devId, pin1, pin2);
            // Verify: Business user login with pw2 still succeeds!
            const loginResult = await auth_service_1.authService.login(username, pw2);
            (0, vitest_1.expect)(loginResult.user.id).toBe(user.id);
            (0, vitest_1.expect)(loginResult.token).toBeDefined();
            // Verify: Old PIN no longer works, new PIN works
            (0, vitest_1.expect)((await device_security_service_1.deviceSecurityService.verifyPin(devId, pin1)).success).toBe(false);
            (0, vitest_1.expect)((await device_security_service_1.deviceSecurityService.verifyPin(devId, pin2)).success).toBe(true);
        });
    });
    (0, vitest_1.describe)('3. Database Separation: Profile DBs vs Control DB & Zero Data Loss', () => {
        (0, vitest_1.it)('proves Profile SQLite databases remain untouched and uncorrupted through PIN changes and device revocation', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const testDir = (0, paths_1.getDatabasesDir)();
            const profileDbFile = path_1.default.resolve(testDir, `profile_sec_iso_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            (0, vitest_1.expect)(templatePath).toBeDefined();
            fs_1.default.copyFileSync(templatePath, profileDbFile);
            const initialHash = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbFile)).digest('hex');
            const devId = `dev-db-iso-${Date.now()}`;
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'DB-Iso-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            // Perform security operations: PIN setup, verification, change, lock, revoke
            await device_security_service_1.deviceSecurityService.setupPin(devId, '639102');
            await device_security_service_1.deviceSecurityService.verifyPin(devId, '639102');
            await device_security_service_1.deviceSecurityService.changePin(devId, '639102', '940182');
            await device_security_service_1.deviceSecurityService.lockApplication(devId);
            await installation_service_1.installationService.revokeDevice(devId, 'Security test');
            // Verify physical profile DB file still exists and its content hash is unchanged
            (0, vitest_1.expect)(fs_1.default.existsSync(profileDbFile)).toBe(true);
            const postHash = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbFile)).digest('hex');
            (0, vitest_1.expect)(postHash).toBe(initialHash);
            // Cleanup
            try {
                fs_1.default.unlinkSync(profileDbFile);
            }
            catch { }
        });
    });
    (0, vitest_1.describe)('4. Security Audit & Zero Plaintext / Hash Leakage Verification', () => {
        (0, vitest_1.it)('verifies that system DB contains zero plaintext PINs and audit trails contain no sensitive data', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const devId = `dev-leak-audit-${Date.now()}`;
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Audit-Leak-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const testPin = '948201';
            await device_security_service_1.deviceSecurityService.setupPin(devId, testPin);
            // 1. Direct inspection of DeviceSecurity table in database
            const securityRow = await prisma_1.systemPrisma.deviceSecurity.findUnique({
                where: { deviceId: devId },
            });
            (0, vitest_1.expect)(securityRow).toBeDefined();
            (0, vitest_1.expect)(securityRow.pinHash).toBeDefined();
            (0, vitest_1.expect)(securityRow.pinHash).not.toBe(testPin);
            (0, vitest_1.expect)(securityRow.pinHash).not.toContain(testPin);
            // 2. Direct inspection of AuditEvent table for this device
            const auditEvents = await prisma_1.systemPrisma.auditEvent.findMany({
                where: { entityId: devId },
            });
            (0, vitest_1.expect)(auditEvents.length).toBeGreaterThan(0);
            for (const event of auditEvents) {
                (0, vitest_1.expect)(event.description).not.toContain(testPin);
                if (event.metadata) {
                    (0, vitest_1.expect)(event.metadata).not.toContain(testPin);
                    (0, vitest_1.expect)(event.metadata).not.toContain(securityRow.pinHash);
                    (0, vitest_1.expect)(event.metadata).not.toContain('pin');
                    (0, vitest_1.expect)(event.metadata).not.toContain('pinHash');
                }
            }
            // 3. API DTO inspection: getSecurityStatus returns no pinHash
            const statusDto = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(statusDto.pinHash).toBeUndefined();
            (0, vitest_1.expect)(statusDto.pin).toBeUndefined();
            (0, vitest_1.expect)(statusDto.isPinConfigured).toBe(true);
        });
    });
});
//# sourceMappingURL=security-foundation.test.js.map