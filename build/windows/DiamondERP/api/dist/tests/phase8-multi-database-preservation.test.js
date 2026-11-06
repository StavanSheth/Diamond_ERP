"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/database/prisma");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const installation_service_1 = require("../modules/system/installation.service");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 8 — Multi-Database Customer Data Preservation (P0)', () => {
    const testRoot = path_1.default.resolve(__dirname, '../../test-scratch-phase8-multi-db');
    const customExportDir = path_1.default.join(testRoot, 'exports');
    const dbsDir = (0, paths_1.getDatabasesDir)();
    const userA = { username: `alice_${Date.now()}`, profileCode: `Alice_${Date.now()}` };
    const userB = { username: `bob_${Date.now()}`, profileCode: `Bob_${Date.now()}` };
    const userC = { username: `charlie_${Date.now()}`, profileCode: `Charlie_${Date.now()}` };
    const dbPaths = {
        alice: path_1.default.join(dbsDir, `${userA.profileCode}.db`),
        bob: path_1.default.join(dbsDir, `${userB.profileCode}.db`),
        charlie: path_1.default.join(dbsDir, `${userC.profileCode}.db`),
    };
    let install;
    let createdPackage;
    (0, vitest_1.beforeAll)(async () => {
        fs_1.default.mkdirSync(testRoot, { recursive: true });
        fs_1.default.mkdirSync(customExportDir, { recursive: true });
        install = await installation_service_1.installationService.getOrCreateInstallation();
        // Clean up any stale database registries whose physical files no longer exist
        const staleRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where: { status: 'ACTIVE' },
        });
        for (const reg of staleRegistries) {
            if (!fs_1.default.existsSync(reg.canonicalPath)) {
                await prisma_1.systemPrisma.databaseRegistry.update({
                    where: { id: reg.id },
                    data: { status: 'MISSING' },
                });
            }
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        // Create 3 physical customer databases from template
        for (const [key, dbPath] of Object.entries(dbPaths)) {
            if (templateDb && fs_1.default.existsSync(templateDb)) {
                fs_1.default.copyFileSync(templateDb, dbPath);
            }
            else {
                const dummyClient = new client_1.PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } });
                await dummyClient.$queryRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Profile" (id TEXT PRIMARY KEY, code TEXT, name TEXT, schemaVersion INTEGER);
          CREATE TABLE IF NOT EXISTS "Stock" (id TEXT PRIMARY KEY, stockCode TEXT, name TEXT);
          CREATE TABLE IF NOT EXISTS "Ledger" (id TEXT PRIMARY KEY, stockId TEXT, ledgerType TEXT, name TEXT);
          CREATE TABLE IF NOT EXISTS "Party" (id TEXT PRIMARY KEY, partyCode TEXT, name TEXT);
          CREATE TABLE IF NOT EXISTS "DiamondItem" (id TEXT PRIMARY KEY, itemCode TEXT, shape TEXT);
          CREATE TABLE IF NOT EXISTS "Transaction" (id TEXT PRIMARY KEY, transactionCode TEXT);
          CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, username TEXT, displayName TEXT);
        `);
                await dummyClient.$disconnect();
            }
            // Populate distinct business records per customer DB
            const client = new client_1.PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } });
            const user = key === 'alice' ? userA : key === 'bob' ? userB : userC;
            await client.$executeRawUnsafe(`INSERT OR REPLACE INTO "Stock" (id, stockCode, name, description, currency, isActive, createdAt, updatedAt) VALUES ('${crypto_1.default.randomUUID()}', 'STK_${user.profileCode}_1', 'Diamond Stock for ${user.username}', 'Desc', 'USD', 1, datetime('now'), datetime('now'));`);
            await client.$executeRawUnsafe(`INSERT OR REPLACE INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES ('${crypto_1.default.randomUUID()}', 'PTY_${user.profileCode}_1', 'Party for ${user.username}', 'CUSTOMER', datetime('now'), datetime('now'));`);
            await client.$disconnect();
            // Create control User, Profile, UserProfile, and DatabaseRegistry
            const dbUser = await prisma_1.systemPrisma.user.create({
                data: {
                    username: user.username,
                    displayName: `${user.username} User`,
                    role: 'ADMIN',
                    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz01234567890123456789',
                    isActive: true,
                },
            });
            const profile = await prisma_1.systemPrisma.profile.create({
                data: {
                    code: user.profileCode,
                    name: `${user.profileCode} Profile`,
                    dbPath,
                    isActive: true,
                    status: 'ACTIVE',
                },
            });
            await prisma_1.systemPrisma.userProfile.create({
                data: {
                    userId: dbUser.id,
                    profileId: profile.id,
                    role: 'ADMIN',
                    isActive: true,
                },
            });
            await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: `db_${user.profileCode}`,
                    displayName: `${user.profileCode} DB`,
                    canonicalPath: path_1.default.resolve(dbPath),
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    databaseType: 'LOCAL_PROFILE',
                    profileId: profile.id,
                    installationId: install.id,
                },
            });
        }
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup databases
        for (const dbPath of Object.values(dbPaths)) {
            if (fs_1.default.existsSync(dbPath)) {
                try {
                    fs_1.default.unlinkSync(dbPath);
                }
                catch { }
            }
        }
        if (fs_1.default.existsSync(testRoot)) {
            try {
                fs_1.default.rmSync(testRoot, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P0-1: preserves ALL active customer databases (User A, User B, User C) into one verified bundle', async () => {
        createdPackage = await preservation_service_1.preservationService.createPreservationPackage({
            destinationDir: customExportDir,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(createdPackage.status).toBe('VERIFIED');
        (0, vitest_1.expect)(createdPackage.preservedDatabasesCount).toBeGreaterThanOrEqual(3);
        // Verify preservation manifest
        const manifestPath = path_1.default.join(createdPackage.destinationPath, 'preservation-manifest.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.formatVersion).toBe(2);
        (0, vitest_1.expect)(Array.isArray(manifest.databases)).toBe(true);
        (0, vitest_1.expect)(manifest.databases.length).toBeGreaterThanOrEqual(3);
        // Verify all 3 databases are represented with their respective owner/profile
        const codes = manifest.databases.map((d) => d.profileCode);
        (0, vitest_1.expect)(codes).toContain(userA.profileCode);
        (0, vitest_1.expect)(codes).toContain(userB.profileCode);
        (0, vitest_1.expect)(codes).toContain(userC.profileCode);
        // Verify each database has backup, CSV folder, and XLSX workbook on disk
        for (const user of [userA, userB, userC]) {
            const dbEntry = manifest.databases.find((d) => d.profileCode === user.profileCode);
            (0, vitest_1.expect)(dbEntry).toBeDefined();
            (0, vitest_1.expect)(dbEntry.sha256).toBeDefined();
            const backupOnDisk = path_1.default.join(createdPackage.destinationPath, dbEntry.backupPath);
            (0, vitest_1.expect)(fs_1.default.existsSync(backupOnDisk)).toBe(true);
            const csvOnDisk = path_1.default.join(createdPackage.destinationPath, dbEntry.csvDir, 'Stock.csv');
            (0, vitest_1.expect)(fs_1.default.existsSync(csvOnDisk)).toBe(true);
            const csvContent = fs_1.default.readFileSync(csvOnDisk, 'utf-8');
            (0, vitest_1.expect)(csvContent).toContain(`Diamond Stock for ${user.username}`);
            const xlsxOnDisk = path_1.default.join(createdPackage.destinationPath, dbEntry.xlsxFile);
            (0, vitest_1.expect)(fs_1.default.existsSync(xlsxOnDisk)).toBe(true);
        }
    }, 30000);
    (0, vitest_1.it)('P0-2: multi-database verification engine idempotently verifies every preserved database', async () => {
        const vResult = await preservation_service_1.preservationService.verifyPreservationPackage(createdPackage.packageId);
        (0, vitest_1.expect)(vResult.verified).toBe(true);
        (0, vitest_1.expect)(vResult.status).toBe('VERIFIED');
        (0, vitest_1.expect)(vResult.databaseBackupVerified).toBe(true);
        (0, vitest_1.expect)(vResult.csvVerified).toBe(true);
        (0, vitest_1.expect)(vResult.xlsxVerified).toBe(true);
    }, 30000);
    (0, vitest_1.it)('P0-3: all-or-nothing rule: corruption of ANY single customer database fails the entire package verification', async () => {
        // Tamper with Bob's database backup inside the preservation package
        const manifestPath = path_1.default.join(createdPackage.destinationPath, 'preservation-manifest.json');
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        const bobEntry = manifest.databases.find((d) => d.profileCode === userB.profileCode);
        const bobBackup = path_1.default.join(createdPackage.destinationPath, bobEntry.backupPath);
        fs_1.default.appendFileSync(bobBackup, '\ncorrupt_tamper_bytes');
        const vResult = await preservation_service_1.preservationService.verifyPreservationPackage(createdPackage.packageId);
        (0, vitest_1.expect)(vResult.verified).toBe(false);
        (0, vitest_1.expect)(vResult.status).toBe('FAILED');
        (0, vitest_1.expect)(vResult.error).toContain('checksum mismatch');
    });
    (0, vitest_1.afterAll)(async () => {
        for (const dbPath of Object.values(dbPaths)) {
            if (fs_1.default.existsSync(dbPath)) {
                try {
                    fs_1.default.unlinkSync(dbPath);
                }
                catch { }
            }
        }
        await prisma_1.systemPrisma.databaseRegistry.deleteMany({
            where: { canonicalPath: { in: Object.values(dbPaths).map((p) => path_1.default.resolve(p)) } },
        });
        if (fs_1.default.existsSync(testRoot)) {
            try {
                fs_1.default.rmSync(testRoot, { recursive: true, force: true });
            }
            catch { }
        }
    });
});
//# sourceMappingURL=phase8-multi-database-preservation.test.js.map