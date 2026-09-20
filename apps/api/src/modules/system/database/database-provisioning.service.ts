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

export enum TableCategory {
  SCHEMA_METADATA = 'SCHEMA_METADATA',
  SYSTEM_CONFIGURATION = 'SYSTEM_CONFIGURATION',
  REFERENCE_DATA = 'REFERENCE_DATA',
  BUSINESS_DATA = 'BUSINESS_DATA',
  AUDIT_DATA = 'AUDIT_DATA',
}

/**
 * Authoritative Classification of every known table in the Diamond ERP Schema.
 * Fix #4: Prevents unclassified business tables from bypassing pristine validation.
 */
export const PRISTINE_TABLE_CLASSIFICATION: Record<string, TableCategory> = {
  // Schema & Migration Metadata
  _prisma_migrations: TableCategory.SCHEMA_METADATA,
  sqlite_sequence: TableCategory.SCHEMA_METADATA,

  // System Configuration & Sequences
  Sequence: TableCategory.SYSTEM_CONFIGURATION,
  Setting: TableCategory.SYSTEM_CONFIGURATION,

  // Control Plane Tables (if present in template or control DB)
  Installation: TableCategory.SYSTEM_CONFIGURATION,
  Device: TableCategory.SYSTEM_CONFIGURATION,
  DeviceSecurity: TableCategory.SYSTEM_CONFIGURATION,
  InstallationUser: TableCategory.SYSTEM_CONFIGURATION,
  DatabaseRegistry: TableCategory.SYSTEM_CONFIGURATION,
  BackupRecord: TableCategory.SYSTEM_CONFIGURATION,
  RestoreRecord: TableCategory.SYSTEM_CONFIGURATION,
  Session: TableCategory.SYSTEM_CONFIGURATION,
  IdempotencyKey: TableCategory.SYSTEM_CONFIGURATION,
  ProvisioningOperation: TableCategory.SYSTEM_CONFIGURATION,

  // Reference / Tenant Definitions
  Profile: TableCategory.REFERENCE_DATA,
  UserProfile: TableCategory.REFERENCE_DATA,
  User: TableCategory.REFERENCE_DATA,
  Location: TableCategory.REFERENCE_DATA,

  // Core Business Data (MUST BE STRICTLY ZERO ROWS IN PRISTINE DB)
  Stock: TableCategory.BUSINESS_DATA,
  Ledger: TableCategory.BUSINESS_DATA,
  Party: TableCategory.BUSINESS_DATA,
  DiamondItem: TableCategory.BUSINESS_DATA,
  Transaction: TableCategory.BUSINESS_DATA,
  TransactionItem: TableCategory.BUSINESS_DATA,
  ItemEvent: TableCategory.BUSINESS_DATA,
  Certification: TableCategory.BUSINESS_DATA,
  Repair: TableCategory.BUSINESS_DATA,
  InventoryMovement: TableCategory.BUSINESS_DATA,
  FinancialEntry: TableCategory.BUSINESS_DATA,
  ItemTransformation: TableCategory.BUSINESS_DATA,
  TransformationProvenance: TableCategory.BUSINESS_DATA,
  DocumentDraft: TableCategory.BUSINESS_DATA,
  DraftRevision: TableCategory.BUSINESS_DATA,
  RecordVersion: TableCategory.BUSINESS_DATA,
  VersionChange: TableCategory.BUSINESS_DATA,

  // Audit Data
  AuditEvent: TableCategory.AUDIT_DATA,
};

export interface ProvisionDatabaseInput {
  displayName: string;
  profileCode?: string;
  profileName?: string;
  userId: string; // Strictly required for Phase 6 ownership isolation
  installationId?: string;
  provisioningOperationId?: string;
}

