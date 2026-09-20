import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { logger } from '../../../infrastructure/logging';
import { ValidationError, ConflictError, NotFoundError } from '../../../errors';
import { installationService } from '../installation.service';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { databaseValidationService } from '../database/database-validation.service';
import { databaseProvisioningService } from '../database/database-provisioning.service';
import { authService } from '../../auth/auth.service';
import { deviceSecurityService } from '../../security/device-security.service';
import { recoveryService } from '../recovery/recovery.service';
import { backupService } from '../backup/backup.service';
import type {
  LifecycleState,
  OnboardingStatusDto,
  UserDiscoveryResponseDto,
  UserDiscoveryCandidateDto,
  DatabaseDiscoveryResponseDto,
  DatabaseDiscoveryCandidateDto,
  DatabaseAttachmentPreviewDto,
  DatabaseSuitability,
  AttachDatabaseRequest,
  CreateDatabaseRequest,
} from '@diamond-erp/contracts';

export class OnboardingService {
  /**
   * Authoritative summary of the onboarding & lifecycle readiness state.
   * Never exposes secrets (passwords, hashes, tokens).
   */
  async getOnboardingState(): Promise<OnboardingStatusDto> {
    const install = await installationService.getOrCreateInstallation();
    const localDeviceId = installationService.getOrGenerateDeviceId();

    // 1. Device check
    const device = await systemPrisma.device.findUnique({
      where: { deviceId: localDeviceId },
      include: { securityState: true },
    });
    const deviceConfigured = !!device && device.status === 'ACTIVE';
    const pinConfigured = !!device?.securityState?.pinHash;

    // 2. User check
    const installUser = await systemPrisma.installationUser.findFirst({
      where: { installationId: install.id },
      include: { user: true },
    });
    const userConfigured = !!installUser && installUser.user.isActive && !installUser.user.deletedAt;

    // 3. Database check
    const activeRegistries = await systemPrisma.databaseRegistry.findMany({
      where: {
        installationId: install.id,
        status: 'ACTIVE',
      },
      include: { profile: true },
      orderBy: { updatedAt: 'desc' },
    });
    const activeRegistry = activeRegistries.find((r) => fs.existsSync(r.canonicalPath)) || null;
    const databaseConfigured = !!activeRegistry;

    // 4. Authoritative Ready verification
    const isReady =
      install.lifecycleState === 'READY' &&
      deviceConfigured &&
      pinConfigured &&
      userConfigured &&
      databaseConfigured;

    let reinstallRecovery = null;
    if (!isReady) {
      try {
        reinstallRecovery = await recoveryService.detectReinstallState();
      } catch (recErr) {
        logger.warn(`[OnboardingService] Reinstall detection error: ${String(recErr)}`);
      }
    }

    const LIFECYCLE_ORDER: LifecycleState[] = [
      'NOT_INITIALIZED',
      'APP_SETUP',
      'PIN_SETUP',
      'DEVICE_SETUP',
      'USER_DISCOVERY',
      'DATABASE_DISCOVERY',
      'DATABASE_VALIDATION',
      'DATABASE_SETUP',
      'READY',
    ];
    const currentIndex = LIFECYCLE_ORDER.indexOf(install.lifecycleState);
    const completedSteps = LIFECYCLE_ORDER.slice(0, Math.max(0, currentIndex));

    return {
      lifecycleState: install.lifecycleState,
      currentStep: install.lifecycleState,
      completedSteps,
      canContinue: true,
      installationInitialized: install.lifecycleState !== 'NOT_INITIALIZED',
      deviceConfigured,
      pinConfigured,
      userConfigured,
      databaseConfigured,
      ready: isReady,
      reinstallRecovery,
      installation: {
        id: install.id,
        installationId: install.installationId,
        appVersion: install.appVersion,
        status: install.status,
      },
      device: device
        ? {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            platform: device.platform,
            status: device.status,
          }
        : null,
      user: installUser
        ? {
            id: installUser.user.id,
            username: installUser.user.username,
            displayName: installUser.user.displayName,
            role: installUser.user.role,
          }
        : null,
      database: activeRegistry
        ? {
            databaseId: activeRegistry.databaseId,
            displayName: activeRegistry.displayName,
            canonicalPath: activeRegistry.canonicalPath,
            status: activeRegistry.status,
            profileCode: activeRegistry.profile?.code || null,
          }
        : null,
    };
  }

