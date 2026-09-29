import fs from 'fs';
import path from 'path';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import { databaseValidationService } from './database-validation.service';
import { databaseContextService } from '../../../infrastructure/database/database-context.service';
import { getDatabasesDir, getControlDbPath, getDatabaseTemplatePath, getDataRoot } from '../../../infrastructure/paths';
import { dataLocationService } from '../../../infrastructure/data';

export interface ProfileDatabaseHealth {
  profileId: string;
  profileCode: string;
  profileName: string;
  databaseId: string;
  databasePath: string;
  exists: boolean;
  readable: boolean;
  sizeBytes: number;
  status: string;
  schemaVersion: number;
  integrityCheck: string;
  tablesFound: string[];
  missingTables: string[];
  walState: 'CLEAN' | 'WAL_ACTIVE' | 'ERROR';
  lastValidatedAt: string | null;
  lastBackupAt: string | null;
  lastVerifiedBackupAt: string | null;
  lastExportAt: string | null;
  isOrphaned: boolean;
  ownershipValid: boolean;
  issues: string[];
}

export interface SystemDataHealthReport {
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  dataRoot: string;
  diskSpace: {
    freeBytes: number;
    totalBytes: number;
    freeGb: number;
    totalGb: number;
    status: 'HEALTHY' | 'LOW' | 'CRITICAL' | 'INSUFFICIENT';
  };
  totalProfiles: number;
  healthyProfiles: number;
  orphanedDatabases: { path: string; sizeBytes: number }[];
  profiles: ProfileDatabaseHealth[];
  generatedAt: string;
}