let tableEnsured = false;
async function ensureProvisioningOperationTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await systemPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProvisioningOperation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "operationId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "profileCode" TEXT NOT NULL,
        "targetPath" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "requestHash" TEXT NOT NULL,
        "databaseId" TEXT,
        "profileId" TEXT,
        "errorCode" TEXT,
        "errorMessage" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" DATETIME
      );
    `);
    await systemPrisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProvisioningOperation_operationId_key" ON "ProvisioningOperation"("operationId");`);
    await systemPrisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProvisioningOperation_status_idx" ON "ProvisioningOperation"("status");`);
    tableEnsured = true;
  } catch (err: any) {
    logger.warn(`Could not ensure ProvisioningOperation table: ${err.message}`);
  }
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
   * Authoritative Policy (Fix #4):
   * 1. Detects and fails closed on unclassified tables (PRISTINE_VALIDATION_UNCLASSIFIED).
   * 2. Asserts strictly 0 business records across all classified BUSINESS_DATA tables.
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
      const tableNames = existingTables.map((t) => t.name);

      for (const tableName of tableNames) {
        // Skip SQLite system internals
        if (tableName.startsWith('sqlite_')) continue;

        const category = PRISTINE_TABLE_CLASSIFICATION[tableName];
        if (!category) {
          throw new ConflictError(
            `Pristine validation failed: Unclassified table "${tableName}" detected (PRISTINE_VALIDATION_UNCLASSIFIED). Cannot verify pristine state.`
          );
        }

        if (category === TableCategory.BUSINESS_DATA) {
          const rows = await client.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as cnt FROM "${tableName}";`);
          const count = Number(rows?.[0]?.cnt || 0);
          recordCounts[tableName] = count;
          if (count > 0) {
            throw new ConflictError(
              `Provisioned database is not pristine. Business table "${tableName}" contains ${count} customer record(s).`
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
   * Validate the approved immutable template before copying.
   * Invariants:
   * - Template exists and is readable.
   * - Passes structural and schema integrity check.
   * - Satisfies pristine policy (zero business records).
   */
  async validateTemplate(): Promise<string> {
    const templateDbPath = getDatabaseTemplatePath();
    if (!templateDbPath || !fs.existsSync(templateDbPath)) {
      throw new NotFoundError(
        'Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.'
      );
    }

    try {
      fs.accessSync(templateDbPath, fs.constants.R_OK);
    } catch (err: any) {
      throw new ValidationError(`Database template is not readable: ${err.message}`);
    }

    const validation = await databaseValidationService.validateDatabase(templateDbPath, { allowTemplate: true });
    if (!validation.isValid) {
      throw new ValidationError(`Database template failed structural validation: ${validation.error} (${validation.details})`);
    }

    await this.validatePristineState(templateDbPath);

    return templateDbPath;
  }

  /**
   * Reconcile interrupted or in-flight provisioning operations (Crash Recovery / Fix #3).
   * Finds operations in transient states and safely reconciles or compensates them without deleting customer data.
   */
  async reconcileInterruptedOperations(installationId?: string): Promise<{ reconciled: number; compensated: number }> {
    await ensureProvisioningOperationTable();
    const where: any = {
      status: {
        in: [
          'PENDING',
          'DESTINATION_RESERVED',
          'FILE_CREATED',
          'DATABASE_VALIDATED',
          'PRISTINE_VALIDATED',
          'CONTROL_RECORDS_CREATED',
          'RUNTIME_REGISTERED',
          'RECOVERABLE',
        ],
      },
    };
    if (installationId) {
      where.installationId = installationId;
    }

    const transientOps = await systemPrisma.provisioningOperation.findMany({ where });
    let reconciled = 0;
    let compensated = 0;

    for (const op of transientOps) {
      const fileExists = fs.existsSync(op.targetPath);
      const registry = op.databaseId
        ? await systemPrisma.databaseRegistry.findUnique({ where: { databaseId: op.databaseId } })
        : await systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath: op.targetPath } });

      const profile = await systemPrisma.profile.findUnique({ where: { code: op.profileCode } });
      const userProfile = profile
        ? await systemPrisma.userProfile.findFirst({
            where: { userId: op.userId, profileId: profile.id, isActive: true },
          })
        : null;

      // Case 1: Everything exists, database is valid and owned
      if (fileExists && registry && profile && userProfile) {
        const val = await databaseValidationService.validateDatabase(op.targetPath);
        if (val.isValid) {
          await systemPrisma.provisioningOperation.update({
            where: { id: op.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          reconciled++;
          continue;
        }
      }

      // Case 2: File exists but control registration incomplete
      if (fileExists && !registry) {
        try {
          const val = await databaseValidationService.validateDatabase(op.targetPath);
          const pristine = await this.validatePristineState(op.targetPath);
          if (val.isValid && pristine.isPristine) {
            // Complete registration idempotently
            const result = await systemPrisma.$transaction(async (tx) => {
              let prof = await tx.profile.findUnique({ where: { code: op.profileCode } });
              if (!prof) {
                prof = await tx.profile.create({
                  data: {
                    code: op.profileCode,
                    name: op.profileCode,
                    dbPath: op.targetPath,
                    schemaVersion: val.schemaVersion || 1,
                    status: 'ACTIVE',
                    isActive: true,
                  },
                });
              }
              const reg = await tx.databaseRegistry.create({
                data: {
                  databaseId: op.databaseId || crypto.randomUUID(),
                  displayName: op.profileCode,
                  canonicalPath: op.targetPath,
                  schemaVersion: val.schemaVersion || 1,
                  status: 'ACTIVE',
                  databaseType: 'LOCAL_PROFILE',
                  profileId: prof.id,
                  installationId: op.installationId,
                  lastValidatedAt: new Date(),
                },
              });
              await tx.userProfile.upsert({
                where: { userId_profileId: { userId: op.userId, profileId: prof.id } },
                update: { isActive: true },
                create: { userId: op.userId, profileId: prof.id, role: 'ADMIN', isActive: true },
              });
              return { prof, reg };
            });

            await systemPrisma.provisioningOperation.update({
              where: { id: op.id },
              data: {
                databaseId: result.reg.databaseId,
                profileId: result.prof.id,
                status: 'COMPLETED',
                completedAt: new Date(),
              },
            });
            reconciled++;
            continue;
          }
        } catch {
          // Validation failed on incomplete file: compensate
        }

        // Clean up incomplete file created by this operation
        try {
          fs.unlinkSync(op.targetPath);
        } catch {}
        await systemPrisma.provisioningOperation.update({
          where: { id: op.id },
          data: { status: 'COMPENSATED', errorCode: 'INCOMPLETE_ORPHAN_CLEANED' },
        });
        compensated++;
        continue;
      }

      // Case 3: File missing or registry without file
      await systemPrisma.provisioningOperation.update({
        where: { id: op.id },
        data: { status: 'COMPENSATED', errorCode: 'FILE_MISSING_CLEANED' },
      });
      compensated++;
    }

    return { reconciled, compensated };
  }

  /**
   * Provision a brand-new blank database from the immutable template.
   * Full Phase 6 lifecycle:
   * 1. Validate target user existence and installation association (Strict User-DB Isolation / Fix #1)
   * 2. Check durable operation identity & deterministic request hash (Durable Idempotency / Fix #2)
   * 3. Validate approved template before copying (Fix #4)
   * 4. Clone template to destination path
   * 5. Validate SQLite structure, schema, and SQLite integrity
   * 6. Validate pristine state with authoritative classification (Fix #4)
   * 7. Register Profile, DatabaseRegistry, and UserProfile in Control DB transaction for TARGET USER ONLY
   * 8. Emit audit events
   * 9. Register profile in runtime client pool
   * 10. Mark operation COMPLETED; compensate filesystem artifacts on failure (Crash Recovery / Fix #3)
   */
  async provisionBlankDatabase(input: ProvisionDatabaseInput): Promise<ProvisionDatabaseResultDto> {
    await ensureProvisioningOperationTable();

    // ── Fix #1: Authoritative Target User Enforcement ───────────────────────
    if (!input.userId || !input.userId.trim()) {
      throw new ValidationError('A valid target userId is strictly required for provisioning a new database.');
    }
    const targetUserId = input.userId.trim();

    const install = input.installationId
      ? { id: input.installationId }
      : await installationService.getOrCreateInstallation();

    // Validate user exists and is active
    const user = await systemPrisma.user.findUnique({ where: { id: targetUserId } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new ValidationError('Target user is invalid, inactive, or soft-deleted.');
    }

    // Validate user belongs to this installation
    const installUser = await systemPrisma.installationUser.findUnique({
      where: {
        installationId_userId: {
          installationId: install.id,
          userId: targetUserId,
        },
      },
    });
    if (!installUser) {
      throw new ConflictError('Target user does not belong to the current installation.');
    }

    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new ValidationError('Database display name is required');
    }

    const profileCode = (input.profileCode || displayName)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const profileName = input.profileName || displayName;

    const { canonicalPath: targetDbPath } = this.determineDestination(profileCode);

    // ── Fix #2: Durable Operation Identity & Hash Verification ─────────────
    const operationId = input.provisioningOperationId || crypto.randomUUID();
    const requestHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          installationId: install.id,
          userId: targetUserId,
          profileCode,
          displayName,
          profileName,
        })
      )
      .digest('hex');

    // Check for existing durable operation
    let durableOp = await systemPrisma.provisioningOperation.findUnique({
      where: { operationId },
    });

    if (durableOp) {
      // Reject reuse of same operationId with conflicting payload
      if (durableOp.requestHash !== requestHash) {
        throw new ConflictError(
          `Provisioning operation ID "${operationId}" was previously executed with different parameters.`
        );
      }

      // Idempotent return if already completed
      if (durableOp.status === 'COMPLETED') {
        logger.info(`Durable idempotency return for completed operation: ${operationId}`);
        const reg = durableOp.databaseId
          ? await systemPrisma.databaseRegistry.findUnique({
              where: { databaseId: durableOp.databaseId },
              include: { profile: true },
            })
          : await systemPrisma.databaseRegistry.findUnique({
              where: { canonicalPath: targetDbPath },
              include: { profile: true },
            });

        if (reg) {
          return {
            databaseId: reg.databaseId,
            displayName: reg.displayName,
            canonicalPath: reg.canonicalPath,
            profileId: reg.profileId || '',
            profileCode: reg.profile?.code || profileCode,
            schemaVersion: reg.schemaVersion,
            status: reg.status as any,
            isPristine: true,
            operationId,
          };
        }
      }

      if (durableOp.status === 'FAILED' || durableOp.status === 'COMPENSATED') {
        throw new ConflictError(
          `Provisioning operation "${operationId}" previously terminated: ${durableOp.errorMessage || durableOp.status}`
        );
      }
    } else {
      durableOp = await systemPrisma.provisioningOperation.create({
        data: {
          operationId,
          installationId: install.id,
          userId: targetUserId,
          profileCode,
          targetPath: targetDbPath,
          status: 'PENDING',
          requestHash,
        },
      });
    }

    // Fast in-process concurrency guard
    const lockKey = targetDbPath.toLowerCase();
    if (this.activeProvisioningPaths.has(lockKey)) {
      throw new ConflictError(`Concurrent provisioning already in progress for "${profileCode}".`);
    }
    this.activeProvisioningPaths.add(lockKey);

    let createdFile = false;
    try {
      // Guard: Disk collision check
      if (fs.existsSync(targetDbPath)) {
        const existingReg = await systemPrisma.databaseRegistry.findUnique({
          where: { canonicalPath: targetDbPath },
          include: { profile: true },
        });
        if (existingReg && existingReg.installationId === install.id) {
          logger.info(`Idempotent return for already registered database: ${targetDbPath}`);
          await systemPrisma.provisioningOperation.update({
            where: { operationId },
            data: {
              databaseId: existingReg.databaseId,
              profileId: existingReg.profileId,
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
          return {
            databaseId: existingReg.databaseId,
            displayName: existingReg.displayName,
            canonicalPath: existingReg.canonicalPath,
            profileId: existingReg.profileId || '',
            profileCode: existingReg.profile?.code || profileCode,
            schemaVersion: existingReg.schemaVersion,
            status: existingReg.status as any,
            isPristine: true,
            operationId,
          };
        }
        throw new ConflictError(`A database file already exists at "${targetDbPath}". Cannot overwrite.`);
      }

      // Step 1: Destination Reserved
      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: { status: 'DESTINATION_RESERVED' },
      });

      // Step 2: Validate approved template before copying (Fix #4)
      const templateDbPath = await this.validateTemplate();

      // Step 3: Clone immutable template to destination
      fs.copyFileSync(templateDbPath, targetDbPath);
      createdFile = true;

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: { status: 'FILE_CREATED' },
      });

      // Step 4: Structural, schema, and SQLite integrity validation
      const validation = await databaseValidationService.validateDatabase(targetDbPath);
      if (!validation.isValid) {
        throw new ValidationError(`Provisioned database failed validation: ${validation.error} (${validation.details})`);
      }

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: { status: 'DATABASE_VALIDATED' },
      });

      // Step 5: Pristine-state validation (Fix #4: authoritative classification)
      const pristineCheck = await this.validatePristineState(targetDbPath);
      if (!pristineCheck.isPristine) {
        throw new ConflictError('Newly provisioned database failed pristine check.');
      }

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: { status: 'PRISTINE_VALIDATED' },
      });

      // Step 6: Control DB Transaction: atomic registration of Profile, DatabaseRegistry, and UserProfile
      // STRICT FIX #1: Only targetUserId receives the UserProfile association.
      const result = await systemPrisma.$transaction(async (tx) => {
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
          profile = await tx.profile.update({
            where: { id: profile.id },
            data: {
              dbPath: targetDbPath,
              status: 'ACTIVE',
              isActive: true,
            },
          });
        }

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

        // Associating SOLELY the target user (Strict User-DB isolation)
        await tx.userProfile.upsert({
          where: {
            userId_profileId: {
              userId: targetUserId,
              profileId: profile.id,
            },
          },
          update: { isActive: true },
          create: {
            userId: targetUserId,
            profileId: profile.id,
            role: 'ADMIN',
            isActive: true,
          },
        });

        // Audit Events
        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_PROVISIONING_STARTED',
            description: `Provisioning started for new database "${displayName}" from template`,
            performedBy: targetUserId,
            metadata: JSON.stringify({ displayName, profileCode, targetDbPath, operationId }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_PROVISIONED',
            description: `Blank database provisioned successfully: ${displayName} -> ${targetDbPath}`,
            performedBy: targetUserId,
            metadata: JSON.stringify({
              databaseId: registry.databaseId,
              canonicalPath: targetDbPath,
              schemaVersion: validation.schemaVersion,
              operationId,
            }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_VALIDATED',
            description: `Newly provisioned database passed structural and pristine validation`,
            performedBy: targetUserId,
            metadata: JSON.stringify({
              tableCount: validation.tableCount,
              schemaVersion: validation.schemaVersion,
              pristine: true,
              operationId,
            }),
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'DatabaseRegistry',
            entityId: registry.databaseId,
            eventType: 'NEW_DATABASE_ATTACHED',
            description: `New database registered and attached: ${displayName} [${registry.databaseId}]`,
            performedBy: targetUserId,
            metadata: JSON.stringify({
              databaseId: registry.databaseId,
              profileId: profile.id,
              installationId: install.id,
              operationId,
            }),
          },
        });

        return { profile, registry };
      });

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: {
          databaseId: result.registry.databaseId,
          profileId: result.profile.id,
          status: 'CONTROL_RECORDS_CREATED',
        },
      });

      // Step 7: Register canonical profile in runtime client pool
      try {
        registerProfile({
          code: profileCode,
          name: profileName,
          dbPath: targetDbPath,
        });
      } catch (poolErr: any) {
        logger.warn(`Could not register canonical profile in pool: ${poolErr.message}`);
      }

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

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
        operationId,
      };
    } catch (err: any) {
      // Step 8: Compensation & Safe Cleanup (Fix #3)
      if (createdFile && fs.existsSync(targetDbPath)) {
        try {
          fs.unlinkSync(targetDbPath);
          logger.warn(`Filesystem compensation: deleted incomplete database file ${targetDbPath}`);
        } catch (unlinkErr: any) {
          logger.error(`Failed to clean up incomplete database file: ${unlinkErr.message}`);
        }
      }

      await systemPrisma.provisioningOperation.update({
        where: { operationId },
        data: {
          status: 'COMPENSATED',
          errorCode: err.code || 'PROVISIONING_FAILED',
          errorMessage: err.message,
        },
      }).catch(() => {});

      // Log failure audit events
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: profileCode,
          eventType: 'PROVISIONING_FAILED',
          description: `Failed to provision database for profile "${profileCode}": ${err.message}`,
          performedBy: targetUserId || 'SYSTEM',
          metadata: JSON.stringify({ error: err.message, profileCode, targetDbPath, operationId }),
        },
      }).catch(() => {});

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: profileCode,
          eventType: 'PROVISIONING_COMPENSATED',
          description: `Compensated incomplete artifacts for profile "${profileCode}"`,
          performedBy: targetUserId || 'SYSTEM',
          metadata: JSON.stringify({ targetDbPath, operationId }),
        },
      }).catch(() => {});

      throw err;
    } finally {
      this.activeProvisioningPaths.delete(lockKey);
    }
  }
}

export const databaseProvisioningService = new DatabaseProvisioningService();