  /**
   * Initialize application environment.
   * Ensures data/config directories and advances NOT_INITIALIZED -> APP_SETUP.
   */
  async initializeApplication(): Promise<OnboardingStatusDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();
    backupService.cleanupPartialBackups();
    await recoveryService.reconcileInterruptedRestores();
    await databaseProvisioningService.reconcileInterruptedOperations(install.id);

    if (install.lifecycleState === 'NOT_INITIALIZED') {
      await installationService.updateLifecycleState('APP_SETUP');
    }

    return this.getOnboardingState();
  }

  /**
   * Set up application PIN during onboarding and advance state machine to DEVICE_SETUP.
   */
  async setupPin(pin: string, meta?: any): Promise<OnboardingStatusDto> {
    const install = await installationService.getOrCreateInstallation();
    if (install.lifecycleState !== 'APP_SETUP' && install.lifecycleState !== 'PIN_SETUP') {
      throw new ConflictError(
        `Cannot configure PIN at lifecycle state "${install.lifecycleState}". Expected PIN_SETUP or APP_SETUP.`
      );
    }

    if (install.lifecycleState === 'APP_SETUP') {
      await installationService.updateLifecycleState('PIN_SETUP');
    }

    const deviceId = installationService.getOrGenerateDeviceId();
    await deviceSecurityService.setupPin(deviceId, pin, meta);

    await installationService.updateLifecycleState('DEVICE_SETUP');
    return this.getOnboardingState();
  }

  /**
   * Register local workstation device during onboarding and advance state machine to USER_DISCOVERY.
   */
  async registerDevice(deviceName: string): Promise<OnboardingStatusDto> {
    const install = await installationService.getOrCreateInstallation();
    if (install.lifecycleState !== 'DEVICE_SETUP') {
      throw new ConflictError(
        `Cannot register device at lifecycle state "${install.lifecycleState}". Expected DEVICE_SETUP.`
      );
    }

    await installationService.registerDevice({
      deviceName: deviceName.trim(),
      platform: 'WINDOWS',
    });

    await installationService.updateLifecycleState('USER_DISCOVERY');
    return this.getOnboardingState();
  }

  /**
   * Discover candidate ERP business users available in the Control DB.
   * Returns safe metadata, omitting passwords, hashes, and security tokens.
   */
  async discoverUsers(): Promise<UserDiscoveryResponseDto> {
    const install = await installationService.getOrCreateInstallation();
    const users = await systemPrisma.user.findMany({
      where: { deletedAt: null },
      include: {
        installationUsers: {
          where: { installationId: install.id },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const candidates: UserDiscoveryCandidateDto[] = users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      isActive: u.isActive,
      associatedWithInstallation: u.installationUsers.length > 0,
      createdAt: u.createdAt.toISOString(),
    }));

    return { candidates };
  }

  /**
   * Associate an existing business user with the local installation.
   * Advances USER_DISCOVERY -> DATABASE_DISCOVERY if in discovery state.
   */
  async selectExistingUser(userId: string): Promise<{ success: boolean; user: any }> {
    const install = await installationService.getOrCreateInstallation();
    const user = await systemPrisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundError(`Business user not found for ID: ${userId}`);
    }
    if (!user.isActive) {
      throw new ConflictError(`User "${user.username}" is inactive and cannot be associated with this installation.`);
    }

    await installationService.associateUser(install.id, user.id);

    // Audit event for explicit user association
    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        eventType: 'USER_ASSOCIATED',
        description: `User "${user.username}" explicitly associated with installation ${install.installationId}`,
        performedBy: user.id,
        metadata: JSON.stringify({
          userId: user.id,
          username: user.username,
          installationId: install.id,
          associatedAt: new Date().toISOString(),
        }),
      },
    });

    // If currently at USER_DISCOVERY, advance state machine
    if (install.lifecycleState === 'USER_DISCOVERY') {
      await installationService.updateLifecycleState('DATABASE_DISCOVERY');
    }

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  /**
   * Create a new business user during onboarding and link to installation.
   * Reuses authoritative authService.createUser().
   */
  async createBusinessUser(input: {
    username: string;
    password: string;
    displayName: string;
    role?: string;
  }): Promise<{
    success: boolean;
    user: any;
    provisioningContext: {
      userId: string;
      installationId: string;
    };
  }> {
    const install = await installationService.getOrCreateInstallation();
    const role = input.role || 'ADMIN';

    // 0. Audit event: provisioning started
    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'User',
        entityId: input.username,
        eventType: 'NEW_USER_PROVISIONING_STARTED',
        description: `New user provisioning started for "${input.username}"`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({ username: input.username, role }),
      },
    }).catch(() => {});

    // 1. Create user in control DB using authoritative authService
    const created = await authService.createUser(
      input.username,
      input.password,
      input.displayName,
      role,
      []
    );

    // 2. Associate with installation
    await installationService.associateUser(install.id, created.id);

    // 3. Audit events: user created and associated
    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'User',
        entityId: created.id,
        eventType: 'NEW_USER_CREATED',
        description: `New business user account created: "${created.username}" [${created.id}]`,
        performedBy: created.id,
        metadata: JSON.stringify({
          userId: created.id,
          username: created.username,
          role: created.role,
        }),
      },
    }).catch(() => {});

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'User',
        entityId: created.id,
        eventType: 'USER_ASSOCIATED',
        description: `New user "${created.username}" created and associated with installation ${install.installationId}`,
        performedBy: created.id,
        metadata: JSON.stringify({
          userId: created.id,
          username: created.username,
          installationId: install.id,
        }),
      },
    });

    // 3. Advance lifecycle state if at USER_DISCOVERY
    if (install.lifecycleState === 'USER_DISCOVERY') {
      await installationService.updateLifecycleState('DATABASE_DISCOVERY');
    }

    return {
      success: true,
      user: created,
      provisioningContext: {
        userId: created.id,
        installationId: install.id,
      },
    };
  }

  /**
   * Bounded database discovery.
   * Scans registered databases, profile metadata, and local database folder.
   * Invariant: Never recursively scans arbitrary drives or system folders!
   */
  async discoverDatabases(): Promise<DatabaseDiscoveryResponseDto> {
    const install = await installationService.getOrCreateInstallation();
    const candidatesMap = new Map<string, DatabaseDiscoveryCandidateDto>();

    const controlDbCanonical = path.resolve(getControlDbPath()).toLowerCase();
    const templateDbCanonical = getDatabaseTemplatePath()
      ? path.resolve(getDatabaseTemplatePath()!).toLowerCase()
      : null;

    // 1. Existing DatabaseRegistry records
    const registries = await systemPrisma.databaseRegistry.findMany();
    for (const reg of registries) {
      const canonical = path.resolve(reg.canonicalPath);
      const lower = canonical.toLowerCase();
      if (lower === controlDbCanonical || lower === templateDbCanonical) continue;

      candidatesMap.set(lower, {
        displayName: reg.displayName,
        canonicalPath: canonical,
        source: 'REGISTRY',
        status: fs.existsSync(canonical) ? (reg.status as any) : 'MISSING',
        isKnown: true,
        isCurrentInstallation: reg.installationId === install.id,
      });
    }

    // 2. Bounded scan of local databases folder
    const dbDir = path.resolve(getDatabasesDir());
    if (fs.existsSync(dbDir)) {
      try {
        const files = fs.readdirSync(dbDir);
        for (const file of files) {
          if (
            file.endsWith('.db') &&
            !file.endsWith('-wal') &&
            !file.endsWith('-shm') &&
            !file.includes('.bak') &&
            file !== 'test.db'
          ) {
            const canonical = path.resolve(dbDir, file);
            const lower = canonical.toLowerCase();
            if (lower === controlDbCanonical || lower === templateDbCanonical) continue;

            if (!candidatesMap.has(lower)) {
              candidatesMap.set(lower, {
                displayName: file.replace(/\.db$/, ''),
                canonicalPath: canonical,
                source: 'LOCAL_DIR',
                status: 'ACTIVE',
                isKnown: false,
                isCurrentInstallation: false,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(`Could not read databases directory for discovery: ${(err as Error).message}`);
      }
    }

    logger.info(`Discovered ${candidatesMap.size} database candidates for installation ${install.installationId}`);

    return {
      candidates: Array.from(candidatesMap.values()),
    };
  }

  /**
   * Inspect a candidate database path in a strictly READ-ONLY manner.
   * Classifies suitability: VALID, REQUIRES_CONFIRMATION, UNSUPPORTED, CORRUPTED, INVALID, CONFLICT, MISSING.
   */
  async inspectDatabaseCandidate(candidatePath: string): Promise<DatabaseAttachmentPreviewDto> {
    const install = await installationService.getOrCreateInstallation();
    const pathResult = canonicalizeDatabasePath(candidatePath);

    if (!pathResult.valid) {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: candidatePath,
          eventType: 'DATABASE_REJECTED',
          description: `Database inspection rejected for invalid path: ${pathResult.error}`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({ candidatePath, error: pathResult.error }),
        },
      }).catch(() => {});

      return {
        canonicalPath: candidatePath,
        displayName: path.basename(candidatePath),
        status: 'INVALID',
        suitability: 'INVALID',
        tableCount: 0,
        schemaVersion: 0,
        isExistingRegistry: false,
        conflictReason: pathResult.error,
        details: pathResult.error,
      };
    }

    const { canonicalPath: canonical } = pathResult;
    const displayName = path.basename(canonical).replace(/\.db$/, '') || 'Database';

    // Guard 1: Reject Control Database (system.db)
    const controlDbCanonical = path.resolve(getControlDbPath()).toLowerCase();
    if (canonical.toLowerCase() === controlDbCanonical) {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: canonical,
          eventType: 'DATABASE_CONFLICT_DETECTED',
          description: 'Attempt to inspect/attach Control DB (system.db) as business database was blocked.',
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({ canonicalPath: canonical, conflictReason: 'DATABASE_IS_CONTROL_DB' }),
        },
      }).catch(() => {});

      return {
        canonicalPath: canonical,
        displayName,
        status: 'INVALID',
        suitability: 'CONFLICT',
        tableCount: 0,
        schemaVersion: 0,
        isExistingRegistry: false,
        conflictReason: 'DATABASE_IS_CONTROL_DB',
        details: 'The system control database (system.db) cannot be attached as an ERP business database.',
      };
    }

    // Guard 2: Reject Template Database (template.db)
    const templateDbPath = getDatabaseTemplatePath();
    if (templateDbPath && canonical.toLowerCase() === path.resolve(templateDbPath).toLowerCase()) {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: canonical,
          eventType: 'DATABASE_CONFLICT_DETECTED',
          description: 'Attempt to inspect/attach schema template (template.db) as business database was blocked.',
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({ canonicalPath: canonical, conflictReason: 'DATABASE_IS_TEMPLATE' }),
        },
      }).catch(() => {});

      return {
        canonicalPath: canonical,
        displayName,
        status: 'INVALID',
        suitability: 'CONFLICT',
        tableCount: 0,
        schemaVersion: 0,
        isExistingRegistry: false,
        conflictReason: 'DATABASE_IS_TEMPLATE',
        details: 'The schema template (template.db) is immutable and cannot be attached as an active business database.',
      };
    }

    // Guard 3: Check existing registration
    const existingReg = await systemPrisma.databaseRegistry.findUnique({
      where: { canonicalPath: canonical },
      include: { profile: true },
    });

    if (existingReg && existingReg.installationId !== install.id) {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: existingReg.databaseId,
          eventType: 'DATABASE_CONFLICT_DETECTED',
          description: `Ownership conflict: database is registered under foreign installation ${existingReg.installationId}`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            databaseId: existingReg.databaseId,
            registeredInstallationId: existingReg.installationId,
            currentInstallationId: install.id,
          }),
        },
      }).catch(() => {});

      return {
        canonicalPath: canonical,
        displayName: existingReg.displayName,
        status: existingReg.status as any,
        suitability: 'CONFLICT',
        tableCount: 0,
        schemaVersion: existingReg.schemaVersion,
        profileCode: existingReg.profile?.code,
        profileName: existingReg.profile?.name,
        isExistingRegistry: true,
        conflictReason: 'DATABASE_INSTALLATION_CONFLICT',
        details: 'Database is already registered under another installation.',
      };
    }

    // Guard 4: Perform read-only structural validation
    const validation = await databaseValidationService.validateDatabase(canonical);

    if (!validation.isValid) {
      let suitability: DatabaseSuitability = 'INVALID';
      if (validation.status === 'CORRUPTED') suitability = 'CORRUPTED';
      else if (validation.status === 'UNSUPPORTED') suitability = 'UNSUPPORTED';

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: canonical,
          eventType: 'DATABASE_REJECTED',
          description: `Database inspection failed validation: ${validation.error} (${validation.details})`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            canonicalPath: canonical,
            status: validation.status,
            suitability,
            error: validation.error,
          }),
        },
      }).catch(() => {});

      return {
        canonicalPath: canonical,
        displayName,
        status: validation.status,
        suitability,
        tableCount: validation.tableCount,
        schemaVersion: validation.schemaVersion,
        profileCode: existingReg?.profile?.code,
        profileName: existingReg?.profile?.name,
        isExistingRegistry: !!existingReg,
        conflictReason: validation.error,
        details: validation.details,
      };
    }

    // Valid Diamond ERP database: Requires explicit user confirmation before attachment!
    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'DatabaseRegistry',
        entityId: canonical,
        eventType: 'DATABASE_INSPECTED',
        description: `Database candidate inspected successfully: ${displayName} [${canonical}]`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({
          canonicalPath: canonical,
          tableCount: validation.tableCount,
          schemaVersion: validation.schemaVersion,
        }),
      },
    }).catch(() => {});

    return {
      canonicalPath: canonical,
      displayName: existingReg?.displayName || displayName,
      status: 'ACTIVE',
      suitability: 'REQUIRES_CONFIRMATION',
      tableCount: validation.tableCount,
      schemaVersion: validation.schemaVersion,
      profileCode: existingReg?.profile?.code,
      profileName: existingReg?.profile?.name,
      isExistingRegistry: !!existingReg,
      details: 'Valid Diamond ERP database. Explicit confirmation required to attach.',
    };
  }

  /**
   * Explicitly attach an existing valid Diamond ERP database.
   * Invariant: Requires confirmAttachment = true. Never auto-attaches.
   * Failure compensation: Never mutates or deletes the physical file.
   */
  async attachExistingDatabase(input: AttachDatabaseRequest): Promise<{ success: boolean; registry: any }> {
    if (!input.confirmAttachment) {
      throw new ValidationError('Explicit confirmation is required before attaching an existing database.');
    }

    const install = await installationService.getOrCreateInstallation();
    const preview = await this.inspectDatabaseCandidate(input.path);

    if (preview.suitability === 'CONFLICT') {
      throw new ConflictError(preview.details || `Database conflict: ${preview.conflictReason}`);
    }
    if (preview.suitability !== 'REQUIRES_CONFIRMATION' && preview.suitability !== 'VALID') {
      throw new ValidationError(preview.details || 'Selected database is invalid or unsupported.');
    }

    const canonical = preview.canonicalPath;
    const profileCode = (input.profileCode || preview.profileCode || preview.displayName || 'default')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const profileName = input.profileName || preview.profileName || preview.displayName || 'Default Profile';

    // Staged Transaction with compensation
    const result = await systemPrisma.$transaction(async (tx) => {
      // 1. Upsert Profile
      let profile = await tx.profile.findUnique({ where: { code: profileCode } });
      if (!profile) {
        profile = await tx.profile.create({
          data: {
            code: profileCode,
            name: profileName,
            dbPath: canonical,
            schemaVersion: preview.schemaVersion || 1,
            status: 'ACTIVE',
            isActive: true,
          },
        });
      } else if (profile.dbPath !== canonical) {
        profile = await tx.profile.update({
          where: { id: profile.id },
          data: { dbPath: canonical, status: 'ACTIVE' },
        });
      }

      // 2. Upsert DatabaseRegistry
      let registry = await tx.databaseRegistry.findUnique({
        where: { canonicalPath: canonical },
      });

      if (registry) {
        if (registry.installationId && registry.installationId !== install.id) {
          throw new ConflictError('Database is already registered under another installation and cannot be claimed.');
        }
        registry = await tx.databaseRegistry.update({
          where: { id: registry.id },
          data: {
            installationId: install.id,
            profileId: profile.id,
            status: 'ACTIVE',
            lastValidatedAt: new Date(),
          },
        });
      } else {
        registry = await tx.databaseRegistry.create({
          data: {
            databaseId: crypto.randomUUID(),
            displayName: input.displayName || preview.displayName,
            canonicalPath: canonical,
            schemaVersion: preview.schemaVersion || 1,
            status: 'ACTIVE',
            databaseType: 'EXTERNAL',
            profileId: profile.id,
            installationId: install.id,
            lastValidatedAt: new Date(),
          },
        });
      }

      // 3. Link designated business user to this profile (isolate to target user)
      const installUsers = await tx.installationUser.findMany({
        where: { installationId: install.id },
      });
      const designatedUserId = input.targetUserId || input.userId;
      const targetUserIds = designatedUserId
        ? [designatedUserId]
        : installUsers.map((u) => u.userId);

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

      // 4. Audit events
      await tx.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: registry.databaseId,
          eventType: 'DATABASE_ATTACHMENT_CONFIRMED',
          description: `User explicitly confirmed attachment of database: ${registry.displayName} -> ${canonical}`,
          performedBy: installUsers[0]?.userId || 'SYSTEM',
          metadata: JSON.stringify({
            canonicalPath: canonical,
            databaseId: registry.databaseId,
            confirmed: true,
          }),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: 'DatabaseRegistry',
          entityId: registry.databaseId,
          eventType: 'DATABASE_ATTACHED',
          description: `Existing database attached: ${registry.displayName} -> ${canonical}`,
          performedBy: installUsers[0]?.userId || 'SYSTEM',
          metadata: JSON.stringify({
            canonicalPath: canonical,
            databaseId: registry.databaseId,
            profileId: profile.id,
            installationId: install.id,
          }),
        },
      });

      return { profile, registry };
    });

    logger.info(`Attached existing database: ${result.registry.displayName} [${result.registry.databaseId}]`);

    // Advance to DATABASE_SETUP progressively
    const freshInstall = await installationService.getOrCreateInstallation();
    if (freshInstall.lifecycleState === 'DATABASE_DISCOVERY') {
      await installationService.updateLifecycleState('DATABASE_VALIDATION');
    }
    const currentValid = await installationService.getOrCreateInstallation();
    if (currentValid.lifecycleState === 'DATABASE_VALIDATION') {
      await installationService.updateLifecycleState('DATABASE_SETUP');
    }

    return {
      success: true,
      registry: result.registry,
    };
  }

  /**
   * Provision a brand new profile database from immutable template.db.
   * Invariant: If template.db is missing, fails immediately without creating empty DB.
   * Delegated authoritatively to DatabaseProvisioningService for pristine validation & atomic compensation.
   */
  async createNewDatabase(input: CreateDatabaseRequest): Promise<{ success: boolean; registry: any }> {
    // 1. Environmental prerequisite: template existence check
    const templateDbPath = getDatabaseTemplatePath();
    if (!templateDbPath || !fs.existsSync(templateDbPath)) {
      throw new NotFoundError(
        'Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.'
      );
    }

    const install = await installationService.getOrCreateInstallation();

    // Authoritative target user enforcement: Never infer or fall back to installation-wide users
    const targetUserId = input.userId?.trim();
    if (!targetUserId) {
      throw new ValidationError('A valid target userId is strictly required for provisioning a new database.');
    }

    const user = await systemPrisma.user.findUnique({ where: { id: targetUserId } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new ValidationError(`Target user "${targetUserId}" not found, inactive, or soft-deleted.`);
    }

    const installUser = await systemPrisma.installationUser.findUnique({
      where: {
        installationId_userId: {
          installationId: install.id,
          userId: targetUserId,
        },
      },
    });
    if (!installUser) {
      throw new ConflictError(`Target user "${targetUserId}" does not belong to the current local installation.`);
    }

    const provisioned = await databaseProvisioningService.provisionBlankDatabase({
      displayName: input.displayName,
      profileCode: input.profileCode,
      profileName: input.profileName,
      userId: targetUserId,
      installationId: install.id,
      provisioningOperationId: input.provisioningOperationId,
    });

    // Advance to DATABASE_SETUP progressively
    const freshInstall = await installationService.getOrCreateInstallation();
    if (freshInstall.lifecycleState === 'DATABASE_DISCOVERY') {
      await installationService.updateLifecycleState('DATABASE_VALIDATION');
    }
    const currentValid = await installationService.getOrCreateInstallation();
    if (currentValid.lifecycleState === 'DATABASE_VALIDATION') {
      await installationService.updateLifecycleState('DATABASE_SETUP');
    }

    return {
      success: true,
      registry: provisioned,
    };
  }

  /**
   * Authoritative verification gate before advancing to READY.
   * If silent is true, returns boolean; otherwise throws ConflictError detailing missing prerequisites.
   */
  async assertReady(silent = false): Promise<boolean> {
    const install = await installationService.getOrCreateInstallation();

    // 1. Installation Active
    if (install.status !== 'ACTIVE') {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: Installation is not in ACTIVE status.');
    }

    // 2. Authoritative Active Device
    const localDeviceId = installationService.getOrGenerateDeviceId();
    const dev = await systemPrisma.device.findUnique({
      where: { deviceId: localDeviceId },
      include: { securityState: true },
    });
    if (!dev || dev.status !== 'ACTIVE') {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: Authoritative local device is not registered or is not ACTIVE.');
    }

    // 3. Configured PIN
    if (!dev.securityState?.pinHash) {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: Application PIN has not been configured for this device.');
    }

    // 4. Business User Associated
    const installUsers = await systemPrisma.installationUser.findMany({
      where: { installationId: install.id },
      include: { user: true },
    });
    const activeInstallUsers = installUsers.filter((iu) => iu.user && iu.user.isActive && !iu.user.deletedAt);
    if (activeInstallUsers.length === 0) {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: No active business user is associated with this installation.');
    }

    // 5. Active DatabaseRegistry
    const registries = await systemPrisma.databaseRegistry.findMany({
      where: {
        installationId: install.id,
        status: 'ACTIVE',
      },
      include: { profile: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (registries.length === 0) {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: No active database is registered for this installation.');
    }

    const registry = registries.find((r) => fs.existsSync(r.canonicalPath)) || registries[0];

    // 6. Physical database existence & validation
    if (!fs.existsSync(registry.canonicalPath)) {
      if (silent) return false;
      throw new ConflictError(`Cannot mark READY: Physical database file is missing at ${registry.canonicalPath}.`);
    }

    const validation = await databaseValidationService.validateDatabase(registry.canonicalPath);
    if (!validation.isValid) {
      if (silent) return false;
      throw new ConflictError(`Cannot mark READY: Physical database validation failed: ${validation.details}`);
    }

    // 7. Profile association
    if (!registry.profile || !registry.profile.isActive) {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: Database is not associated with an active ERP profile.');
    }

    // 8. UserProfile ownership for active profile
    const activeUserIds = activeInstallUsers.map((iu) => iu.userId);
    const userProfile = await systemPrisma.userProfile.findFirst({
      where: {
        profileId: registry.profile.id,
        userId: { in: activeUserIds },
        isActive: true,
      },
    });
    if (!userProfile) {
      if (silent) return false;
      throw new ConflictError('Cannot mark READY: Active business user is not associated with this database profile.');
    }

    // 9. In-flight provisioning operations must be COMPLETED
    try {
      const inFlightOp = await systemPrisma.provisioningOperation.findFirst({
        where: {
          installationId: install.id,
          status: {
            in: [
              'PENDING',
              'DESTINATION_RESERVED',
              'FILE_CREATED',
              'DATABASE_VALIDATED',
              'PRISTINE_VALIDATED',
              'CONTROL_RECORDS_CREATED',
              'RUNTIME_REGISTERED',
              'COMPENSATING',
            ],
          },
        },
      });
      if (inFlightOp) {
        if (silent) return false;
        throw new ConflictError(`Cannot mark READY: Provisioning operation ${inFlightOp.operationId} is still in status "${inFlightOp.status}".`);
      }
    } catch {}

    return true;
  }

  /**
   * Finalize onboarding and advance to READY state.
   */
  async completeOnboarding(): Promise<OnboardingStatusDto> {
    await this.assertReady(false);
    await installationService.updateLifecycleState('READY');

    const install = await installationService.getOrCreateInstallation();
    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'Installation',
        entityId: install.id,
        eventType: 'ONBOARDING_COMPLETED',
        description: `Onboarding completed successfully. Installation ${install.installationId} is now READY.`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({
          installationId: install.installationId,
          completedAt: new Date().toISOString(),
        }),
      },
    });

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'Installation',
        entityId: install.id,
        eventType: 'NEW_USER_PROVISIONING_COMPLETED',
        description: `New user provisioning workflow completed. Installation ${install.installationId} is now READY.`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({
          installationId: install.installationId,
          completedAt: new Date().toISOString(),
        }),
      },
    }).catch(() => {});

    return this.getOnboardingState();
  }

  /**
   * Reset recoverable onboarding steps (e.g. database step retry)
   * without destroying PIN, device, or installation identity.
   */
  async resetRecoverableOnboardingState(): Promise<OnboardingStatusDto> {
    const install = await installationService.getOrCreateInstallation();

    if (
      install.lifecycleState === 'DATABASE_VALIDATION' ||
      install.lifecycleState === 'DATABASE_SETUP'
    ) {
      await installationService.updateLifecycleState('DATABASE_DISCOVERY', { isReset: true });
    }

    return this.getOnboardingState();
  }

  /**
   * Finalize database setup step before entering READY.
   */
  async completeDatabaseSetup(): Promise<OnboardingStatusDto> {
    const install = await installationService.getOrCreateInstallation();
    if (
      install.lifecycleState !== 'DATABASE_VALIDATION' &&
      install.lifecycleState !== 'DATABASE_SETUP'
    ) {
      throw new ConflictError(
        `Cannot complete database setup at lifecycle state "${install.lifecycleState}". Expected DATABASE_VALIDATION or DATABASE_SETUP.`
      );
    }

    if (install.lifecycleState === 'DATABASE_VALIDATION') {
      await installationService.updateLifecycleState('DATABASE_SETUP');
    }

    return this.getOnboardingState();
  }
}

export const onboardingService = new OnboardingService();
