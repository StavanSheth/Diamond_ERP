import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { systemPrisma, registerProfile } from '../../../infrastructure/database/prisma';
import { canonicalizeDatabasePath } from './database-path.util';
import { databaseValidationService } from './database-validation.service';
import { installationService } from '../installation.service';
import { getDatabasesDir, getDatabaseTemplatePath, getControlDbPath } from '../../../infrastructure/paths';
import { logger } from '../../../infrastructure/logging';
import { ValidationError, ConflictError, NotFoundError } from '../../../errors';
import type { ProvisionDatabaseResultDto } from '@diamond-erp/contracts';

const PRISTINE_BUSINESS_TABLES = [
  'Stock',
  'Party',
  'Transaction',
  'Ledger',
  'DiamondItem',
  'Repair',
  'FinancialEntry',
  'ItemEvent',
  'InventoryMovement',
  'TransactionItem',
];

export interface ProvisionDatabaseInput {
  displayName: string;
  profileCode?: string;
  profileName?: string;
  userId?: string;
  installationId?: string;
}

export class DatabaseProvisioningService {
  private activeProvisioningPaths = new Set<string>();

  /**
   * Determine and validate the destination filesystem path for a new database.
   * Invariants:
   * - Must reside under databases directory.
   * - Must not collide with control DB (system.db) or template DB (template.db).
   * - Must not collide with an existing file on disk.
   */
  determineDestination(profileCode: string, databasesDir?: string): { canonicalPath: string; isExternal: boolean } {
    const dbDir = path.resolve(databasesDir || getDatabasesDir());
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sanitizedCode = profileCode.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const targetDbPath = path.resolve(dbDir, `${sanitizedCode}.db`);

    const pathResult = canonicalizeDatabasePath(targetDbPath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid destination database path');
    }

    const canonical = pathResult.canonicalPath;

    // Guard: Control DB collision
    const controlDbCanonical = path.resolve(getControlDbPath()).toLowerCase();
    if (canonical.toLowerCase() === controlDbCanonical) {
      throw new ConflictError('Cannot provision database at system control database path (system.db).');
    }

    // Guard: Template DB collision
    const templateDbPath = getDatabaseTemplatePath();
    if (templateDbPath && canonical.toLowerCase() === path.resolve(templateDbPath).toLowerCase()) {
      throw new ConflictError('Cannot overwrite immutable database template (template.db).');
    }

    return {
      canonicalPath: canonical,
      isExternal: pathResult.isExternal,
    };
  }

