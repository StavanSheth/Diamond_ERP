import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { systemPrisma, ensureProfileDbFile } from '../../../infrastructure/database/prisma';
import { getControlDbPath, getDatabaseTemplatePath } from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from './database-path.util';
import { databaseValidationService } from './database-validation.service';
import { installationService } from '../installation.service';
import { logger } from '../../../infrastructure/logging';
import { ValidationError, NotFoundError, ConflictError } from '../../../errors';
import type { DatabaseRegistryDto, DatabaseStatus } from '@diamond-erp/contracts';

export interface RegisterDatabaseInput {
  rawPath: string;
  displayName?: string;
  databaseType?: string;
  profileId?: string;
  installationId?: string;
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

    // Guard: Prevent control or template database from being registered as customer database
    const baseName = path.basename(canonicalPath).toLowerCase();
    const controlDbCanonical = path.resolve(getControlDbPath()).toLowerCase();
    const templateDbPath = getDatabaseTemplatePath();
    const templateCanonical = templateDbPath ? path.resolve(templateDbPath).toLowerCase() : null;

    if (
      baseName === 'system.db' ||
      baseName === 'template.db' ||
      baseName === 'system.sqlite' ||
      canonicalPath.toLowerCase() === controlDbCanonical ||
      (templateCanonical && canonicalPath.toLowerCase() === templateCanonical)
    ) {
      throw new ValidationError(`Cannot register internal control or template database "${baseName}" as a customer database.`);
    }

    const currentInstall = await installationService.getOrCreateInstallation();
    if (input.installationId && input.installationId !== currentInstall.id && input.installationId !== currentInstall.installationId) {
      throw new ConflictError('Cannot register database: Installation ID does not match current local installation.');
    }
    const installId = currentInstall.id;

    // Check if canonical path already registered
    const existing = await systemPrisma.databaseRegistry.findUnique({
      where: { canonicalPath },
    });

    if (existing) {
      if (existing.installationId && existing.installationId !== currentInstall.id) {
        throw new ConflictError('Cannot register database: Database is already registered under another installation.');
      }

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

    // Verify profile exists if profileId is provided
    if (input.profileId) {
      const profile = await systemPrisma.profile.findUnique({
        where: { id: input.profileId },
      });
      if (!profile) {
        throw new NotFoundError(`Profile not found for ID: ${input.profileId}`);
      }
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
          status: validation.isValid ? 'ACTIVE' : validation.status,
          databaseType: input.databaseType || (pathResult.isExternal ? 'EXTERNAL' : 'LOCAL_PROFILE'),
          profileId: input.profileId || null,
          installationId: installId,
          lastValidatedAt: new Date(),
        },
      });

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: created.databaseId,
          eventType: 'DATABASE_REGISTERED',
          description: `Registered database ${created.displayName} at ${canonicalPath}`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({ databaseId: created.databaseId, canonicalPath, profileId: created.profileId }),
        },
      }).catch(() => {});

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
   * Maintains referential safety: validates profile existence or accepts null to disassociate.
   */
  async associateWithProfile(databaseId: string, profileId: string | null): Promise<DatabaseRegistryDto> {
    if (profileId) {
      const profile = await systemPrisma.profile.findUnique({ where: { id: profileId } });
      if (!profile) {
        throw new NotFoundError(`Profile not found for ID: ${profileId}`);
      }
    }

    const record = await systemPrisma.databaseRegistry.update({
      where: { databaseId },
      data: { profileId },
    });
    return this.mapToDto(record);
  }

  /**
   * Update the canonical path of an existing registered database (e.g. after a file move/rename).
   * Invariant: Logical databaseId remains completely independent of filesystem path changes.
   */
  async updateDatabasePath(databaseId: string, newRawPath: string): Promise<DatabaseRegistryDto> {
    const pathResult = canonicalizeDatabasePath(newRawPath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid database path');
    }

    const { canonicalPath } = pathResult;
    const existing = await systemPrisma.databaseRegistry.findUnique({
      where: { databaseId },
    });

    if (!existing) {
      throw new NotFoundError(`Database registry entry not found for ID: ${databaseId}`);
    }

    // Validate new path
    const validation = await databaseValidationService.validateDatabase(canonicalPath);

    const updated = await systemPrisma.databaseRegistry.update({
      where: { databaseId },
      data: {
        canonicalPath,
        status: validation.isValid ? 'ACTIVE' : validation.status,
        lastValidatedAt: new Date(),
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Provision a new profile database with filesystem + Control DB compensation.
   * Workflow:
   * 1. Register with status PENDING in Control DB.
   * 2. Provision physical file on disk from template.db.
   * 3. Validate physical database structure.
   * 4. Update status to ACTIVE if valid, or compensate/mark INVALID.
   * 5. If DB registration fails, roll back newly created physical file.
   */
  async provisionDatabase(input: {
    rawPath: string;
    displayName?: string;
    profileId?: string;
    installationId: string;
  }): Promise<DatabaseRegistryDto> {
    const pathResult = canonicalizeDatabasePath(input.rawPath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid database path');
    }

    const { canonicalPath } = pathResult;
    const fileExistedBefore = fs.existsSync(canonicalPath);

    if (input.profileId) {
      const profile = await systemPrisma.profile.findUnique({ where: { id: input.profileId } });
      if (!profile) {
        throw new NotFoundError(`Profile not found for ID: ${input.profileId}`);
      }
    }

    // 1. Pre-register in Control DB with PENDING status
    const databaseId = crypto.randomUUID();
    const displayName = input.displayName || canonicalPath.split(/[\\/]/).pop()?.replace(/\.db$/, '') || 'Database';

    let regRecord;
    try {
      regRecord = await systemPrisma.databaseRegistry.create({
        data: {
          databaseId,
          displayName,
          canonicalPath,
          schemaVersion: 1,
          status: 'PENDING',
          databaseType: pathResult.isExternal ? 'EXTERNAL' : 'LOCAL_PROFILE',
          profileId: input.profileId || null,
          installationId: input.installationId,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const existing = await systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath } });
        if (existing) return this.mapToDto(existing);
      }
      throw err;
    }

    // 2. Filesystem operation: copy from template.db if file does not exist
    let createdFile = false;
    try {
      if (!fs.existsSync(canonicalPath)) {
        ensureProfileDbFile(canonicalPath);
        createdFile = true;
      }

      // 3. Structural validation: ACTIVE requires physical validation
      const validation = await databaseValidationService.validateDatabase(canonicalPath);
      const updated = await systemPrisma.databaseRegistry.update({
        where: { id: regRecord.id },
        data: {
          status: validation.isValid ? 'ACTIVE' : validation.status,
          schemaVersion: validation.schemaVersion || 1,
          lastValidatedAt: new Date(),
        },
      });

      return this.mapToDto(updated);
    } catch (fsErr) {
      // 4. Compensation: if filesystem or validation failed, clean up newly created file and update status
      if (createdFile && !fileExistedBefore && fs.existsSync(canonicalPath)) {
        try { fs.unlinkSync(canonicalPath); } catch {}
      }
      await systemPrisma.databaseRegistry.update({
        where: { id: regRecord.id },
        data: { status: 'INVALID' },
      }).catch(() => {});
      throw fsErr;
    }
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
