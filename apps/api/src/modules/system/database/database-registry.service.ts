import crypto from 'crypto';
import fs from 'fs';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import { canonicalizeDatabasePath } from './database-path.util';
import { databaseValidationService } from './database-validation.service';
import { logger } from '../../../infrastructure/logging';
import { ValidationError, NotFoundError } from '../../../errors';
import type { DatabaseRegistryDto, DatabaseStatus } from '@diamond-erp/contracts';

export interface RegisterDatabaseInput {
  rawPath: string;
  displayName?: string;
  databaseType?: string;
  profileId?: string;
  installationId: string;
}

export class DatabaseRegistryService {
  /**
   * Register a database file in the control registry.
   *
   * Invariants:
   * - Deduplication: If the canonical path is already registered, returns the existing record
   *   with its stable logical databaseId (never creates duplicate logical IDs for same file).
   * - Never renames or moves external databases.
   */
  async registerDatabase(input: RegisterDatabaseInput): Promise<DatabaseRegistryDto> {
    const pathResult = canonicalizeDatabasePath(input.rawPath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid database path');
    }

    const { canonicalPath } = pathResult;

    // Check if canonical path already registered
    const existing = await systemPrisma.databaseRegistry.findUnique({
      where: { canonicalPath },
    });

    if (existing) {
      // Re-verify file existence on disk
      const fileExists = fs.existsSync(canonicalPath);
      const effectiveStatus = fileExists ? existing.status : 'MISSING';

      if (effectiveStatus !== existing.status) {
        await systemPrisma.databaseRegistry.update({
          where: { id: existing.id },
          data: { status: effectiveStatus },
        });
      }

      return this.mapToDto({ ...existing, status: effectiveStatus });
    }

    // New database registration: validate structure to set initial status
    const validation = await databaseValidationService.validateDatabase(canonicalPath);
    const databaseId = crypto.randomUUID();
    const displayName = input.displayName || canonicalPath.split(/[\\/]/).pop()?.replace(/\.db$/, '') || 'Database';

    try {
      const created = await systemPrisma.databaseRegistry.create({
        data: {
          databaseId,
          displayName,
          canonicalPath,
          schemaVersion: validation.schemaVersion || 1,
          status: validation.status,
          databaseType: input.databaseType || (pathResult.isExternal ? 'EXTERNAL' : 'LOCAL_PROFILE'),
          profileId: input.profileId || null,
          installationId: input.installationId,
          lastValidatedAt: new Date(),
        },
      });

      logger.info(`Registered database in control registry: ${created.displayName} [${created.databaseId}] -> ${canonicalPath}`);
      return this.mapToDto(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raceExisting = await systemPrisma.databaseRegistry.findUnique({
          where: { canonicalPath },
        });
        if (raceExisting) {
          return this.mapToDto(raceExisting);
        }
      }
      throw err;
    }
  }

  /**
   * Look up a database by its logical databaseId.
   */
  async getDatabase(databaseId: string): Promise<DatabaseRegistryDto> {
    const record = await systemPrisma.databaseRegistry.findUnique({
      where: { databaseId },
    });
    if (!record) {
      throw new NotFoundError(`Database registry entry not found for ID: ${databaseId}`);
    }

    // Live existence check
    if (!fs.existsSync(record.canonicalPath) && record.status !== 'MISSING') {
      const updated = await systemPrisma.databaseRegistry.update({
        where: { id: record.id },
        data: { status: 'MISSING' },
      });
      return this.mapToDto(updated);
    }

    return this.mapToDto(record);
  }

  /**
   * Look up a database by its canonical filesystem path.
   */
  async getDatabaseByPath(rawPath: string): Promise<DatabaseRegistryDto | null> {
    const pathResult = canonicalizeDatabasePath(rawPath);
    if (!pathResult.valid) return null;

    const record = await systemPrisma.databaseRegistry.findUnique({
      where: { canonicalPath: pathResult.canonicalPath },
    });
    return record ? this.mapToDto(record) : null;
  }

  /**
   * List all registered databases for an installation.
   */
  async listDatabases(installationId?: string): Promise<DatabaseRegistryDto[]> {
    const where = installationId ? { installationId } : {};
    const records = await systemPrisma.databaseRegistry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToDto(r));
  }

  /**
   * Update status of a registered database.
   */
  async updateDatabaseStatus(databaseId: string, status: DatabaseStatus): Promise<DatabaseRegistryDto> {
    const record = await systemPrisma.databaseRegistry.update({
      where: { databaseId },
      data: {
        status,
        lastValidatedAt: new Date(),
      },
    });
    return this.mapToDto(record);
  }

  /**
   * Associate a registered database with an ERP profile.
   */
  async associateWithProfile(databaseId: string, profileId: string): Promise<DatabaseRegistryDto> {
    const record = await systemPrisma.databaseRegistry.update({
      where: { databaseId },
      data: { profileId },
    });
    return this.mapToDto(record);
  }

  private mapToDto(record: any): DatabaseRegistryDto {
    return {
      id: record.id,
      databaseId: record.databaseId,
      displayName: record.displayName,
      canonicalPath: record.canonicalPath,
      schemaVersion: record.schemaVersion,
      status: record.status as DatabaseStatus,
      databaseType: record.databaseType,
      profileId: record.profileId,
      installationId: record.installationId,
      lastValidatedAt: record.lastValidatedAt?.toISOString() || null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

export const databaseRegistryService = new DatabaseRegistryService();
