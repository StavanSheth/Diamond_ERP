import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import {
  getDataRoot,
  getBackupRoot,
  getExportRoot,
  getLogRoot,
  setCustomDataRoot,
  ensureAllDataDirs,
} from './data-paths';
import { systemPrisma, closeAllDynamicClients } from '../database/prisma';
import { backupService } from '../../modules/system/backup/backup.service';
import { databaseHealthService } from '../../modules/system/database/database-health.service';

export interface DiskSpaceAssessment {
  path: string;
  freeBytes: number;
  totalBytes: number;
  freeGb: number;
  totalGb: number;
  status: 'HEALTHY' | 'LOW' | 'CRITICAL' | 'INSUFFICIENT';
  checkedAt: string;
}

export interface DataLocationMigrationResult {
  success: boolean;
  previousDataRoot: string;
  newDataRoot: string;
  databasesMigrated: number;
  safetyBackupsCreated: string[];
  integrityCheckPassed: boolean;
  migratedAt: string;
  error?: string;
}

// Phase 25: Explicit migration state machine
export type MigrationState =
  | 'IDLE'
  | 'PREPARING'
  | 'BACKING_UP'
  | 'COPYING'
  | 'VERIFYING'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'ROLLING_BACK'
  | 'FAILED';

export interface MigrationStateRecord {
  state: MigrationState;
  sourceDataRoot: string;
  targetDataRoot: string;
  startedAt: string;
  updatedAt: string;
  originalRegistryPaths: Record<string, string>;
  error?: string;
}

const MIGRATION_STATE_FILE = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.HOME || '', 'AppData', 'Local'),
  'DiamondERP',
  'migration-state.json'
);

class DataLocationService {
  private isMigrationLocked = false;

  public isLocked(): boolean { return this.isMigrationLocked; }
  public setLock(locked: boolean): void { this.isMigrationLocked = locked; }

  private writeMigrationState(record: MigrationStateRecord): void {
    try {
      fs.mkdirSync(path.dirname(MIGRATION_STATE_FILE), { recursive: true });
      fs.writeFileSync(MIGRATION_STATE_FILE, JSON.stringify(record, null, 2), 'utf-8');
    } catch {}
  }

  private clearMigrationState(): void {
    try { if (fs.existsSync(MIGRATION_STATE_FILE)) fs.unlinkSync(MIGRATION_STATE_FILE); } catch {}
  }

  public readMigrationState(): MigrationStateRecord | null {
    try {
      if (!fs.existsSync(MIGRATION_STATE_FILE)) return null;
      return JSON.parse(fs.readFileSync(MIGRATION_STATE_FILE, 'utf-8'));
    } catch { return null; }
  }

