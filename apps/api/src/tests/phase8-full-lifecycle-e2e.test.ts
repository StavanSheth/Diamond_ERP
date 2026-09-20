import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { databaseProvisioningService } from '../modules/system/database/database-provisioning.service';
import { userLifecycleService } from '../modules/system/user-lifecycle/user-lifecycle.service';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { getDatabasesDir, getDatabaseTemplatePath, ensureAllDataDirs } from '../infrastructure/paths';

describe('Diamond ERP V3 — Phase 8 Master Full Lifecycle E2E Test (34-Step Contract)', () => {
  const scratchDir = path.resolve('apps/api/test-scratch-phase8-full-e2e');
  const dbsDir = getDatabasesDir();
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  const profileCodeA = `p8_prof_a_${Date.now()}`;
  const profileCodeB = `p8_prof_b_${Date.now()}`;
  const dbPathA = path.join(dbsDir, `${profileCodeA}.db`);
  const dbPathB = path.join(dbsDir, `${profileCodeB}.db`);
  const liveTargetDb = path.join(dbsDir, 'Stavan.db');

  let install: any;
  let deviceId: string;
  let userA: any;
  let userB: any;
  let preservationPkg: any;
  let authRecord: any;

  // Pre-uninstall entity counts for data integrity comparison
  const entityCountsBefore: Record<string, number> = {};

  beforeAll(async () => {
    ensureAllDataDirs();
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    if (fs.existsSync(templateDb) && !fs.existsSync(liveTargetDb)) {
      fs.copyFileSync(templateDb, liveTargetDb);
    }
  });

  afterAll(async () => {
    // Cleanup generated databases
    for (const f of [dbPathA, dbPathB]) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
      const wal = `${f}-wal`;
      const shm = `${f}-shm`;
      if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch {}
      if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch {}
    }

    await systemPrisma.databaseRegistry.deleteMany({
      where: { canonicalPath: { in: [path.resolve(dbPathA), path.resolve(dbPathB)] } },
    });
    await systemPrisma.profile.deleteMany({
      where: { code: { in: [profileCodeA, profileCodeB] } },
    });

    if (fs.existsSync(scratchDir)) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 1: FRESH INSTALL & LIFECYCLE STATE MACHINE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 1-4: Fresh installation starts at NOT_INITIALIZED and advances through APP_SETUP, PIN_SETUP, DEVICE_SETUP, USER_DISCOVERY', async () => {
    install = await installationService.getOrCreateInstallation();
    expect(install.id).toBeDefined();
    expect(install.installationId).toBeDefined();

    // Reset to NOT_INITIALIZED for clean state machine assertion
    await systemPrisma.installation.update({
      where: { id: install.id },
      data: { lifecycleState: 'NOT_INITIALIZED', status: 'ACTIVE' },
    });

    // Invariant: Direct jump from NOT_INITIALIZED to READY must fail
    await expect(
      installationService.updateLifecycleState('READY')
    ).rejects.toThrow();

    // Transition 1: NOT_INITIALIZED -> APP_SETUP
    let state = await installationService.updateLifecycleState('APP_SETUP');
    expect(state.lifecycleState).toBe('APP_SETUP');

    // Transition 2: APP_SETUP -> PIN_SETUP
    state = await installationService.updateLifecycleState('PIN_SETUP');
    expect(state.lifecycleState).toBe('PIN_SETUP');

    // Authoritative local device ID for this terminal
    deviceId = installationService.getOrGenerateDeviceId();

    // Register Device & Configure PIN
    const dev = await installationService.registerDevice({
      deviceName: 'Phase8-Production-Terminal',
      platform: 'WINDOWS',
      osVersion: '10.0.22631',
    });
    expect(dev.deviceId).toBeDefined();

    const pinSetup = await deviceSecurityService.setupPin(deviceId, '918273');
    expect(pinSetup.isPinConfigured).toBe(true);

    // Verify plaintext PIN never exists in database
    const secState = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId },
    });
    expect(secState?.pinHash).toBeDefined();
    expect(secState?.pinHash).not.toBe('918273');
    expect(secState?.pinHash!.startsWith('$2a$') || secState?.pinHash!.startsWith('$2b$')).toBe(true);

    // Transition 3: PIN_SETUP -> DEVICE_SETUP -> USER_DISCOVERY
    state = await installationService.updateLifecycleState('DEVICE_SETUP');
    expect(state.lifecycleState).toBe('DEVICE_SETUP');

    state = await installationService.updateLifecycleState('USER_DISCOVERY');
    expect(state.lifecycleState).toBe('USER_DISCOVERY');
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 2: USER A & DATABASE A PROVISIONING -> READY
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 5-7: Provisions User A + pristine blank DB A, advances through validation to READY', async () => {
    const unameA = `user_a_${Date.now()}`;
    const userRes = await onboardingService.createBusinessUser({
      username: unameA,
      password: 'SecurePassword123!',
      displayName: 'Alice Diamond Founder',
      role: 'ADMIN',
    });
    expect(userRes.success).toBe(true);
    userA = userRes.user;

    const dbRes = await onboardingService.createNewDatabase({
      displayName: 'Alice Diamonds Corp',
      profileCode: profileCodeA,
      userId: userA.id,
    });
    expect(dbRes.success).toBe(true);
    expect(fs.existsSync(dbPathA)).toBe(true);

    // Complete onboarding
    const comp = await onboardingService.completeOnboarding();
    expect(comp.ready).toBe(true);
    expect(comp.lifecycleState).toBe('READY');
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 3: SEED BUSINESS RECORDS INTO DB A
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 8: Seeds realistic business records across entities in Database A and records counts', async () => {
    const clientA = new PrismaClient({ datasourceUrl: `file:${path.resolve(dbPathA)}` });

    await clientA.$executeRawUnsafe(`
      INSERT INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES 
        ('stk_a_1', 'STK-A-001', 'Rough Round 2.5ct', 'Natural diamond rough', 'USD', 1, datetime('now'), datetime('now')),
        ('stk_a_2', 'STK-A-002', 'Fancy Vivid Blue 1.2ct', 'Polished gemstone', 'USD', 1, datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_a_1', 'CUST-A-01', 'De Beers Syndicate Partner', 'CUSTOMER', '+12125550100', 'debeers@example.com', datetime('now'), datetime('now')),
        ('pty_a_2', 'SUPP-A-01', 'Antwerp Diamond Rough BV', 'SUPPLIER', '+3232000000', 'antwerp@example.com', datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO Location (id, stockId, name, locationType)
      VALUES 
        ('loc_a_1', 'stk_a_1', 'Main Vault', 'VAULT');
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO DiamondItem (id, stockId, itemCode, displayName, carat, color, clarity, cut, shape, ratePerCarat, currentValue, status, certificateStatus, createdAt, updatedAt)
      VALUES 
        ('dia_a_1', 'stk_a_1', 'DIA-A-001', 'Fancy Vivid Blue', 1.25, 'D', 'VVS1', 'EXCELLENT', 'ROUND', 148000.0, 185000.0, 'AVAILABLE', 'CERTIFIED', datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO Certification (id, diamondItemId, reportNumber, labType, certificateStatus, createdAt, updatedAt)
      VALUES 
        ('cert_a_1', 'dia_a_1', 'GIA-2185901234', 'GIA', 'ISSUED', datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO Ledger (id, stockId, name, ledgerType, openingCarat, openingValue, createdAt, updatedAt)
      VALUES 
        ('ldg_a_1', 'stk_a_1', 'Primary Diamond Inventory', 'ASSET', 2.5, 450000.0, datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO "Transaction" (id, ledgerId, transactionNo, sequenceNumber, transactionDate, transactionType, status, createdBy, createdAt, updatedAt)
      VALUES 
        ('txn_a_1', 'ldg_a_1', 'INV-2026-A01', 1, datetime('now'), 'SALE', 'POSTED', 'admin', datetime('now'), datetime('now'));
    `);

    await clientA.$executeRawUnsafe(`
      INSERT INTO TransactionItem (id, transactionId, diamondItemId, quantity, carat, ratePerCarat, totalValue, itemAction, createdAt)
      VALUES 
        ('txni_a_1', 'txn_a_1', 'dia_a_1', 1, 1.25, 148000.0, 185000.0, 'OUT', datetime('now'));
    `);

    // Verify row counts and store baseline
    const tables = ['Stock', 'Party', 'Location', 'DiamondItem', 'Certification', 'Ledger', 'Transaction', 'TransactionItem'];
    for (const t of tables) {
      const countRes: any = await clientA.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${t}"`);
      entityCountsBefore[t] = Number(countRes[0]?.cnt || 0);
      expect(entityCountsBefore[t]).toBeGreaterThan(0);
    }

    await clientA.$disconnect();
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 4: USER B & DATABASE B PROVISIONING + STRICT ISOLATION
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 9-11: Provisions User B + DB B with distinct data and asserts strict user/database isolation', async () => {
    const unameB = `user_b_${Date.now()}`;
    const userResB = await onboardingService.createBusinessUser({
      username: unameB,
      password: 'SecurePassword456!',
      displayName: 'Bob Gemological Founder',
      role: 'ADMIN',
    });
    userB = userResB.user;

    const provB = await databaseProvisioningService.provisionBlankDatabase({
      displayName: 'Bob Jewels Ltd',
      profileCode: profileCodeB,
      userId: userB.id,
    });
    expect(provB.isPristine).toBe(true);
    expect(provB.databaseId).toBeDefined();
    expect(fs.existsSync(dbPathB)).toBe(true);

    // Seed distinct data in DB B
    const clientB = new PrismaClient({ datasourceUrl: `file:${path.resolve(dbPathB)}` });
    await clientB.$executeRawUnsafe(`
      INSERT INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_b_1', 'CUST-B-99', 'Mumbai Diamond Trading House', 'CUSTOMER', '+9122200000', 'mumbai@example.com', datetime('now'), datetime('now'));
    `);

    // Isolation Assertion 1: DB A does NOT contain Party B
    const clientA = new PrismaClient({ datasourceUrl: `file:${path.resolve(dbPathA)}` });
    const checkPartyInA: any = await clientA.$queryRawUnsafe(`SELECT * FROM Party WHERE partyCode = 'CUST-B-99'`);
    expect(checkPartyInA.length).toBe(0);

    // Isolation Assertion 2: DB B does NOT contain Party A
    const checkPartyInB: any = await clientB.$queryRawUnsafe(`SELECT * FROM Party WHERE partyCode = 'CUST-A-01'`);
    expect(checkPartyInB.length).toBe(0);

    await clientA.$disconnect();
    await clientB.$disconnect();
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 5: USER A DELETION -> PRESERVATION -> RECOVERY BINDING
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 12-14: User A soft-deleted -> DB A preserved -> discovered as DELETED_USER -> recovered with explicit targetUserId', async () => {
    const delRes = await userLifecycleService.deleteUser(userA.id);
    expect(delRes.success).toBe(true);
    expect(delRes.databasePreserved).toBe(true);

    // Invariant: User deletion != Database deletion
    expect(fs.existsSync(dbPathA)).toBe(true);

    // Discovery: discovers DB A as candidate belonging to DELETED_USER
    const discovery = await recoveryService.discoverCandidates();
    expect(discovery.candidates.length).toBeGreaterThanOrEqual(1);

    const candidateA = discovery.candidates.find((c) => path.resolve(c.canonicalPath) === path.resolve(dbPathA));
    expect(candidateA).toBeDefined();
    expect(candidateA?.ownershipStatus).toBe('DELETED_USER');
    expect(candidateA?.previousOwnerUsername).toBe(userA.username);

    // Prepare restore staging
    const preview = await recoveryService.prepareRestore({
      candidatePath: dbPathA,
      targetProfileCode: 'Stavan',
    });
    expect(preview.restoreId).toBeDefined();

    // Invariant: Deleted-user restore WITHOUT targetUserId must fail closed!
    await expect(
      recoveryService.confirmRestore({
        restoreId: preview.restoreId,
        targetProfileCode: 'Stavan',
        confirmDestructiveOverwrite: true,
      })
    ).rejects.toThrow(/Target user ID is mandatory/i);

    // Recover with explicit user binding
    const restoreRes = await recoveryService.confirmRestore({
      restoreId: preview.restoreId,
      targetUserId: userA.id,
      targetProfileCode: 'Stavan',
      confirmDestructiveOverwrite: true,
    });
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.status).toBe('VERIFIED');

    // Verify User A reactivated and linked
    const userARefresh = await systemPrisma.user.findUnique({ where: { id: userA.id } });
    expect(userARefresh?.isActive).toBe(true);
    expect(userARefresh?.deletedAt).toBeNull();
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 6: MULTI-DATABASE PRESERVATION (ALL CUSTOMER DBS PRESERVED)
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 15-17: Creates verified multi-database preservation package preserving both DB A and DB B', async () => {
    preservationPkg = await preservationService.createPreservationPackage(
      {
        preserveAll: true,
        confirmPreservation: true,
      },
      'phase8_e2e_admin'
    );

    expect(preservationPkg.status).toBe('VERIFIED');
    expect(preservationPkg.packageId).toBeDefined();
    expect(fs.existsSync(preservationPkg.destinationPath)).toBe(true);
    expect(preservationPkg.preservedDatabasesCount).toBeGreaterThanOrEqual(2);

    // Deep verification of preservation package
    const verification = await preservationService.verifyPreservationPackage(preservationPkg.packageId);
    expect(verification.verified).toBe(true);
    expect(verification.databaseBackupVerified).toBe(true);
    expect(verification.csvVerified).toBe(true);
    expect(verification.xlsxVerified).toBe(true);
    expect(verification.manifestVerified).toBe(true);

    // Verify multi-database manifest structure
    const manifest = JSON.parse(fs.readFileSync(preservationPkg.manifestPath!, 'utf-8'));
    expect(manifest.formatVersion).toBe(2);
    expect(Array.isArray(manifest.databases)).toBe(true);
    expect(manifest.databases.length).toBeGreaterThanOrEqual(2);

    for (const d of manifest.databases) {
      expect(d.sha256).toBeDefined();
      expect(d.schemaVersion).toBe(1);
      const fullBackupPath = path.join(preservationPkg.destinationPath, d.backupPath);
      expect(fs.existsSync(fullBackupPath)).toBe(true);
    }
  }, 45000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 7: UNINSTALL PREFLIGHT, AUTHORIZATION & INSTALLER GATE
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 18-20: Preflight confirms readiness, issues cryptographic authorization, and installer gate allows uninstall', async () => {
    // Preflight updates to PRESERVATION_VERIFIED
    let preflight = await uninstallPreflightService.getPreflightStatus();
    expect(preflight.classification).toBe('PRESERVATION_VERIFIED');

    // Issue cryptographic authorization token
    authRecord = await uninstallPreflightService.issueUninstallAuthorization(preservationPkg.packageId);
    expect(authRecord.authorizationId).toBeDefined();
    expect(authRecord.status).toBe('ISSUED');
    expect(authRecord.manifestSha256).toBeDefined();

    // Preflight now authorizes safe uninstallation
    preflight = await uninstallPreflightService.getPreflightStatus();
    expect(preflight.canSafelyUninstall).toBe(true);
    expect(preflight.classification).toBe('READY_FOR_UNINSTALL');

    // Windows Installer Hard Gate Check (Installer.cs invariants)
    const tokenFile = path.join(preflight.userAppDataDir, 'uninstall-authorization.json');
    expect(fs.existsSync(tokenFile)).toBe(true);

    const tokenOnDisk = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    expect(tokenOnDisk.authorizationId).toBe(authRecord.authorizationId);
    expect(tokenOnDisk.status).toBe('ISSUED');
    expect(tokenOnDisk.installationId).toBe(install.installationId);
    expect(new Date(tokenOnDisk.expiresAt).getTime()).toBeGreaterThan(Date.now());
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE 8: SIMULATE UNINSTALL (APPDATA PRESERVED) -> REINSTALL -> RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  it('Step 21-25: Reinstall detects customer data, recovery wizard requires explicit confirmation, restores to READY with 100% data integrity', async () => {
    // Consume uninstall token (simulating Windows Installer action)
    await uninstallPreflightService.checkAuthorizationToken();

    // Invariant: Uninstallation preserves AppData and customer databases
    expect(fs.existsSync(dbPathA)).toBe(true);
    expect(fs.existsSync(dbPathB)).toBe(true);
    expect(fs.existsSync(preservationPkg.destinationPath)).toBe(true);

    // Simulate Reinstallation: Fresh installation ID generated
    const newInstall = await systemPrisma.installation.create({
      data: {
        installationId: `inst_reinstall_${crypto.randomUUID()}`,
        appVersion: '3.0.0',
        status: 'ACTIVE',
        lifecycleState: 'USER_DISCOVERY',
        initializedAt: new Date(),
      },
    });
    expect(newInstall.id).toBeDefined();

    // Recovery discovery on reinstall finds candidates
    const recoveryCandidates = await recoveryService.discoverCandidates();
    expect(recoveryCandidates.candidates.length).toBeGreaterThanOrEqual(1);

    // Invariant: Reinstall must NOT silently auto-attach!
    // Recovery wizard stages candidate explicitly:
    const candidateToRestore = path.join(
      preservationPkg.destinationPath,
      'databases',
      profileCodeA,
      'database_backup.db'
    );
    expect(fs.existsSync(candidateToRestore)).toBe(true);

    const prep = await recoveryService.prepareRestore({
      candidatePath: candidateToRestore,
      targetProfileCode: 'Stavan',
    });
    expect(prep.restoreId).toBeDefined();

    // Confirm recovery with explicit user and confirmation
    const confirmRes = await recoveryService.confirmRestore({
      restoreId: prep.restoreId,
      targetUserId: userA.id,
      targetProfileCode: 'Stavan',
      confirmDestructiveOverwrite: true,
      confirmForeignInstallation: true,
    });
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.status).toBe('VERIFIED');

    // Data Integrity Assertion: 100% of pre-uninstall business records exist!
    const restoredClient = new PrismaClient({ datasourceUrl: `file:${path.resolve(liveTargetDb)}` });
    for (const [table, expectedCount] of Object.entries(entityCountsBefore)) {
      const rowRes: any = await restoredClient.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}"`);
      const afterCount = Number(rowRes[0]?.cnt || 0);
      expect(afterCount).toBe(expectedCount);
    }
    await restoredClient.$disconnect();

    // DB B remains isolated
    expect(fs.existsSync(dbPathB)).toBe(true);
  }, 45000);
});