export class DatabaseHealthService {
  /**
   * Run comprehensive data health inspection across all ERP profiles and databases.
   */
  async checkHealth(): Promise<SystemDataHealthReport> {
    const profiles = await systemPrisma.profile.findMany({
      include: {
        databaseRegistries: true,
      },
      orderBy: { name: 'asc' },
    });

    const reportProfiles: ProfileDatabaseHealth[] = [];
    let healthyCount = 0;
    const registeredPaths = new Set<string>();

    for (const prof of profiles) {
      const issues: string[] = [];
      let dbContext: any = null;

      try {
        dbContext = await databaseContextService.getDatabaseForProfile(prof.id);
      } catch (err: any) {
        issues.push(`Database Context Resolution Error: ${err.message}`);
      }

      const dbPath = dbContext?.canonicalPath || prof.dbPath || path.resolve(getDatabasesDir(), `${prof.code}.db`);
      registeredPaths.add(path.resolve(dbPath).toLowerCase());

      const exists = fs.existsSync(dbPath);
      let readable = false;
      let sizeBytes = 0;

      if (exists) {
        try {
          fs.accessSync(dbPath, fs.constants.R_OK);
          readable = true;
          sizeBytes = fs.statSync(dbPath).size;
        } catch {
          issues.push('Database file exists but is not readable.');
        }
      } else {
        issues.push('Database file does not exist on disk.');
      }

      // SQLite integrity and schema check
      let integrityCheck = 'NOT_RUN';
      let tablesFound: string[] = [];
      let missingTables: string[] = [];
      let schemaVersion = prof.schemaVersion || 1;

      if (exists && readable) {
        const valResult = await databaseValidationService.validateDatabase(dbPath);
        integrityCheck = valResult.integrityCheck || (valResult.isValid ? 'ok' : 'failed');
        tablesFound = valResult.tablesFound || [];
        missingTables = valResult.missingRequiredTables || [];
        if (valResult.schemaVersion) schemaVersion = valResult.schemaVersion;
        if (!valResult.isValid) {
          issues.push(`Integrity/Schema check failed: ${valResult.error || valResult.details}`);
        }
      }

      // Check WAL state
      let walState: 'CLEAN' | 'WAL_ACTIVE' | 'ERROR' = 'CLEAN';
      if (fs.existsSync(`${dbPath}-wal`)) {
        walState = 'WAL_ACTIVE';
      }

      // Fetch last backup metadata for this profile
      const latestBackup = await systemPrisma.backupRecord.findFirst({
        where: { profileId: prof.id },
        orderBy: { createdAt: 'desc' },
      });

      const latestVerifiedBackup = await systemPrisma.backupRecord.findFirst({
        where: { profileId: prof.id, status: 'VERIFIED' },
        orderBy: { createdAt: 'desc' },
      });

      // Fetch last export metadata
      const latestExport = dbContext?.databaseId
        ? await systemPrisma.exportRecord.findFirst({
          where: { databaseId: dbContext.databaseId },
          orderBy: { createdAt: 'desc' },
        })
        : null;

      // Ownership invariants: Verify no duplicate profile assignment for this DB
      let ownershipValid = true;
      const otherRegistries = await systemPrisma.databaseRegistry.findMany({
        where: {
          canonicalPath: path.resolve(dbPath),
          NOT: { profileId: prof.id },
        },
      });

      if (otherRegistries.length > 0) {
        ownershipValid = false;
        issues.push(`Ownership Conflict: Database path is simultaneously mapped to another profile/registry.`);
      }

      // Explicit Status Taxonomy (Section 16)
      let profileStatus: 'HEALTHY' | 'MISSING_DATABASE' | 'CORRUPTED_DATABASE' | 'REGISTRY_CONFLICT' | 'MULTIPLE_DATABASES' | 'SCHEMA_INVALID' | 'OWNERSHIP_CONFLICT' = 'HEALTHY';
      if (!exists) {
        profileStatus = 'MISSING_DATABASE';
      } else if (!ownershipValid) {
        profileStatus = 'OWNERSHIP_CONFLICT';
      } else if (prof.databaseRegistries.length > 1) {
        profileStatus = 'MULTIPLE_DATABASES';
      } else if (prof.databaseRegistries.length === 0) {
        profileStatus = 'REGISTRY_CONFLICT';
      } else if (integrityCheck !== 'ok') {
        profileStatus = 'CORRUPTED_DATABASE';
      } else if (missingTables.length > 0) {
        profileStatus = 'SCHEMA_INVALID';
      }

      const isHealthy = profileStatus === 'HEALTHY';
      if (isHealthy) healthyCount++;

      reportProfiles.push({
        profileId: prof.id,
        profileCode: prof.code,
        profileName: prof.name,
        databaseId: dbContext?.databaseId || `db_${prof.code}`,
        databasePath: dbPath,
        exists,
        readable,
        sizeBytes,
        status: profileStatus,
        schemaVersion,
        integrityCheck,
        tablesFound,
        missingTables,
        walState,
        lastValidatedAt: prof.databaseRegistries[0]?.lastValidatedAt?.toISOString() || null,
        lastBackupAt: latestBackup?.createdAt?.toISOString() || null,
        lastVerifiedBackupAt: latestVerifiedBackup?.createdAt?.toISOString() || null,
        lastExportAt: latestExport?.createdAt?.toISOString() || null,
        isOrphaned: !prof.isActive,
        ownershipValid,
        issues,
      });
    }

    // Detect orphaned .db files in the databases directory
    const databasesDir = getDatabasesDir();
    const orphanedDatabases: { path: string; sizeBytes: number }[] = [];
    const controlDbPath = path.resolve(getControlDbPath()).toLowerCase();
    const templateDbPath = getDatabaseTemplatePath() ? path.resolve(getDatabaseTemplatePath()!).toLowerCase() : '';

    if (fs.existsSync(databasesDir)) {
      const files = fs.readdirSync(databasesDir);
      for (const file of files) {
        if (!file.endsWith('.db')) continue;
        const fullPath = path.resolve(databasesDir, file);
        const lower = fullPath.toLowerCase();
        if (lower === controlDbPath || lower === templateDbPath) continue;

        if (!registeredPaths.has(lower)) {
          orphanedDatabases.push({
            path: fullPath,
            sizeBytes: fs.statSync(fullPath).size,
          });
        }
      }
    }

    const overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' =
      healthyCount === profiles.length && orphanedDatabases.length === 0
        ? 'HEALTHY'
        : healthyCount > 0
          ? 'WARNING'
          : 'CRITICAL';

    const diskSpace = dataLocationService.checkDiskSpace();

    return {
      overallStatus,
      dataRoot: getDataRoot(),
      diskSpace: {
        freeBytes: diskSpace.freeBytes,
        totalBytes: diskSpace.totalBytes,
        freeGb: diskSpace.freeGb,
        totalGb: diskSpace.totalGb,
        status: diskSpace.status,
      },
      totalProfiles: profiles.length,
      healthyProfiles: healthyCount,
      orphanedDatabases,
      profiles: reportProfiles,
      generatedAt: new Date().toISOString(),
    };
  }

  async checkProfile(profileIdOrCode: string): Promise<ProfileDatabaseHealth> {
    const report = await this.checkHealth();
    const clean = profileIdOrCode.trim().toLowerCase();
    const found = report.profiles.find(
      (p) => p.profileId.toLowerCase() === clean || p.profileCode.toLowerCase() === clean
    );
    if (!found) {
      throw new Error(`Profile not found for health check: "${profileIdOrCode}"`);
    }
    return found;
  }

  async checkDatabase(databaseId: string): Promise<ProfileDatabaseHealth> {
    const report = await this.checkHealth();
    const found = report.profiles.find((p) => p.databaseId === databaseId);
    if (!found) {
      throw new Error(`Database not found for health check: "${databaseId}"`);
    }
    return found;
  }

  async checkAllProfiles(): Promise<ProfileDatabaseHealth[]> {
    const report = await this.checkHealth();
    return report.profiles;
  }
}

export const databaseHealthService = new DatabaseHealthService();
