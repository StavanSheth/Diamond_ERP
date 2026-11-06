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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 2 Migration & V3 Data Compatibility Verification', () => {
    const tempFiles = [];
    const cleanup = () => {
        for (const f of tempFiles) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
            const wal = f + '-wal';
            const shm = f + '-shm';
            if (fs_1.default.existsSync(wal))
                try {
                    fs_1.default.unlinkSync(wal);
                }
                catch { }
            if (fs_1.default.existsSync(shm))
                try {
                    fs_1.default.unlinkSync(shm);
                }
                catch { }
        }
    };
    (0, vitest_1.afterAll)(() => {
        cleanup();
    });
    (0, vitest_1.it)('proves Phase 2 migrations preserve 100% of existing V3 Users, Profiles, UserProfiles, Devices, and Profile DB files', async () => {
        const testDir = (0, paths_1.getDatabasesDir)();
        const isolatedDbPath = path_1.default.resolve(testDir, `migration_test_control_${Date.now()}.db`);
        const profileDbPathA = path_1.default.resolve(testDir, `mig_prof_a_${Date.now()}.db`);
        const profileDbPathB = path_1.default.resolve(testDir, `mig_prof_b_${Date.now()}.db`);
        tempFiles.push(isolatedDbPath, profileDbPathA, profileDbPathB);
        // 1. Provision physical profile DB files from template
        const templatePath = (0, paths_1.getDatabaseTemplatePath)();
        (0, vitest_1.expect)(templatePath).toBeDefined();
        fs_1.default.copyFileSync(templatePath, profileDbPathA);
        fs_1.default.copyFileSync(templatePath, profileDbPathB);
        const hashProfABefore = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbPathA)).digest('hex');
        const hashProfBBefore = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbPathB)).digest('hex');
        // 2. Set up initial pre-Phase-2 schema on isolated control DB
        const client = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: `file:${isolatedDbPath.replace(/\\/g, '/')}`,
                },
            },
        });
        await client.$connect();
        // Create base tables (User, Profile, UserProfile, Device without Phase 2 enhancements)
        await client.$executeRawUnsafe(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "displayName" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'VIEWER',
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "tokenVersion" INTEGER NOT NULL DEFAULT 1,
        "lastLoginAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await client.$executeRawUnsafe(`
      CREATE TABLE "Profile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "dbPath" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await client.$executeRawUnsafe(`
      CREATE TABLE "UserProfile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "profileId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'VIEWER',
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
        CONSTRAINT "UserProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE
      );
    `);
        // 3. Seed pre-existing production data
        const userId1 = crypto_1.default.randomUUID();
        const userId2 = crypto_1.default.randomUUID();
        const profId1 = crypto_1.default.randomUUID();
        const profId2 = crypto_1.default.randomUUID();
        const userProfId1 = crypto_1.default.randomUUID();
        const userProfId2 = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "User" ("id", "username", "passwordHash", "displayName", "role")
      VALUES 
        ('${userId1}', 'superadmin_legacy', '$2a$10$legacyhash1', 'Legacy Super Admin', 'SUPER_ADMIN'),
        ('${userId2}', 'viewer_legacy', '$2a$10$legacyhash2', 'Legacy Viewer', 'VIEWER');
    `);
        await client.$executeRawUnsafe(`
      INSERT INTO "Profile" ("id", "code", "name", "dbPath")
      VALUES 
        ('${profId1}', 'stavan', 'Stavan Main Office', '${profileDbPathA.replace(/'/g, "''")}'),
        ('${profId2}', 'stuti', 'Stuti Branch Office', '${profileDbPathB.replace(/'/g, "''")}');
    `);
        await client.$executeRawUnsafe(`
      INSERT INTO "UserProfile" ("id", "userId", "profileId", "role")
      VALUES 
        ('${userProfId1}', '${userId1}', '${profId1}', 'SUPER_ADMIN'),
        ('${userProfId2}', '${userId2}', '${profId2}', 'VIEWER');
    `);
        // Record baseline counts
        const usersBefore = await client.$queryRawUnsafe('SELECT * FROM "User";');
        const profilesBefore = await client.$queryRawUnsafe('SELECT * FROM "Profile";');
        const userProfilesBefore = await client.$queryRawUnsafe('SELECT * FROM "UserProfile";');
        (0, vitest_1.expect)(usersBefore.length).toBe(2);
        (0, vitest_1.expect)(profilesBefore.length).toBe(2);
        (0, vitest_1.expect)(userProfilesBefore.length).toBe(2);
        // 4. Apply Migration 1: 20260916120000_add_lifecycle_foundation
        const migration1Sql = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../prisma/migrations/20260916120000_add_lifecycle_foundation/migration.sql'), 'utf-8');
        for (const stmt of migration1Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
            await client.$executeRawUnsafe(stmt);
        }
        // Insert a device row prior to migration 2 (where deviceId was not yet present)
        const legacyDeviceId = crypto_1.default.randomUUID();
        const installRowId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "Installation" ("id", "installationId", "appVersion", "status", "lifecycleState", "updatedAt")
      VALUES ('${installRowId}', '${crypto_1.default.randomUUID()}', '3.0.0', 'ACTIVE', 'NOT_INITIALIZED', CURRENT_TIMESTAMP);
    `);
        await client.$executeRawUnsafe(`
      INSERT INTO "Device" ("id", "installationId", "deviceName", "platform", "status", "updatedAt")
      VALUES ('${legacyDeviceId}', '${installRowId}', 'Legacy-FrontDesk', 'WINDOWS', 'ACTIVE', CURRENT_TIMESTAMP);
    `);
        // 5. Apply Migration 2: 20260916130000_enhance_lifecycle_foundation
        const migration2Sql = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../prisma/migrations/20260916130000_enhance_lifecycle_foundation/migration.sql'), 'utf-8');
        for (const stmt of migration2Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
            await client.$executeRawUnsafe(stmt);
        }
        // 6. Apply Migration 3: 20260916140000_add_database_registry_profile_relation
        const migration3Sql = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../prisma/migrations/20260916140000_add_database_registry_profile_relation/migration.sql'), 'utf-8');
        for (const stmt of migration3Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
            await client.$executeRawUnsafe(stmt);
        }
        // 7. VERIFY INVARIANTS AFTER MIGRATION
        // A. Users preserved
        const usersAfter = await client.$queryRawUnsafe('SELECT * FROM "User";');
        (0, vitest_1.expect)(usersAfter.length).toBe(usersBefore.length);
        (0, vitest_1.expect)(usersAfter.find((u) => u.username === 'superadmin_legacy')?.role).toBe('SUPER_ADMIN');
        (0, vitest_1.expect)(usersAfter.find((u) => u.username === 'viewer_legacy')?.role).toBe('VIEWER');
        // New nullable column deletedAt present and null
        (0, vitest_1.expect)(usersAfter[0].deletedAt).toBeNull();
        // B. Profiles preserved
        const profilesAfter = await client.$queryRawUnsafe('SELECT * FROM "Profile";');
        (0, vitest_1.expect)(profilesAfter.length).toBe(profilesBefore.length);
        const profAAfter = profilesAfter.find((p) => p.code === 'stavan');
        const profBAfter = profilesAfter.find((p) => p.code === 'stuti');
        (0, vitest_1.expect)(profAAfter).toBeDefined();
        (0, vitest_1.expect)(profBAfter).toBeDefined();
        (0, vitest_1.expect)(profAAfter.dbPath).toBe(profileDbPathA);
        (0, vitest_1.expect)(profBAfter.dbPath).toBe(profileDbPathB);
        (0, vitest_1.expect)(profAAfter.schemaVersion).toBe(1);
        (0, vitest_1.expect)(profAAfter.status).toBe('ACTIVE');
        // C. UserProfile associations preserved
        const userProfilesAfter = await client.$queryRawUnsafe('SELECT * FROM "UserProfile";');
        (0, vitest_1.expect)(userProfilesAfter.length).toBe(userProfilesBefore.length);
        // D. Profile database files on disk completely untouched
        (0, vitest_1.expect)(fs_1.default.existsSync(profileDbPathA)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(profileDbPathB)).toBe(true);
        const hashProfAAfter = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbPathA)).digest('hex');
        const hashProfBAfter = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(profileDbPathB)).digest('hex');
        (0, vitest_1.expect)(hashProfAAfter).toBe(hashProfABefore);
        (0, vitest_1.expect)(hashProfBAfter).toBe(hashProfBBefore);
        // E. Backfill safety: legacy device received stable non-null deviceId
        const devicesAfter = await client.$queryRawUnsafe('SELECT * FROM "Device";');
        (0, vitest_1.expect)(devicesAfter.length).toBe(1);
        (0, vitest_1.expect)(devicesAfter[0].deviceId).toBe(legacyDeviceId); // Backfilled to existing id
        (0, vitest_1.expect)(devicesAfter[0].deviceName).toBe('Legacy-FrontDesk');
        // F. Verify newly added Phase 2 models are operational
        const regId = crypto_1.default.randomUUID();
        const logicalDbId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "DatabaseRegistry" (
        "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
        "status", "databaseType", "profileId", "installationId", "updatedAt"
      ) VALUES (
        '${regId}', '${logicalDbId}', 'Stavan Main DB', '${profileDbPathA.replace(/'/g, "''")}',
        1, 'ACTIVE', 'LOCAL_PROFILE', '${profId1}', '${installRowId}', CURRENT_TIMESTAMP
      );
    `);
        const regRows = await client.$queryRawUnsafe(`SELECT * FROM "DatabaseRegistry" WHERE "id" = '${regId}';`);
        (0, vitest_1.expect)(regRows.length).toBe(1);
        (0, vitest_1.expect)(regRows[0].databaseId).toBe(logicalDbId);
        (0, vitest_1.expect)(regRows[0].profileId).toBe(profId1);
        // G. Verify InstallationUser links
        const iuId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "InstallationUser" ("id", "installationId", "userId")
      VALUES ('${iuId}', '${installRowId}', '${userId1}');
    `);
        const iuRows = await client.$queryRawUnsafe('SELECT * FROM "InstallationUser";');
        (0, vitest_1.expect)(iuRows.length).toBe(1);
        (0, vitest_1.expect)(iuRows[0].userId).toBe(userId1);
        await client.$disconnect();
    });
    (0, vitest_1.it)('executes real prisma migrate deploy mechanism from scratch and verifies idempotency on isolated database', async () => {
        const testDir = (0, paths_1.getDatabasesDir)();
        const isolatedDbPath = path_1.default.resolve(testDir, `prisma_deploy_test_${Date.now()}.db`);
        tempFiles.push(isolatedDbPath);
        const schemaPath = path_1.default.resolve(__dirname, '../../prisma/schema.prisma');
        const normalizedUrl = `file:${isolatedDbPath.replace(/\\/g, '/')}`;
        // 1. Run actual Prisma migration deployment command via child_process
        const execSync = (await Promise.resolve().then(() => __importStar(require('child_process')))).execSync;
        const deployOutput1 = execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
            env: { ...process.env, DATABASE_URL: normalizedUrl },
            encoding: 'utf-8',
            cwd: path_1.default.resolve(__dirname, '../..'),
        });
        (0, vitest_1.expect)(deployOutput1).toContain('migrations found in prisma/migrations');
        (0, vitest_1.expect)(deployOutput1).toContain('All migrations have been successfully applied');
        // 2. Test migration idempotency: running migrate deploy a second time must succeed with 0 changes
        const deployOutput2 = execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
            env: { ...process.env, DATABASE_URL: normalizedUrl },
            encoding: 'utf-8',
            cwd: path_1.default.resolve(__dirname, '../..'),
        });
        (0, vitest_1.expect)(deployOutput2).toContain('No pending migrations to apply');
        // 3. Connect PrismaClient to the deployed database and verify tables and schema integrity
        const client = new client_1.PrismaClient({
            datasources: { db: { url: normalizedUrl } },
        });
        await client.$connect();
        // Verify all Phase 2 and core ERP tables exist
        const tables = await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
        const tableNames = tables.map((t) => t.name);
        (0, vitest_1.expect)(tableNames).toContain('Installation');
        (0, vitest_1.expect)(tableNames).toContain('Device');
        (0, vitest_1.expect)(tableNames).toContain('DatabaseRegistry');
        (0, vitest_1.expect)(tableNames).toContain('InstallationUser');
        (0, vitest_1.expect)(tableNames).toContain('User');
        (0, vitest_1.expect)(tableNames).toContain('Profile');
        (0, vitest_1.expect)(tableNames).toContain('UserProfile');
        (0, vitest_1.expect)(tableNames).toContain('DeviceSecurity');
        (0, vitest_1.expect)(tableNames).toContain('_prisma_migrations');
        // Verify _prisma_migrations record count is at least 6
        const migrationsCount = await client.$queryRawUnsafe('SELECT count(*) as count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;');
        (0, vitest_1.expect)(Number(migrationsCount[0].count)).toBeGreaterThanOrEqual(6);
        await client.$disconnect();
    }, 30000);
    (0, vitest_1.it)('enforces SQLite engine-level foreign key and ON DELETE SET NULL on DatabaseRegistry.profileId', async () => {
        const testDir = (0, paths_1.getDatabasesDir)();
        const isolatedDbPath = path_1.default.resolve(testDir, `engine_fk_test_${Date.now()}.db`);
        const profileDbFile = path_1.default.resolve(testDir, `profile_file_${Date.now()}.db`);
        tempFiles.push(isolatedDbPath, profileDbFile);
        // Deploy schema using actual prisma migrations
        const schemaPath = path_1.default.resolve(__dirname, '../../prisma/schema.prisma');
        const normalizedUrl = `file:${isolatedDbPath.replace(/\\/g, '/')}`;
        const execSync = (await Promise.resolve().then(() => __importStar(require('child_process')))).execSync;
        execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
            env: { ...process.env, DATABASE_URL: normalizedUrl },
            encoding: 'utf-8',
            cwd: path_1.default.resolve(__dirname, '../..'),
        });
        // Create physical profile file
        fs_1.default.writeFileSync(profileDbFile, 'SQLite format 3\0 dummy file');
        const client = new client_1.PrismaClient({
            datasources: { db: { url: normalizedUrl } },
        });
        await client.$connect();
        // Enable SQLite foreign keys explicitly to test engine-level enforcement
        await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
        const fkStatus = await client.$queryRawUnsafe('PRAGMA foreign_keys;');
        (0, vitest_1.expect)(Number(Object.values(fkStatus[0])[0])).toBe(1);
        // 1. Create Installation
        const installRowId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "Installation" ("id", "installationId", "appVersion", "status", "lifecycleState", "updatedAt")
      VALUES ('${installRowId}', '${crypto_1.default.randomUUID()}', '3.0.0', 'ACTIVE', 'NOT_INITIALIZED', CURRENT_TIMESTAMP);
    `);
        // 2. Create Profile
        const profId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "Profile" ("id", "code", "name", "dbPath", "updatedAt")
      VALUES ('${profId}', 'test_fk_prof', 'FK Test Profile', '${profileDbFile.replace(/'/g, "''")}', CURRENT_TIMESTAMP);
    `);
        // 3. Test Invalid Reference rejection at SQLite engine level
        const fakeProfId = crypto_1.default.randomUUID();
        const invalidRegId = crypto_1.default.randomUUID();
        await (0, vitest_1.expect)(client.$executeRawUnsafe(`
        INSERT INTO "DatabaseRegistry" (
          "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
          "status", "databaseType", "profileId", "installationId", "updatedAt"
        ) VALUES (
          '${invalidRegId}', '${crypto_1.default.randomUUID()}', 'Invalid DB', '${profileDbFile.replace(/'/g, "''")}',
          1, 'ACTIVE', 'LOCAL_PROFILE', '${fakeProfId}', '${installRowId}', CURRENT_TIMESTAMP
        );
      `)).rejects.toThrow(/FOREIGN KEY constraint failed/);
        // 4. Test Valid Reference insertion
        const validRegId = crypto_1.default.randomUUID();
        const logicalDbId = crypto_1.default.randomUUID();
        await client.$executeRawUnsafe(`
      INSERT INTO "DatabaseRegistry" (
        "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
        "status", "databaseType", "profileId", "installationId", "updatedAt"
      ) VALUES (
        '${validRegId}', '${logicalDbId}', 'Valid DB', '${profileDbFile.replace(/'/g, "''")}',
        1, 'ACTIVE', 'LOCAL_PROFILE', '${profId}', '${installRowId}', CURRENT_TIMESTAMP
      );
    `);
        const regBefore = await client.$queryRawUnsafe(`SELECT * FROM "DatabaseRegistry" WHERE "id" = '${validRegId}';`);
        (0, vitest_1.expect)(regBefore.length).toBe(1);
        (0, vitest_1.expect)(regBefore[0].profileId).toBe(profId);
        // 5. Test Engine-level ON DELETE SET NULL
        // Deleting Profile row must automatically set profileId to NULL on DatabaseRegistry
        await client.$executeRawUnsafe(`DELETE FROM "Profile" WHERE "id" = '${profId}';`);
        const regAfter = await client.$queryRawUnsafe(`SELECT * FROM "DatabaseRegistry" WHERE "id" = '${validRegId}';`);
        (0, vitest_1.expect)(regAfter.length).toBe(1);
        (0, vitest_1.expect)(regAfter[0].profileId).toBeNull(); // Set to NULL by SQLite foreign key ON DELETE SET NULL
        (0, vitest_1.expect)(regAfter[0].databaseId).toBe(logicalDbId); // Logical identity preserved
        (0, vitest_1.expect)(regAfter[0].canonicalPath).toBe(profileDbFile); // Path preserved
        (0, vitest_1.expect)(fs_1.default.existsSync(profileDbFile)).toBe(true); // Physical file on disk preserved!
        await client.$disconnect();
    }, 30000);
});
//# sourceMappingURL=phase2-migration.test.js.map