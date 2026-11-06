"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const export_entity_registry_1 = require("../modules/system/export/export-entity-registry");
const export_service_1 = require("../modules/system/export/export.service");
const prisma_1 = __importStar(require("../infrastructure/database/prisma"));
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Export Completeness & Registry Integrity', () => {
    const exportService = new export_service_1.ExportService();
    const testDir = path_1.default.resolve('test-scratch-export-completeness');
    const testDbPath = path_1.default.join(testDir, 'export_test.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('Stavan.db') || path_1.default.resolve('prisma/template.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, testDbPath);
        // Ensure installation exists in control plane
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_export_completeness',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        const canonical = path_1.default.resolve(testDbPath).toLowerCase();
        let profile = await prisma_1.systemPrisma.profile.findUnique({ where: { code: 'export_test' } });
        if (!profile) {
            profile = await prisma_1.systemPrisma.profile.create({
                data: {
                    code: 'export_test',
                    name: 'Export Test Profile',
                    dbPath: testDbPath,
                    status: 'ACTIVE',
                },
            });
        }
        await prisma_1.systemPrisma.databaseRegistry.upsert({
            where: { canonicalPath: canonical },
            update: { profileId: profile.id, status: 'ACTIVE' },
            create: {
                databaseId: 'db_export_test',
                installationId: inst.id,
                profileId: profile.id,
                displayName: 'Export Test Profile',
                canonicalPath: canonical,
                status: 'ACTIVE',
            },
        });
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P7-EXP-1: Export entity registry contains all 16 business models and marks them exportable', () => {
        const exportable = (0, export_entity_registry_1.getExportableEntities)();
        (0, vitest_1.expect)(exportable.length).toBe(16);
        const names = exportable.map((e) => e.entityName);
        const expected = [
            'Stock',
            'Ledger',
            'Party',
            'DiamondItem',
            'Certification',
            'Repair',
            'Transaction',
            'TransactionItem',
            'Location',
            'ItemEvent',
            'InventoryMovement',
            'FinancialEntry',
            'ItemTransformation',
            'TransformationProvenance',
            'DocumentDraft',
            'DraftRevision',
        ];
        for (const exp of expected) {
            (0, vitest_1.expect)(names).toContain(exp);
        }
    });
    (0, vitest_1.it)('P7-EXP-2: Internal and sensitive system models are marked non-exportable', () => {
        const systemEntities = export_entity_registry_1.EXPORT_ENTITY_REGISTRY.filter((e) => e.category === 'SYSTEM');
        (0, vitest_1.expect)(systemEntities.length).toBeGreaterThanOrEqual(6);
        const systemNames = systemEntities.map((e) => e.entityName);
        (0, vitest_1.expect)(systemNames).toContain('Setting');
        (0, vitest_1.expect)(systemNames).toContain('RecordVersion');
        (0, vitest_1.expect)(systemNames).toContain('VersionChange');
        (0, vitest_1.expect)(systemNames).toContain('AuditEvent');
        (0, vitest_1.expect)(systemNames).toContain('Sequence');
        (0, vitest_1.expect)(systemNames).toContain('IdempotencyKey');
        for (const ent of systemEntities) {
            (0, vitest_1.expect)(ent.exportable).toBe(false);
        }
    });
    (0, vitest_1.it)('P7-EXP-3: SENSITIVE_COLUMN_PATTERN accurately flags credentials and secret tokens', () => {
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('password')).toBe(true);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('passwordHash')).toBe(true);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('pin')).toBe(true);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('secretToken')).toBe(true);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('refreshToken')).toBe(true);
        // Business fields must NOT be flagged
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('itemName')).toBe(false);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('amount')).toBe(false);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('caratWeight')).toBe(false);
        (0, vitest_1.expect)(export_entity_registry_1.SENSITIVE_COLUMN_PATTERN.test('certificateNumber')).toBe(false);
    });
    (0, vitest_1.it)('P7-EXP-4: buildExportQueries builds queries for all 16 exportable entities on client', () => {
        const queries = (0, export_entity_registry_1.buildExportQueries)(prisma_1.default);
        (0, vitest_1.expect)(queries.length).toBe(16);
        const queryNames = queries.map((q) => q.name);
        (0, vitest_1.expect)(queryNames).toContain('Stock');
        (0, vitest_1.expect)(queryNames).toContain('ItemEvent');
        (0, vitest_1.expect)(queryNames).toContain('InventoryMovement');
        (0, vitest_1.expect)(queryNames).toContain('FinancialEntry');
        (0, vitest_1.expect)(queryNames).toContain('ItemTransformation');
        (0, vitest_1.expect)(queryNames).toContain('TransformationProvenance');
        (0, vitest_1.expect)(queryNames).toContain('DocumentDraft');
        (0, vitest_1.expect)(queryNames).toContain('DraftRevision');
    });
    (0, vitest_1.it)('P7-EXP-5: ExportService executes complete multi-table export generating manifest and checksums', async () => {
        const result = await exportService.exportBusinessData({
            databasePath: testDbPath,
            format: 'CSV',
        }, 'test_operator');
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.exportId).toBeDefined();
        (0, vitest_1.expect)(result.manifest.tables.length).toBe(16);
        (0, vitest_1.expect)(fs_1.default.existsSync(result.filePath)).toBe(true);
        const manifestPath = path_1.default.join(result.filePath, 'export-manifest.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.tables.length).toBe(16);
        (0, vitest_1.expect)(manifest.tables[0].sha256).toBeDefined();
        // Clean up bundle
        try {
            fs_1.default.rmSync(result.filePath, { recursive: true, force: true });
        }
        catch { }
    });
    (0, vitest_1.it)('P7-EXP-6: Automated CI check: All models in schema.prisma are explicitly classified in EXPORT_ENTITY_REGISTRY', () => {
        const schemaPath = path_1.default.resolve(__dirname, '../../prisma/schema.prisma');
        (0, vitest_1.expect)(fs_1.default.existsSync(schemaPath)).toBe(true);
        const schemaContent = fs_1.default.readFileSync(schemaPath, 'utf-8');
        const modelMatches = [...schemaContent.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)];
        const schemaModelNames = modelMatches.map((m) => m[1]);
        (0, vitest_1.expect)(schemaModelNames.length).toBeGreaterThan(0);
        const registeredEntityNames = new Set(export_entity_registry_1.EXPORT_ENTITY_REGISTRY.map((e) => e.entityName.toLowerCase()));
        // Control Plane models defined only in schema.prisma for System DB / control
        const controlPlaneModels = new Set([
            'installation',
            'device',
            'devicesecurity',
            'installationuser',
            'databaseregistry',
            'backuprecord',
            'restorerecord',
            'provisioningoperation',
            'preservationpackage',
            'uninstallauthorization',
            'userprofile',
            'user',
            'profile',
            'exportrecord',
        ]);
        const unclassifiedModels = [];
        for (const model of schemaModelNames) {
            const lower = model.toLowerCase();
            const isRegistered = registeredEntityNames.has(lower);
            const isControlPlane = controlPlaneModels.has(lower);
            if (!isRegistered && !isControlPlane) {
                unclassifiedModels.push(model);
            }
        }
        (0, vitest_1.expect)(unclassifiedModels, `Unclassified models detected in schema.prisma: ${unclassifiedModels.join(', ')}. Every model must be classified as BUSINESS, REFERENCE, SYSTEM, or CONTROL.`).toEqual([]);
    });
});
//# sourceMappingURL=phase7-export-completeness.test.js.map