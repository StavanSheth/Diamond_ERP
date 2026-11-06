"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const installation_service_1 = require("../modules/system/installation.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const routes_1 = require("../routes");
(0, vitest_1.describe)('Phase 1.9 — Architecture-to-Runtime Traceability Verification', () => {
    let app;
    (0, vitest_1.beforeAll)(async () => {
        (0, paths_1.ensureAllDataDirs)();
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        const noop = (_req, res) => res.json({ success: true, data: [] });
        const noopCreated = (_req, res) => res.status(201).json({ success: true });
        const mockStockController = {
            getStocks: noop,
            createStock: noopCreated,
            updateStock: noop,
            deleteStock: noop,
        };
        const mockHealthController = {
            getHealth: (_req, res) => res.json({ status: 'ok', database: 'Connected' }),
            getLiveness: (_req, res) => res.json({ status: 'ok' }),
            getReadiness: (_req, res) => res.json({ status: 'ok' }),
        };
        const mockDashboardController = {
            getDashboard: noop,
        };
        const mockLedgerController = {
            getAll: noop,
            getStockNames: noop,
            getParties: noop,
            getPaymentSummary: noop,
            create: noopCreated,
            update: noop,
            delete: noop,
        };
        const mockCertificateController = {
            getCertificates: noop,
            getUnlinkedCertificates: noop,
            createCertificate: noopCreated,
            uploadPdf: noopCreated,
            linkCertificate: noop,
            updateCertificate: noop,
            delete: noop,
            downloadPdf: noop,
        };
        const mockPartyController = {
            getParties: noop,
            createParty: noopCreated,
            updateParty: noop,
            deleteParty: noop,
        };
        const mockRepairController = {
            getRepairs: noop,
            createRepair: noopCreated,
            updateRepair: noop,
            deleteRepair: noop,
        };
        const mockSettingsController = {
            getSettings: noop,
            updateSettings: noop,
            exportExcel: noop,
            exportCsv: noop,
            getProfiles: noop,
            createProfile: noopCreated,
            switchProfile: noop,
            backupDatabase: noop,
            checkpointWAL: noop,
            factoryReset: noop,
        };
        const routes = (0, routes_1.createRoutes)(mockStockController, mockHealthController, mockDashboardController, mockLedgerController, mockCertificateController, mockPartyController, mockRepairController, mockSettingsController);
        app.use(routes);
    });
    (0, vitest_1.it)('Trace 1: APPLICATION START -> Verifies directory layout and storage boundaries', () => {
        (0, paths_1.ensureAllDataDirs)();
        const controlDb = (0, paths_1.getControlDbPath)();
        (0, vitest_1.expect)(controlDb).toBeDefined();
        (0, vitest_1.expect)(controlDb.endsWith('.db')).toBe(true);
    });
    (0, vitest_1.it)('Trace 2: BACKEND START -> Public probes are accessible without authentication', async () => {
        const healthRes = await (0, supertest_1.default)(app).get('/health');
        (0, vitest_1.expect)(healthRes.status).toBe(200);
        (0, vitest_1.expect)(healthRes.body.status).toBe('ok');
        const lifecycleProbe = await (0, supertest_1.default)(app).get('/api/system/lifecycle');
        (0, vitest_1.expect)(lifecycleProbe.status).toBe(200);
        (0, vitest_1.expect)(lifecycleProbe.body.success).toBe(true);
        (0, vitest_1.expect)(lifecycleProbe.body.data.lifecycleState).toBeDefined();
    });
    (0, vitest_1.it)('Trace 3: INSTALLATION & DEVICE DETECTION -> Stable persistent identities backed by control DB', async () => {
        const installId = installation_service_1.installationService.getOrGenerateInstallationId();
        const deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        (0, vitest_1.expect)(installId).toBeDefined();
        (0, vitest_1.expect)(installId.length).toBeGreaterThanOrEqual(16);
        (0, vitest_1.expect)(deviceId).toBeDefined();
        (0, vitest_1.expect)(deviceId.length).toBeGreaterThanOrEqual(16);
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        (0, vitest_1.expect)(install.installationId).toBe(installId);
    });
    (0, vitest_1.it)('Trace 4: LIFECYCLE REJECTION -> Business endpoints reject access if lifecycle is not READY', async () => {
        // Temporarily reset state to APP_SETUP to verify gate
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.installation.update({
            where: { id: install.id },
            data: { lifecycleState: 'APP_SETUP' },
        });
        const res = await (0, supertest_1.default)(app)
            .get('/api/stocks')
            .set('X-Profile-Id', 'Stavan');
        (0, vitest_1.expect)(res.status).toBe(428);
        (0, vitest_1.expect)(res.body.code).toBe('LIFECYCLE_NOT_READY');
        (0, vitest_1.expect)(res.body.currentLifecycleState).toBe('APP_SETUP');
    });
    (0, vitest_1.it)('Trace 5: SECURITY STATE -> Authoritative PIN hashing and lockout state in DeviceSecurity', async () => {
        const deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        const pin = '849201';
        // Ensure PIN is configured
        await device_security_service_1.deviceSecurityService.setupPin(deviceId, pin).catch(() => { });
        const sec = await prisma_1.systemPrisma.deviceSecurity.findUnique({
            where: { deviceId },
        });
        (0, vitest_1.expect)(sec).toBeDefined();
        (0, vitest_1.expect)(sec?.pinHash).toBeDefined();
        (0, vitest_1.expect)(sec?.pinHash).not.toBe(pin); // Plaintext never stored
        (0, vitest_1.expect)(sec?.pinHash?.startsWith('$2')).toBe(true); // Bcrypt hash
    });
    (0, vitest_1.it)('Trace 6: USER STATE -> Business user association in InstallationUser relation', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const created = await onboarding_service_1.onboardingService.createBusinessUser({
            username: 'trace_admin',
            password: 'Password123!',
            displayName: 'Trace Administrator',
            role: 'ADMIN',
        });
        (0, vitest_1.expect)(created.user.id).toBeDefined();
        const users = await onboarding_service_1.onboardingService.discoverUsers();
        (0, vitest_1.expect)(users.candidates.length).toBeGreaterThanOrEqual(1);
        const firstUser = users.candidates.find((u) => u.username === 'trace_admin');
        (0, vitest_1.expect)(firstUser).toBeDefined();
        const relation = await prisma_1.systemPrisma.installationUser.findFirst({
            where: { installationId: install.id, userId: firstUser.id },
        });
        (0, vitest_1.expect)(relation).toBeDefined();
    });
    (0, vitest_1.it)('Trace 7: READY & ERP LOAD -> Business endpoints execute once lifecycle reaches READY', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.installation.update({
            where: { id: install.id },
            data: { lifecycleState: 'READY' },
        });
        const testDbPath = path_1.default.resolve(__dirname, '../../test.db');
        if (!fs_1.default.existsSync(testDbPath)) {
            fs_1.default.writeFileSync(testDbPath, '');
        }
        (0, prisma_1.registerProfileInCache)({ code: 'Stavan', name: 'Stavan', dbPath: testDbPath });
        const res = await (0, supertest_1.default)(app)
            .get('/api/stocks')
            .set('X-Profile-Id', 'Stavan');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.success).toBe(true);
    });
});
//# sourceMappingURL=architecture-traceability.test.js.map