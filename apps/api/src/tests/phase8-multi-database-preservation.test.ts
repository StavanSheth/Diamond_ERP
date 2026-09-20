import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { installationService } from '../modules/system/installation.service';
import { getDatabasesDir, getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 8 — Multi-Database Customer Data Preservation (P0)', () => {
  const testRoot = path.resolve(__dirname, '../../test-scratch-phase8-multi-db');
  const customExportDir = path.join(testRoot, 'exports');
  const dbsDir = getDatabasesDir();

  const userA = { username: `alice_${Date.now()}`, profileCode: `Alice_${Date.now()}` };
  const userB = { username: `bob_${Date.now()}`, profileCode: `Bob_${Date.now()}` };
  const userC = { username: `charlie_${Date.now()}`, profileCode: `Charlie_${Date.now()}` };

  const dbPaths = {
    alice: path.join(dbsDir, `${userA.profileCode}.db`),
    bob: path.join(dbsDir, `${userB.profileCode}.db`),
    charlie: path.join(dbsDir, `${userC.profileCode}.db`),
  };

  let install: any;
  let createdPackage: any;

  beforeAll(async () => {
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(customExportDir, { recursive: true });

    install = await installationService.getOrCreateInstallation();
    const templateDb = getDatabaseTemplatePath();

    // Create 3 physical customer databases from template
    for (const [key, dbPath] of Object.entries(dbPaths)) {
      if (templateDb && fs.existsSync(templateDb)) {
        fs.copyFileSync(templateDb, dbPath);
      } else {
        const dummyClient = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } });
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
      const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } } });
      const user = key === 'alice' ? userA : key === 'bob' ? userB : userC;

      await client.$executeRawUnsafe(
        `INSERT OR REPLACE INTO "Stock" (id, stockCode, name, description, currency, isActive, createdAt, updatedAt) VALUES ('${crypto.randomUUID()}', 'STK_${user.profileCode}_1', 'Diamond Stock for ${user.username}', 'Desc', 'USD', 1, datetime('now'), datetime('now'));`
      );
      await client.$executeRawUnsafe(
        `INSERT OR REPLACE INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES ('${crypto.randomUUID()}', 'PTY_${user.profileCode}_1', 'Party for ${user.username}', 'CUSTOMER', datetime('now'), datetime('now'));`
      );
      await client.$disconnect();

      // Create control User, Profile, UserProfile, and DatabaseRegistry
      const dbUser = await systemPrisma.user.create({
        data: {
          username: user.username,
          displayName: `${user.username} User`,
          role: 'ADMIN',
          passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz01234567890123456789',
          isActive: true,
        },
      });

      const profile = await systemPrisma.profile.create({
        data: {
          code: user.profileCode,
          name: `${user.profileCode} Profile`,
          dbPath,
          isActive: true,
          status: 'ACTIVE',
        },
      });

      await systemPrisma.userProfile.create({
        data: {
          userId: dbUser.id,
          profileId: profile.id,
          role: 'ADMIN',
          isActive: true,
        },
      });

      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: `db_${user.profileCode}`,
          displayName: `${user.profileCode} DB`,
          canonicalPath: path.resolve(dbPath),
          schemaVersion: 1,
          status: 'ACTIVE',
          databaseType: 'LOCAL_PROFILE',
          profileId: profile.id,
          installationId: install.id,
        },
      });
    }
  });

  afterAll(async () => {
    // Cleanup databases
    for (const dbPath of Object.values(dbPaths)) {
      if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch {}
      }
    }
    if (fs.existsSync(testRoot)) {
      try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch {}
    }
  });

  it('P0-1: preserves ALL active customer databases (User A, User B, User C) into one verified bundle', async () => {
    createdPackage = await preservationService.createPreservationPackage({
      destinationDir: customExportDir,
      confirmPreservation: true,
    });

    expect(createdPackage.status).toBe('VERIFIED');
    expect(createdPackage.preservedDatabasesCount).toBeGreaterThanOrEqual(3);

    // Verify preservation manifest
    const manifestPath = path.join(createdPackage.destinationPath, 'preservation-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.formatVersion).toBe(2);
    expect(Array.isArray(manifest.databases)).toBe(true);
    expect(manifest.databases.length).toBeGreaterThanOrEqual(3);

    // Verify all 3 databases are represented with their respective owner/profile
    const codes = manifest.databases.map((d: any) => d.profileCode);
    expect(codes).toContain(userA.profileCode);
    expect(codes).toContain(userB.profileCode);
    expect(codes).toContain(userC.profileCode);

    // Verify each database has backup, CSV folder, and XLSX workbook on disk
    for (const user of [userA, userB, userC]) {
      const dbEntry = manifest.databases.find((d: any) => d.profileCode === user.profileCode);
      expect(dbEntry).toBeDefined();
      expect(dbEntry.sha256).toBeDefined();

      const backupOnDisk = path.join(createdPackage.destinationPath, dbEntry.backupPath);
      expect(fs.existsSync(backupOnDisk)).toBe(true);

      const csvOnDisk = path.join(createdPackage.destinationPath, dbEntry.csvDir, 'Stock.csv');
      expect(fs.existsSync(csvOnDisk)).toBe(true);
      const csvContent = fs.readFileSync(csvOnDisk, 'utf-8');
      expect(csvContent).toContain(`Diamond Stock for ${user.username}`);

      const xlsxOnDisk = path.join(createdPackage.destinationPath, dbEntry.xlsxFile);
      expect(fs.existsSync(xlsxOnDisk)).toBe(true);
    }
  }, 30000);

  it('P0-2: multi-database verification engine idempotently verifies every preserved database', async () => {
    const vResult = await preservationService.verifyPreservationPackage(createdPackage.packageId);
    expect(vResult.verified).toBe(true);
    expect(vResult.status).toBe('VERIFIED');
    expect(vResult.databaseBackupVerified).toBe(true);
    expect(vResult.csvVerified).toBe(true);
    expect(vResult.xlsxVerified).toBe(true);
  }, 30000);

  it('P0-3: all-or-nothing rule: corruption of ANY single customer database fails the entire package verification', async () => {
    // Tamper with Bob's database backup inside the preservation package
    const manifestPath = path.join(createdPackage.destinationPath, 'preservation-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const bobEntry = manifest.databases.find((d: any) => d.profileCode === userB.profileCode);

    const bobBackup = path.join(createdPackage.destinationPath, bobEntry.backupPath);
    fs.appendFileSync(bobBackup, '\ncorrupt_tamper_bytes');

    const vResult = await preservationService.verifyPreservationPackage(createdPackage.packageId);
    expect(vResult.verified).toBe(false);
    expect(vResult.status).toBe('FAILED');
    expect(vResult.error).toContain('checksum mismatch');
  });
});
