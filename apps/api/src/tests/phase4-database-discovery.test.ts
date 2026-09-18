import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { canonicalizeDatabasePath } from '../modules/system/database/database-path.util';
import {
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError, ConflictError } from '../errors';

describe('Diamond ERP V3 — Phase 4: Database Discovery, Path Security & Ownership Hardening', () => {
  let installId: string;
  const createdTestFiles: string[] = [];

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;

    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'DATABASE_DISCOVERY', status: 'ACTIVE' },
    });
  });

  afterEach(() => {
    for (const f of createdTestFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
      const wal = `${f}-wal`;
      const shm = `${f}-shm`;
      if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch {}
      if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch {}
    }
    createdTestFiles.length = 0;
  });

  // ── 1. Robust Windows Path Security ──────────────────────────────────────
  describe('1. Robust Windows Path Validation & Security', () => {
    it('rejects empty or whitespace paths', () => {
      const empty = canonicalizeDatabasePath('');
      expect(empty.valid).toBe(false);
      expect(empty.error).toContain('cannot be empty');

      const spaces = canonicalizeDatabasePath('   ');
      expect(spaces.valid).toBe(false);
      expect(spaces.error).toContain('cannot be empty');
    });

    it('rejects null byte injection in paths', () => {
      const res = canonicalizeDatabasePath('valid.db\0malicious.exe');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('null bytes');
    });

    it('rejects UNC network share paths explicitly', () => {
      const unc1 = canonicalizeDatabasePath('\\\\server\\share\\company.db');
      expect(unc1.valid).toBe(false);
      expect(unc1.error).toContain('UNC and network share paths are not supported');

      const unc2 = canonicalizeDatabasePath('//server/share/company.db');
      expect(unc2.valid).toBe(false);
      expect(unc2.error).toContain('UNC and network share paths are not supported');
    });

    it('rejects invalid Windows filesystem characters', () => {
      const res1 = canonicalizeDatabasePath('C:\\databases\\<company>.db');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('invalid filesystem characters');

      const res2 = canonicalizeDatabasePath('test|database.db');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('invalid filesystem characters');

      const res3 = canonicalizeDatabasePath('data"base.db');
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('invalid filesystem characters');
    });

    it('rejects reserved Windows DOS device names', () => {
      const conRes = canonicalizeDatabasePath('CON.db');
      expect(conRes.valid).toBe(false);
      expect(conRes.error).toContain('reserved Windows device name (CON)');

      const nulRes = canonicalizeDatabasePath('C:\\test\\NUL.sqlite');
      expect(nulRes.valid).toBe(false);
      expect(nulRes.error).toContain('reserved Windows device name (NUL)');

      const comRes = canonicalizeDatabasePath('COM1.db');
      expect(comRes.valid).toBe(false);
      expect(comRes.error).toContain('reserved Windows device name (COM1)');
    });

    it('rejects directory paths when path points to an existing directory', () => {
      const dbDir = getDatabasesDir();
      const res = canonicalizeDatabasePath(dbDir);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('points to a directory');
    });

    it('resolves valid relative and absolute paths cleanly', () => {
      const res = canonicalizeDatabasePath('test_valid.db');
      expect(res.valid).toBe(true);
      expect(path.isAbsolute(res.canonicalPath)).toBe(true);
    });
  });

  // ── 2. Boundary Invariants: Control DB & Template DB ────────────────────
  describe('2. Control DB & Template DB Attachment Boundaries', () => {
    it('rejects system.db from candidate inspection and attachment', async () => {
      const controlDbPath = getControlDbPath();
      const preview = await onboardingService.inspectDatabaseCandidate(controlDbPath);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');

      await expect(
        onboardingService.attachExistingDatabase({
          path: controlDbPath,
          confirmAttachment: true,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects template.db from candidate inspection and attachment', async () => {
      const templatePath = getDatabaseTemplatePath();
      if (!templatePath) return;

      const preview = await onboardingService.inspectDatabaseCandidate(templatePath);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_IS_TEMPLATE');

      await expect(
        onboardingService.attachExistingDatabase({
          path: templatePath,
          confirmAttachment: true,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ── 3. Cross-Installation Ownership Conflict ─────────────────────────────
  describe('3. Cross-Installation Ownership Conflict Protection', () => {
    it('strictly forbids attaching a database registered under another installation', async () => {
      // Create foreign installation
      const foreignInstall = await systemPrisma.installation.create({
        data: {
          installationId: `foreign-inst-${Date.now()}`,
          appVersion: '3.0.0',
          status: 'ACTIVE',
        },
      });

      // Create a test DB file
      const templatePath = getDatabaseTemplatePath()!;
      const testDbPath = path.resolve(getDatabasesDir(), `foreign_owned_${Date.now()}.db`);
      fs.copyFileSync(templatePath, testDbPath);
      createdTestFiles.push(testDbPath);

      // Register test DB under foreign installation
      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: crypto.randomUUID(),
          displayName: 'Foreign Office DB',
          canonicalPath: testDbPath,
          schemaVersion: 1,
          status: 'ACTIVE',
          databaseType: 'EXTERNAL',
          installationId: foreignInstall.id,
        },
      });

      // Current installation inspects it
      const preview = await onboardingService.inspectDatabaseCandidate(testDbPath);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_INSTALLATION_CONFLICT');

      // Attempt attachment -> throws ConflictError and does not claim ownership
      await expect(
        onboardingService.attachExistingDatabase({
          path: testDbPath,
          confirmAttachment: true,
        })
      ).rejects.toThrow(ConflictError);

      // Verify registry record still belongs to foreign installation
      const regAfter = await systemPrisma.databaseRegistry.findUnique({
        where: { canonicalPath: testDbPath },
      });
      expect(regAfter?.installationId).toBe(foreignInstall.id);
    });
  });

  // ── 4. Re-attachment Idempotency ─────────────────────────────────────────
  describe('4. Re-attachment Idempotency', () => {
    it('is strictly idempotent when attaching the same database twice to the current installation', async () => {
      const templatePath = getDatabaseTemplatePath()!;
      const testDbPath = path.resolve(getDatabasesDir(), `idem_db_${Date.now()}.db`);
      fs.copyFileSync(templatePath, testDbPath);
      createdTestFiles.push(testDbPath);

      // 1. First attachment
      const first = await onboardingService.attachExistingDatabase({
        path: testDbPath,
        displayName: 'First Attach Name',
        confirmAttachment: true,
      });
      expect(first.success).toBe(true);

      const count1 = await systemPrisma.databaseRegistry.count({
        where: { canonicalPath: testDbPath },
      });
      expect(count1).toBe(1);

      // 2. Second attachment of the same database
      const second = await onboardingService.attachExistingDatabase({
        path: testDbPath,
        displayName: 'Second Attach Name',
        confirmAttachment: true,
      });
      expect(second.success).toBe(true);
      expect(second.registry.id).toBe(first.registry.id);

      const count2 = await systemPrisma.databaseRegistry.count({
        where: { canonicalPath: testDbPath },
      });
      expect(count2).toBe(1); // Zero duplicate rows!
    });
  });

  // ── 5. Explicit Confirmation Requirement ─────────────────────────────────
  describe('5. Mandatory Explicit Confirmation', () => {
    it('rejects attachment when confirmAttachment is false', async () => {
      const templatePath = getDatabaseTemplatePath()!;
      const testDbPath = path.resolve(getDatabasesDir(), `unconfirmed_${Date.now()}.db`);
      fs.copyFileSync(templatePath, testDbPath);
      createdTestFiles.push(testDbPath);

      await expect(
        onboardingService.attachExistingDatabase({
          path: testDbPath,
          confirmAttachment: false, // Not confirmed
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── 6. Deterministic Suitability Classification ──────────────────────────
  describe('6. Deterministic Suitability Classification', () => {
    it('classifies corrupted SQLite file as CORRUPTED', async () => {
      const corruptFile = path.resolve(getDatabasesDir(), `corrupt_${Date.now()}.db`);
      // Write valid 16-byte SQLite header followed by garbage
      const buf = Buffer.alloc(1024);
      Buffer.from('SQLite format 3\0').copy(buf, 0);
      fs.writeFileSync(corruptFile, buf);
      createdTestFiles.push(corruptFile);

      const preview = await onboardingService.inspectDatabaseCandidate(corruptFile);
      expect(preview.suitability).toBe('CORRUPTED');
    });

    it('classifies plain text file as INVALID', async () => {
      const textFile = path.resolve(getDatabasesDir(), `not_sqlite_${Date.now()}.db`);
      fs.writeFileSync(textFile, 'This is just a plain text file, not SQLite.');
      createdTestFiles.push(textFile);

      const preview = await onboardingService.inspectDatabaseCandidate(textFile);
      expect(preview.suitability).toBe('INVALID');
    });

    it('classifies non-existent file as INVALID with missing status', async () => {
      const preview = await onboardingService.inspectDatabaseCandidate('C:\\does_not_exist_123.db');
      expect(preview.suitability).toBe('INVALID');
    });
  });
});
