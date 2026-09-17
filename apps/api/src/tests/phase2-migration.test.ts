import { describe, it, expect, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getDatabasesDir, getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 2 Migration & V3 Data Compatibility Verification', () => {
  const tempFiles: string[] = [];

  const cleanup = () => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
      const wal = f + '-wal';
      const shm = f + '-shm';
      if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch {}
      if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch {}
    }
  };

  afterAll(() => {
    cleanup();
  });

  it('proves Phase 2 migrations preserve 100% of existing V3 Users, Profiles, UserProfiles, Devices, and Profile DB files', async () => {
    const testDir = getDatabasesDir();
    const isolatedDbPath = path.resolve(testDir, `migration_test_control_${Date.now()}.db`);
    const profileDbPathA = path.resolve(testDir, `mig_prof_a_${Date.now()}.db`);
    const profileDbPathB = path.resolve(testDir, `mig_prof_b_${Date.now()}.db`);
    tempFiles.push(isolatedDbPath, profileDbPathA, profileDbPathB);

    // 1. Provision physical profile DB files from template
    const templatePath = getDatabaseTemplatePath();
    expect(templatePath).toBeDefined();
    fs.copyFileSync(templatePath!, profileDbPathA);
    fs.copyFileSync(templatePath!, profileDbPathB);

    const hashProfABefore = crypto.createHash('sha256').update(fs.readFileSync(profileDbPathA)).digest('hex');
    const hashProfBBefore = crypto.createHash('sha256').update(fs.readFileSync(profileDbPathB)).digest('hex');

    // 2. Set up initial pre-Phase-2 schema on isolated control DB
    const client = new PrismaClient({
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
    const userId1 = crypto.randomUUID();
    const userId2 = crypto.randomUUID();
    const profId1 = crypto.randomUUID();
    const profId2 = crypto.randomUUID();
    const userProfId1 = crypto.randomUUID();
    const userProfId2 = crypto.randomUUID();

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
    const usersBefore = await client.$queryRawUnsafe<any[]>('SELECT * FROM "User";');
    const profilesBefore = await client.$queryRawUnsafe<any[]>('SELECT * FROM "Profile";');
    const userProfilesBefore = await client.$queryRawUnsafe<any[]>('SELECT * FROM "UserProfile";');

    expect(usersBefore.length).toBe(2);
    expect(profilesBefore.length).toBe(2);
    expect(userProfilesBefore.length).toBe(2);

    // 4. Apply Migration 1: 20260916120000_add_lifecycle_foundation
    const migration1Sql = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/migrations/20260916120000_add_lifecycle_foundation/migration.sql'),
      'utf-8'
    );
    for (const stmt of migration1Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
      await client.$executeRawUnsafe(stmt);
    }

    // Insert a device row prior to migration 2 (where deviceId was not yet present)
    const legacyDeviceId = crypto.randomUUID();
    const installRowId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "Installation" ("id", "installationId", "appVersion", "status", "lifecycleState", "updatedAt")
      VALUES ('${installRowId}', '${crypto.randomUUID()}', '3.0.0', 'ACTIVE', 'NOT_INITIALIZED', CURRENT_TIMESTAMP);
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "Device" ("id", "installationId", "deviceName", "platform", "status", "updatedAt")
      VALUES ('${legacyDeviceId}', '${installRowId}', 'Legacy-FrontDesk', 'WINDOWS', 'ACTIVE', CURRENT_TIMESTAMP);
    `);

    // 5. Apply Migration 2: 20260916130000_enhance_lifecycle_foundation
    const migration2Sql = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/migrations/20260916130000_enhance_lifecycle_foundation/migration.sql'),
      'utf-8'
    );
    for (const stmt of migration2Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
      await client.$executeRawUnsafe(stmt);
    }

    // 6. Apply Migration 3: 20260916140000_add_database_registry_profile_relation
    const migration3Sql = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/migrations/20260916140000_add_database_registry_profile_relation/migration.sql'),
      'utf-8'
    );
    for (const stmt of migration3Sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
      await client.$executeRawUnsafe(stmt);
    }

    // 7. VERIFY INVARIANTS AFTER MIGRATION

    // A. Users preserved
    const usersAfter = await client.$queryRawUnsafe<any[]>('SELECT * FROM "User";');
    expect(usersAfter.length).toBe(usersBefore.length);
    expect(usersAfter.find((u) => u.username === 'superadmin_legacy')?.role).toBe('SUPER_ADMIN');
    expect(usersAfter.find((u) => u.username === 'viewer_legacy')?.role).toBe('VIEWER');
    // New nullable column deletedAt present and null
    expect(usersAfter[0].deletedAt).toBeNull();

    // B. Profiles preserved
    const profilesAfter = await client.$queryRawUnsafe<any[]>('SELECT * FROM "Profile";');
    expect(profilesAfter.length).toBe(profilesBefore.length);
    const profAAfter = profilesAfter.find((p) => p.code === 'stavan');
    const profBAfter = profilesAfter.find((p) => p.code === 'stuti');
    expect(profAAfter).toBeDefined();
    expect(profBAfter).toBeDefined();
    expect(profAAfter.dbPath).toBe(profileDbPathA);
    expect(profBAfter.dbPath).toBe(profileDbPathB);
    expect(profAAfter.schemaVersion).toBe(1);
    expect(profAAfter.status).toBe('ACTIVE');

    // C. UserProfile associations preserved
    const userProfilesAfter = await client.$queryRawUnsafe<any[]>('SELECT * FROM "UserProfile";');
    expect(userProfilesAfter.length).toBe(userProfilesBefore.length);

    // D. Profile database files on disk completely untouched
    expect(fs.existsSync(profileDbPathA)).toBe(true);
    expect(fs.existsSync(profileDbPathB)).toBe(true);
    const hashProfAAfter = crypto.createHash('sha256').update(fs.readFileSync(profileDbPathA)).digest('hex');
    const hashProfBAfter = crypto.createHash('sha256').update(fs.readFileSync(profileDbPathB)).digest('hex');
    expect(hashProfAAfter).toBe(hashProfABefore);
    expect(hashProfBAfter).toBe(hashProfBBefore);

    // E. Backfill safety: legacy device received stable non-null deviceId
    const devicesAfter = await client.$queryRawUnsafe<any[]>('SELECT * FROM "Device";');
    expect(devicesAfter.length).toBe(1);
    expect(devicesAfter[0].deviceId).toBe(legacyDeviceId); // Backfilled to existing id
    expect(devicesAfter[0].deviceName).toBe('Legacy-FrontDesk');

    // F. Verify newly added Phase 2 models are operational
    const regId = crypto.randomUUID();
    const logicalDbId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "DatabaseRegistry" (
        "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
        "status", "databaseType", "profileId", "installationId", "updatedAt"
      ) VALUES (
        '${regId}', '${logicalDbId}', 'Stavan Main DB', '${profileDbPathA.replace(/'/g, "''")}',
        1, 'ACTIVE', 'LOCAL_PROFILE', '${profId1}', '${installRowId}', CURRENT_TIMESTAMP
      );
    `);

    const regRows = await client.$queryRawUnsafe<any[]>(`SELECT * FROM "DatabaseRegistry" WHERE "id" = '${regId}';`);
    expect(regRows.length).toBe(1);
    expect(regRows[0].databaseId).toBe(logicalDbId);
    expect(regRows[0].profileId).toBe(profId1);

    // G. Verify InstallationUser links
    const iuId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "InstallationUser" ("id", "installationId", "userId")
      VALUES ('${iuId}', '${installRowId}', '${userId1}');
    `);
    const iuRows = await client.$queryRawUnsafe<any[]>('SELECT * FROM "InstallationUser";');
    expect(iuRows.length).toBe(1);
    expect(iuRows[0].userId).toBe(userId1);

    await client.$disconnect();
  });

  it('executes real prisma migrate deploy mechanism from scratch and verifies idempotency on isolated database', async () => {
    const testDir = getDatabasesDir();
    const isolatedDbPath = path.resolve(testDir, `prisma_deploy_test_${Date.now()}.db`);
    tempFiles.push(isolatedDbPath);

    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const normalizedUrl = `file:${isolatedDbPath.replace(/\\/g, '/')}`;

    // 1. Run actual Prisma migration deployment command via child_process
    const execSync = (await import('child_process')).execSync;
    const deployOutput1 = execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      env: { ...process.env, DATABASE_URL: normalizedUrl },
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '../..'),
    });

    expect(deployOutput1).toContain('migrations found in prisma/migrations');
    expect(deployOutput1).toContain('All migrations have been successfully applied');

    // 2. Test migration idempotency: running migrate deploy a second time must succeed with 0 changes
    const deployOutput2 = execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      env: { ...process.env, DATABASE_URL: normalizedUrl },
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '../..'),
    });

    expect(deployOutput2).toContain('No pending migrations to apply');

    // 3. Connect PrismaClient to the deployed database and verify tables and schema integrity
    const client = new PrismaClient({
      datasources: { db: { url: normalizedUrl } },
    });
    await client.$connect();

    // Verify all Phase 2 and core ERP tables exist
    const tables = await client.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    );
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('Installation');
    expect(tableNames).toContain('Device');
    expect(tableNames).toContain('DatabaseRegistry');
    expect(tableNames).toContain('InstallationUser');
    expect(tableNames).toContain('User');
    expect(tableNames).toContain('Profile');
    expect(tableNames).toContain('UserProfile');
    expect(tableNames).toContain('_prisma_migrations');

    // Verify _prisma_migrations record count is exactly 6
    const migrationsCount = await client.$queryRawUnsafe<any[]>(
      'SELECT count(*) as count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;'
    );
    expect(Number(migrationsCount[0].count)).toBe(6);

    await client.$disconnect();
  }, 30000);

  it('enforces SQLite engine-level foreign key and ON DELETE SET NULL on DatabaseRegistry.profileId', async () => {
    const testDir = getDatabasesDir();
    const isolatedDbPath = path.resolve(testDir, `engine_fk_test_${Date.now()}.db`);
    const profileDbFile = path.resolve(testDir, `profile_file_${Date.now()}.db`);
    tempFiles.push(isolatedDbPath, profileDbFile);

    // Deploy schema using actual prisma migrations
    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const normalizedUrl = `file:${isolatedDbPath.replace(/\\/g, '/')}`;
    const execSync = (await import('child_process')).execSync;
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      env: { ...process.env, DATABASE_URL: normalizedUrl },
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '../..'),
    });

    // Create physical profile file
    fs.writeFileSync(profileDbFile, 'SQLite format 3\0 dummy file');

    const client = new PrismaClient({
      datasources: { db: { url: normalizedUrl } },
    });
    await client.$connect();

    // Enable SQLite foreign keys explicitly to test engine-level enforcement
    await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    const fkStatus = await client.$queryRawUnsafe<any[]>('PRAGMA foreign_keys;');
    expect(Number(Object.values(fkStatus[0])[0])).toBe(1);

    // 1. Create Installation
    const installRowId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "Installation" ("id", "installationId", "appVersion", "status", "lifecycleState", "updatedAt")
      VALUES ('${installRowId}', '${crypto.randomUUID()}', '3.0.0', 'ACTIVE', 'NOT_INITIALIZED', CURRENT_TIMESTAMP);
    `);

    // 2. Create Profile
    const profId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "Profile" ("id", "code", "name", "dbPath", "updatedAt")
      VALUES ('${profId}', 'test_fk_prof', 'FK Test Profile', '${profileDbFile.replace(/'/g, "''")}', CURRENT_TIMESTAMP);
    `);

    // 3. Test Invalid Reference rejection at SQLite engine level
    const fakeProfId = crypto.randomUUID();
    const invalidRegId = crypto.randomUUID();
    await expect(
      client.$executeRawUnsafe(`
        INSERT INTO "DatabaseRegistry" (
          "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
          "status", "databaseType", "profileId", "installationId", "updatedAt"
        ) VALUES (
          '${invalidRegId}', '${crypto.randomUUID()}', 'Invalid DB', '${profileDbFile.replace(/'/g, "''")}',
          1, 'ACTIVE', 'LOCAL_PROFILE', '${fakeProfId}', '${installRowId}', CURRENT_TIMESTAMP
        );
      `)
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    // 4. Test Valid Reference insertion
    const validRegId = crypto.randomUUID();
    const logicalDbId = crypto.randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO "DatabaseRegistry" (
        "id", "databaseId", "displayName", "canonicalPath", "schemaVersion",
        "status", "databaseType", "profileId", "installationId", "updatedAt"
      ) VALUES (
        '${validRegId}', '${logicalDbId}', 'Valid DB', '${profileDbFile.replace(/'/g, "''")}',
        1, 'ACTIVE', 'LOCAL_PROFILE', '${profId}', '${installRowId}', CURRENT_TIMESTAMP
      );
    `);

    const regBefore = await client.$queryRawUnsafe<any[]>(
      `SELECT * FROM "DatabaseRegistry" WHERE "id" = '${validRegId}';`
    );
    expect(regBefore.length).toBe(1);
    expect(regBefore[0].profileId).toBe(profId);

    // 5. Test Engine-level ON DELETE SET NULL
    // Deleting Profile row must automatically set profileId to NULL on DatabaseRegistry
    await client.$executeRawUnsafe(`DELETE FROM "Profile" WHERE "id" = '${profId}';`);

    const regAfter = await client.$queryRawUnsafe<any[]>(
      `SELECT * FROM "DatabaseRegistry" WHERE "id" = '${validRegId}';`
    );
    expect(regAfter.length).toBe(1);
    expect(regAfter[0].profileId).toBeNull(); // Set to NULL by SQLite foreign key ON DELETE SET NULL
    expect(regAfter[0].databaseId).toBe(logicalDbId); // Logical identity preserved
    expect(regAfter[0].canonicalPath).toBe(profileDbFile); // Path preserved
    expect(fs.existsSync(profileDbFile)).toBe(true); // Physical file on disk preserved!

    await client.$disconnect();
  });
});