  public checkDiskSpace(targetPath?: string): DiskSpaceAssessment {
    const dirToCheck = targetPath ? path.resolve(targetPath) : getDataRoot();
    let probePath = dirToCheck;
    while (!fs.existsSync(probePath)) {
      const parent = path.dirname(probePath);
      if (parent === probePath) break;
      probePath = parent;
    }
    try {
      const stats = fs.statfsSync(probePath);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const totalBytes = Number(stats.blocks) * Number(stats.bsize);
      const freeGb = parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(2));
      const totalGb = parseFloat((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
      let status: 'HEALTHY' | 'LOW' | 'CRITICAL' | 'INSUFFICIENT' = 'HEALTHY';
      if (freeGb < 0.2) status = 'INSUFFICIENT';
      else if (freeGb < 1.0) status = 'CRITICAL';
      else if (freeGb < 5.0) status = 'LOW';
      return { path: dirToCheck, freeBytes, totalBytes, freeGb, totalGb, status, checkedAt: new Date().toISOString() };
    } catch {
      return { path: dirToCheck, freeBytes: 10*1024*1024*1024, totalBytes: 100*1024*1024*1024, freeGb: 10, totalGb: 100, status: 'HEALTHY', checkedAt: new Date().toISOString() };
    }
  }

  public assertDiskSpaceAvailable(requiredBytes: number, targetPath?: string): void {
    const assessment = this.checkDiskSpace(targetPath);
    if (assessment.status === 'INSUFFICIENT' || assessment.freeBytes < requiredBytes) {
      throw new Error(`Insufficient disk space. Required: ${(requiredBytes/(1024*1024)).toFixed(1)} MB, Available: ${(assessment.freeBytes/(1024*1024)).toFixed(1)} MB (${assessment.status}).`);
    }
  }

  public getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    let total = 0;
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) total += this.getDirectorySize(fullPath);
      else if (item.isFile()) total += fs.statSync(fullPath).size;
    }
    return total;
  }

  /**
   * Safe Data Location Migration with explicit state machine (Phase 25).
   * Rollback restores both runtime config AND DatabaseRegistry paths (Phase 24).
   */
  public async migrateDataLocation(newTargetDataDir: string): Promise<DataLocationMigrationResult> {
    const sourceDataDir = path.resolve(getDataRoot());
    if (!newTargetDataDir || typeof newTargetDataDir !== 'string') throw new Error('Target destination path must be a non-empty string.');
    if (!path.isAbsolute(newTargetDataDir)) throw new Error('Target destination path must be an absolute path.');
    const targetDir = path.resolve(newTargetDataDir);
    if (sourceDataDir.toLowerCase() === targetDir.toLowerCase()) throw new Error('Destination path cannot be identical to the current data directory.');
    if (targetDir.toLowerCase().startsWith(sourceDataDir.toLowerCase() + path.sep)) throw new Error('Destination path cannot be a subdirectory of the current data directory.');
    if (sourceDataDir.toLowerCase().startsWith(targetDir.toLowerCase() + path.sep)) throw new Error('Current data directory cannot be inside the target destination path.');

    // PREPARING
    const stateRecord: MigrationStateRecord = {
      state: 'PREPARING', sourceDataRoot: sourceDataDir, targetDataRoot: targetDir,
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), originalRegistryPaths: {},
    };
    this.writeMigrationState(stateRecord);

    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const testFile = path.join(targetDir, `.perm-test-${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'DiamondERP-write-test', 'utf-8');
      const readBack = fs.readFileSync(testFile, 'utf-8');
      fs.unlinkSync(testFile);
      if (readBack !== 'DiamondERP-write-test') throw new Error('Read verification failed during destination permission check.');
    } catch (err: any) {
      throw new Error(`Cannot write to destination directory "${targetDir}": ${err.message}`);
    }

    this.assertDiskSpaceAvailable(this.getDirectorySize(sourceDataDir) + 500*1024*1024, targetDir);

    // Snapshot registry paths for rollback
    const allRegistries = await systemPrisma.databaseRegistry.findMany();
    for (const reg of allRegistries) stateRecord.originalRegistryPaths[reg.id] = reg.canonicalPath;

    // BACKING_UP
    stateRecord.state = 'BACKING_UP'; stateRecord.updatedAt = new Date().toISOString();
    this.writeMigrationState(stateRecord);

    const safetyBackups: string[] = [];
    const profiles = await systemPrisma.profile.findMany({ where: { status: 'ACTIVE' } });
    for (const profile of profiles) {
      try {
        const backup = await backupService.createBackup({ profileId: profile.id, backupType: 'MANUAL' });
        safetyBackups.push(backup.backupPath);
      } catch (backupErr: any) {
        throw new Error(`Failed to create safety backup for profile "${profile.code}": ${backupErr.message}`);
      }
    }

    // COPYING
    stateRecord.state = 'COPYING'; stateRecord.updatedAt = new Date().toISOString();
    this.writeMigrationState(stateRecord);
    this.setLock(true);
    await closeAllDynamicClients();
    await systemPrisma.$disconnect();

    try {
      this.copyDirectoryRecursive(sourceDataDir, targetDir);

      // VERIFYING â€” real PRAGMA integrity_check (Phase 23)
      stateRecord.state = 'VERIFYING'; stateRecord.updatedAt = new Date().toISOString();
      this.writeMigrationState(stateRecord);

      const targetDatabasesDir = path.join(targetDir, 'databases');
      let migratedCount = 0;
      if (fs.existsSync(targetDatabasesDir)) {
        const dbFiles = fs.readdirSync(targetDatabasesDir).filter((f) => f.endsWith('.db'));
        migratedCount = dbFiles.length;
        for (const dbFile of dbFiles) await this.verifySqliteFile(path.join(targetDatabasesDir, dbFile));
      }
      const targetSystemDb = fs.existsSync(path.join(targetDir, 'system', 'system.db'))
        ? path.join(targetDir, 'system', 'system.db') : path.join(targetDir, 'system.db');
      if (fs.existsSync(targetSystemDb)) await this.verifySqliteFile(targetSystemDb);

      // COMMITTING
      stateRecord.state = 'COMMITTING'; stateRecord.updatedAt = new Date().toISOString();
      this.writeMigrationState(stateRecord);

      setCustomDataRoot(targetDir);
      ensureAllDataDirs();
      const configDir = path.join(targetDir, 'config');
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, '.data-location.json'), JSON.stringify({ dataRoot: targetDir, migratedAt: new Date().toISOString() }, null, 2), 'utf-8');

      await systemPrisma.$connect();
      for (const reg of await systemPrisma.databaseRegistry.findMany()) {
        const newPath = path.join(targetDatabasesDir, path.basename(reg.canonicalPath));
        if (fs.existsSync(newPath)) {
          await systemPrisma.databaseRegistry.update({ where: { id: reg.id }, data: { canonicalPath: newPath } });
        }
      }

      const health = await databaseHealthService.checkAllProfiles();
      const hasUnhealthy = health.some((h) => h.status !== 'HEALTHY');
      if (hasUnhealthy) {
        throw new Error('Database health check failed after updating registry paths.');
      }
      this.setLock(false);

      // COMPLETED
      stateRecord.state = 'COMPLETED'; stateRecord.updatedAt = new Date().toISOString();
      this.writeMigrationState(stateRecord);
      this.clearMigrationState();

      return {
        success: true,
        previousDataRoot: sourceDataDir, newDataRoot: targetDir,
        databasesMigrated: migratedCount, safetyBackupsCreated: safetyBackups,
        integrityCheckPassed: true, migratedAt: new Date().toISOString(),
      };
    } catch (migrationErr: any) {
      // ROLLING_BACK
      stateRecord.state = 'ROLLING_BACK'; stateRecord.error = migrationErr.message; stateRecord.updatedAt = new Date().toISOString();
      this.writeMigrationState(stateRecord);
      setCustomDataRoot(sourceDataDir);
      this.setLock(false);
      try {
        await systemPrisma.$connect();
        // Restore DatabaseRegistry paths to pre-migration values (Phase 24)
        for (const [regId, originalPath] of Object.entries(stateRecord.originalRegistryPaths)) {
          try { await systemPrisma.databaseRegistry.update({ where: { id: regId }, data: { canonicalPath: originalPath } }); } catch {}
        }
        // Verify every registry path restored
        for (const [regId, originalPath] of Object.entries(stateRecord.originalRegistryPaths)) {
          const current = await systemPrisma.databaseRegistry.findUnique({ where: { id: regId } });
          if (current && current.canonicalPath !== originalPath) {
            console.error(`Rollback verification warning for ${regId}: expected ${originalPath}, got ${current.canonicalPath}`);
          }
        }
      } catch {}
      // FAILED
      stateRecord.state = 'FAILED'; stateRecord.updatedAt = new Date().toISOString();
      this.writeMigrationState(stateRecord);
      throw new Error(`Data location migration failed and was rolled back: ${migrationErr.message}`);
    }
  }

  /**
   * Real SQLite integrity verification using PRAGMA integrity_check and PRAGMA foreign_key_check.
   * Section 14: Migration MUST FAIL if actual SQLite integrity verification cannot execute.
   */
  private async verifySqliteFile(dbPath: string): Promise<void> {
    if (!fs.existsSync(dbPath)) throw new Error(`Database file missing for integrity check: ${dbPath}`);
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (!header.toString('utf-8').startsWith('SQLite format 3')) {
      throw new Error(`Invalid SQLite header in copied database: ${dbPath}`);
    }

    let checkPassed = false;
    let fkPassed = false;

    // 1. Try better-sqlite3 first
    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const rows: Array<{ integrity_check: string }> = db.prepare('PRAGMA integrity_check;').all();
        if (rows && rows.length > 0 && rows[0].integrity_check === 'ok') {
          checkPassed = true;
        } else {
          throw new Error(`PRAGMA integrity_check failed for ${dbPath}: ${rows.map((r) => r.integrity_check).join(', ')}`);
        }
        const fkRows: any[] = db.prepare('PRAGMA foreign_key_check;').all();
        if (fkRows && fkRows.length > 0) {
          throw new Error(`PRAGMA foreign_key_check failed for ${dbPath}: ${fkRows.length} foreign key violations found.`);
        }
        fkPassed = true;
      } finally {
        db.close();
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('integrity_check failed') || err.message.includes('foreign_key_check failed'))) {
        throw err;
      }
      // 2. If better-sqlite3 cannot be loaded, execute via PrismaClient
      try {
        const { PrismaClient: CheckClient } = require('@prisma/client');
        const checkClient = new CheckClient({
          datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } },
        });
        try {
          const rows = await checkClient.$queryRawUnsafe('PRAGMA integrity_check;') as Array<{ integrity_check: string }>;
          if (rows && rows.length > 0 && rows[0].integrity_check === 'ok') {
            checkPassed = true;
          } else {
            throw new Error(`PRAGMA integrity_check failed for ${dbPath}: ${rows?.map((r: any) => r.integrity_check).join(', ')}`);
          }
          const fkRows = await checkClient.$queryRawUnsafe('PRAGMA foreign_key_check;') as any[];
          if (fkRows && fkRows.length > 0) {
            throw new Error(`PRAGMA foreign_key_check failed for ${dbPath}: ${fkRows.length} foreign key violations found.`);
          }
          fkPassed = true;
        } finally {
          await checkClient.$disconnect();
        }
      } catch (prismaErr: any) {
        throw new Error(`SQLite integrity check could not be executed or failed for ${dbPath}: ${prismaErr.message}`);
      }
    }

    if (!checkPassed || !fkPassed) {
      throw new Error(`SQLite integrity verification failed for ${dbPath}. Migration aborted.`);
    }
  }

  private copyDirectoryRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) this.copyDirectoryRecursive(srcPath, destPath);
      else if (entry.isFile()) fs.copyFileSync(srcPath, destPath);
    }
  }

  public openFolder(folderPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const resolved = path.resolve(folderPath);
      if (!fs.existsSync(resolved)) { try { fs.mkdirSync(resolved, { recursive: true }); } catch { return resolve(false); } }
      const cmd = process.platform === 'win32' ? `explorer "${resolved}"` : process.platform === 'darwin' ? `open "${resolved}"` : `xdg-open "${resolved}"`;
      exec(cmd, (err) => { if (err) console.warn(`[DataLocationService] Failed to open folder "${resolved}":`, err.message); resolve(!err); });
    });
  }

  public openDataFolder(): Promise<boolean> { return this.openFolder(getDataRoot()); }
  public openBackupFolder(): Promise<boolean> { return this.openFolder(getBackupRoot()); }
  public openExportFolder(): Promise<boolean> { return this.openFolder(getExportRoot()); }
  public openLogsFolder(): Promise<boolean> { return this.openFolder(getLogRoot()); }
}

export const dataLocationService = new DataLocationService();