  /**
   * Validate that the newly cloned database is truly pristine.
   * Ensures zero business records exist in core customer tables.
   */
  async validatePristineState(canonicalPath: string): Promise<{ isPristine: boolean; recordCounts: Record<string, number> }> {
    const client = new PrismaClient({
      datasources: {
        db: {
          url: `file:${path.resolve(canonicalPath)}`,
        },
      },
    });

    const recordCounts: Record<string, number> = {};
    try {
      await client.$connect();

      // Query sqlite_master to verify which tables actually exist
      const existingTables = await client.$queryRawUnsafe<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type='table';"
      );
      const tableNames = new Set(existingTables.map((t) => t.name));

      for (const table of PRISTINE_BUSINESS_TABLES) {
        if (tableNames.has(table)) {
          const rows = await client.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as cnt FROM "${table}";`);
          const count = Number(rows?.[0]?.cnt || 0);
          recordCounts[table] = count;
          if (count > 0) {
            throw new ConflictError(
              `Provisioned database is not pristine. Table "${table}" contains ${count} customer record(s).`
            );
          }
        }
      }

      return {
        isPristine: true,
        recordCounts,
      };
    } finally {
      await client.$disconnect().catch(() => {});
    }
  }

  /**
   * Provision a brand-new blank database from the immutable template.
   * Full lifecycle:
   * 1. Check destination uniqueness & concurrency locks
   * 2. Clone immutable template.db
   * 3. Validate SQLite structure, schema, and SQLite integrity
   * 4. Validate pristine state (0 business rows)
   * 5. Register Profile, DatabaseRegistry, and UserProfile in Control DB transaction
   * 6. Emit audit events
   * 7. Register profile in runtime client pool
   * 8. Filesystem compensation on transaction rollback
   */
  async provisionBlankDatabase(input: ProvisionDatabaseInput): Promise<ProvisionDatabaseResultDto> {
    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new ValidationError('Database display name is required');
    }

    const install = input.installationId
      ? { id: input.installationId }
      : await installationService.getOrCreateInstallation();

    const profileCode = (input.profileCode || displayName)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const profileName = input.profileName || displayName;

    const { canonicalPath: targetDbPath } = this.determineDestination(profileCode);

    // Concurrency lock check
    const lockKey = targetDbPath.toLowerCase();
    if (this.activeProvisioningPaths.has(lockKey)) {
      throw new ConflictError(`Concurrent provisioning already in progress for "${profileCode}".`);
    }
    this.activeProvisioningPaths.add(lockKey);

    let createdFile = false;
    try {
      // Guard: Disk collision
      if (fs.existsSync(targetDbPath)) {
        // Check if already registered to this installation (Idempotency)
        const existingReg = await systemPrisma.databaseRegistry.findUnique({
          where: { canonicalPath: targetDbPath },
          include: { profile: true },
        });
        if (existingReg && existingReg.installationId === install.id) {
          logger.info(`Idempotent return for already provisioned database: ${targetDbPath}`);
          return {
            databaseId: existingReg.databaseId,
            displayName: existingReg.displayName,
            canonicalPath: existingReg.canonicalPath,
            profileId: existingReg.profileId || '',
            profileCode: existingReg.profile?.code || profileCode,
            schemaVersion: existingReg.schemaVersion,
            status: existingReg.status as any,
            isPristine: true,
          };
        }
        throw new ConflictError(`A database file already exists at "${targetDbPath}". Cannot overwrite.`);
      }

      // 1. Template validation
      const templateDbPath = getDatabaseTemplatePath();
      if (!templateDbPath || !fs.existsSync(templateDbPath)) {
        throw new NotFoundError(
          'Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.'
        );
      }

      // 2. Clone approved immutable template to destination
      fs.copyFileSync(templateDbPath, targetDbPath);
      createdFile = true;

      // 3. Structural, schema, and SQLite integrity validation
      const validation = await databaseValidationService.validateDatabase(targetDbPath);
      if (!validation.isValid) {
        throw new ValidationError(`Provisioned database failed validation: ${validation.error} (${validation.details})`);
      }

      // 4. Pristine-state validation (0 customer business records)
      const pristineCheck = await this.validatePristineState(targetDbPath);
      if (!pristineCheck.isPristine) {
        throw new ConflictError('Newly provisioned database failed pristine check.');
      }

      // 5. Control DB Transaction: atomic registration of Profile, DatabaseRegistry, and UserProfile
      const result = await systemPrisma.$transaction(async (tx) => {
        // Create or reuse Profile
        let profile = await tx.profile.findUnique({ where: { code: profileCode } });
        if (!profile) {
          profile = await tx.profile.create({
            data: {
              code: profileCode,
              name: profileName,
              dbPath: targetDbPath,
              schemaVersion: validation.schemaVersion || 1,
              status: 'ACTIVE',
              isActive: true,
            },
          });
        } else {
          // If profile existed without dbPath, link to newly provisioned path
          profile = await tx.profile.update({
            where: { id: profile.id },
            data: {
              dbPath: targetDbPath,
              status: 'ACTIVE',
              isActive: true,
            },
          });
        }

        // Create DatabaseRegistry
        const registry = await tx.databaseRegistry.create({
          data: {
            databaseId: crypto.randomUUID(),
            displayName,
            canonicalPath: targetDbPath,
            schemaVersion: validation.schemaVersion || 1,
            status: 'ACTIVE',
            databaseType: 'LOCAL_PROFILE',
            profileId: profile.id,
            installationId: install.id,
            lastValidatedAt: new Date(),
          },
        });

        // Link specified user or all associated installation users
        const targetUserIds: string[] = [];
        if (input.userId) {
          targetUserIds.push(input.userId);
        } else {
          const installUsers = await tx.installationUser.findMany({
            where: { installationId: install.id },
          });
          targetUserIds.push(...installUsers.map((u) => u.userId));
        }

        for (const uid of targetUserIds) {
          await tx.userProfile.upsert({
            where: {
              userId_profileId: {
                userId: uid,
                profileId: profile.id,
              },
            },
            update: { isActive: true },
            create: {
              userId: uid,
              profileId: profile.id,
              role: 'ADMIN',
              isActive: true,
            },
          });
        }

        // Audit Events
        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_PROVISIONING_STARTED',
            description: `Provisioning started for new database "${displayName}" from template`,
            performedBy: targetUserIds[0] || 'SYSTEM',
            metadata: JSON.stringify({ displayName, profileCode, targetDbPath }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_PROVISIONED',
            description: `Blank database provisioned successfully: ${displayName} -> ${targetDbPath}`,
            performedBy: targetUserIds[0] || 'SYSTEM',
            metadata: JSON.stringify({
              databaseId: registry.databaseId,
              canonicalPath: targetDbPath,
              schemaVersion: validation.schemaVersion,
            }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_VALIDATED',
            description: `Newly provisioned database passed structural and pristine validation`,
            performedBy: targetUserIds[0] || 'SYSTEM',
            metadata: JSON.stringify({
              tableCount: validation.tableCount,
              schemaVersion: validation.schemaVersion,
              pristine: true,
            }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_ATTACHED',
            description: `New database registered and attached: ${displayName} [${registry.databaseId}]`,
            performedBy: targetUserIds[0] || 'SYSTEM',
            metadata: JSON.stringify({
              databaseId: registry.databaseId,
              profileId: profile.id,
              installationId: install.id,
            }),
          },
        });

        return { profile, registry };
      });

      // 6. Register canonical profile in runtime client pool
      try {
        registerProfile({
          code: profileCode,
          name: profileName,
          dbPath: targetDbPath,
        });
      } catch (poolErr: any) {
        logger.warn(`Could not register canonical profile in pool: ${poolErr.message}`);
      }

      logger.info(`Successfully provisioned blank database: ${displayName} [${result.registry.databaseId}] at ${targetDbPath}`);

      return {
        databaseId: result.registry.databaseId,
        displayName: result.registry.displayName,
        canonicalPath: result.registry.canonicalPath,
        profileId: result.profile.id,
        profileCode: result.profile.code,
        schemaVersion: result.registry.schemaVersion,
        status: result.registry.status as any,
        isPristine: true,
      };
    } catch (err: any) {
      // 7. Filesystem Compensation: Clean up newly created file if transaction or validation failed
      if (createdFile && fs.existsSync(targetDbPath)) {
        try {
          fs.unlinkSync(targetDbPath);
          logger.warn(`Filesystem compensation: deleted incomplete database file ${targetDbPath}`);
        } catch (unlinkErr: any) {
          logger.error(`Failed to clean up incomplete database file: ${unlinkErr.message}`);
        }
      }

      // Log failure audit event
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: profileCode,
          eventType: 'NEW_DATABASE_PROVISIONING_FAILED',
          description: `Failed to provision database for profile "${profileCode}": ${err.message}`,
          performedBy: input.userId || 'SYSTEM',
          metadata: JSON.stringify({ error: err.message, profileCode, targetDbPath }),
        },
      }).catch(() => {});

      throw err;
    } finally {
      this.activeProvisioningPaths.delete(lockKey);
    }
  }
}

export const databaseProvisioningService = new DatabaseProvisioningService();
