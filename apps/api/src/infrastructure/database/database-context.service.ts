import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { 
  systemPrisma, 
  getClientForProfile, 
  getActiveProfile, 
  registerProfile,
  disconnectAllClients,
} from './prisma';
import { canonicalizeDatabasePath } from '../../modules/system/database/database-path.util';
import { databaseValidationService } from '../../modules/system/database/database-validation.service';
import { ValidationError, NotFoundError, ConflictError } from '../../errors';
import { logger } from '../logging';
import { getControlDbPath, getDatabaseTemplatePath } from '../paths';


export interface ProfileDatabaseContext {
  profileId: string;
  profileCode: string;
  profileName: string;
  databaseId: string;
  canonicalPath: string;
  status: string;
  schemaVersion: number;
}

/**
 * Authoritative Database Context Service (SSOT)
 *
 * Implements the mandatory architecture:
 *   ONE PROFILE <-> ONE PHYSICAL .DB FILE
 *
 * Enforces ownership invariants:
 *  - Profile.code is unique
 *  - Profile.id is unique
 *  - DatabaseRegistry.databaseId is unique
 *  - DatabaseRegistry.canonicalPath is unique
 *  - A physical database path can belong to ONLY ONE Profile
 *  - A Profile can point to ONLY ONE active physical database
 *  - A database cannot be simultaneously ACTIVE for two profiles
 *  - A database cannot be attached to a second profile
 *  - No arbitrary fallback to 'Stavan.db', 'first active database', or directory scans
 */
export class DatabaseContextService {
  /**
   * Sync in-memory prisma configured profiles strictly with system.db (authoritative SSOT).
   * Invariant C: Never search for <profileCode>.db when DatabaseRegistry is missing.
   */
  async syncProfilesFromSystemDb(): Promise<void> {
    try {
      const activeProfiles = await systemPrisma.profile.findMany({
        where: { isActive: true },
        include: {
          databaseRegistries: {
            where: { status: 'ACTIVE' },
          },
        },
      });

      for (const prof of activeProfiles) {
        if (!prof.databaseRegistries || prof.databaseRegistries.length === 0) {
          logger.warn(`[DatabaseContextService] Lifecycle notice: Profile "${prof.code}" has no active registered DatabaseRegistry. Guessing DB path is forbidden.`);
          continue;
        }

        if (prof.databaseRegistries.length > 1) {
          logger.warn(`[DatabaseContextService] Lifecycle error: Profile "${prof.code}" is mapped to ${prof.databaseRegistries.length} active databases. Expected exactly one.`);
          continue;
        }

        const canonicalDbPath = prof.databaseRegistries[0].canonicalPath;
        if (canonicalDbPath && fs.existsSync(canonicalDbPath)) {
          try {
            registerProfile({
              code: prof.code,
              name: prof.name,
              dbPath: canonicalDbPath,
            });
          } catch {
            // Profile may already be registered
          }
        } else {
          logger.warn(`[DatabaseContextService] Physical DB file missing on disk for active profile "${prof.code}": "${canonicalDbPath}"`);
        }
      }
    } catch (err: any) {
      logger.warn(`[DatabaseContextService] Error syncing profiles from system.db: ${err.message}`);
    }
  }

  /**
   * Authoritative validation of business database context (Section 1.E).
   * Rejects: system.db, template.db, missing file, non-canonical path, duplicate ownership,
   * multiple active DBs, profile without active registry.
   */
  async assertValidBusinessDatabaseContext(profileIdOrCode: string): Promise<ProfileDatabaseContext> {
    if (!profileIdOrCode || !profileIdOrCode.trim()) {
      throw new ValidationError('Profile identifier is required to validate database context.');
    }
    const clean = profileIdOrCode.trim();

    const profile = await systemPrisma.profile.findFirst({
      where: {
        OR: [
          { id: clean },
          { code: { equals: clean } },
        ],
      },
      include: {
        databaseRegistries: true,
      },
    });

    if (!profile) {
      throw new NotFoundError(`Profile not found for identifier: "${clean}"`);
    }

    if (!profile.isActive) {
      throw new ConflictError(`Profile "${profile.code}" is not active.`);
    }

    const activeRegistries = (profile.databaseRegistries || []).filter(
      (r: any) => r.status === 'ACTIVE'
    );

    // Invariant D: Exactly one active registry per profile
    if (activeRegistries.length === 0) {
      throw new NotFoundError(
        `Database lifecycle error: Profile "${profile.code}" (${profile.id}) exists but has no active registered DatabaseRegistry entry. Silent database path inference is forbidden.`
      );
    }

    if (activeRegistries.length > 1) {
      throw new ConflictError(
        `Database ownership conflict: Profile "${profile.code}" (${profile.id}) is mapped to ${activeRegistries.length} active databases. Expected exactly one.`
      );
    }

    const targetRegistry = activeRegistries[0];

    // Invariant: Registry must belong to this profile
    if (!targetRegistry.profileId || targetRegistry.profileId !== profile.id) {
      throw new ConflictError(
        `Database ownership conflict: Registry entry "${targetRegistry.databaseId}" is not attached to profile "${profile.id}".`
      );
    }

    if (!targetRegistry.databaseId) {
      throw new ConflictError(`Database registry record is missing a stable databaseId.`);
    }

    // Canonical path validation
    const pathRes = canonicalizeDatabasePath(targetRegistry.canonicalPath);
    if (!pathRes.valid) {
      throw new ValidationError(`Non-canonical database path in registry: ${pathRes.error}`);
    }
    const canonicalPath = pathRes.canonicalPath;

    // Physical file must exist
    if (!fs.existsSync(canonicalPath)) {
      throw new NotFoundError(
        `Database file is missing on disk for profile "${profile.code}": "${canonicalPath}".`
      );
    }

    // Invariant: Reject internal control & template databases as business databases
    const controlDb = path.resolve(getControlDbPath()).toLowerCase();
    const templateDb = getDatabaseTemplatePath() ? path.resolve(getDatabaseTemplatePath()!).toLowerCase() : '';
    const lowerPath = canonicalPath.toLowerCase();

    if (lowerPath === controlDb) {
      throw new ConflictError('Cannot use system control database (system.db) as a profile business database.');
    }
    if (templateDb && lowerPath === templateDb) {
      throw new ConflictError('Cannot use template database (template.db) as a profile business database.');
    }

    // Invariant E: A physical database path can belong to ONLY ONE Profile (case-insensitive for Windows)
    const allOtherRegistries = await systemPrisma.databaseRegistry.findMany({
      where: {
        NOT: { profileId: profile.id },
      },
      include: { profile: true },
    });

    const conflict = allOtherRegistries.find(
      (r) => path.resolve(r.canonicalPath).toLowerCase() === path.resolve(canonicalPath).toLowerCase()
    );

    if (conflict) {
      throw new ConflictError(
        `Database ownership conflict: Path "${canonicalPath}" is already attached to profile "${conflict.profile?.code || conflict.profileId}". Two profiles cannot share the same database file.`
      );
    }

    return {
      profileId: profile.id,
      profileCode: profile.code,
      profileName: profile.name,
      databaseId: targetRegistry.databaseId,
      canonicalPath,
      status: targetRegistry.status || 'ACTIVE',
      schemaVersion: targetRegistry.schemaVersion || profile.schemaVersion || 1,
    };
  }

  /**
   * Resolve authoritative database context for a profile by profile ID.
   */
  async getDatabaseForProfile(profileId: string): Promise<ProfileDatabaseContext> {
    return this.assertValidBusinessDatabaseContext(profileId);
  }

  /**
   * Resolve authoritative database context for a profile by profile code.
   */
  async getDatabaseForProfileCode(profileCode: string): Promise<ProfileDatabaseContext> {
    return this.assertValidBusinessDatabaseContext(profileCode);
  }

  /**
   * Resolve authoritative database context for the active request's profile.
   * Fails closed if no profile context is established.
   */
  async getActiveProfileDatabase(): Promise<ProfileDatabaseContext> {
    const activeProfileCode = getActiveProfile();
    return this.getDatabaseForProfileCode(activeProfileCode);
  }


  /**
   * Validate that a database belongs strictly to the specified profile.
   */
  async assertDatabaseOwnership(profileId: string, databaseId: string): Promise<void> {
    const registry = await systemPrisma.databaseRegistry.findUnique({
      where: { databaseId },
    });

    if (!registry) {
      throw new NotFoundError(`Database not found for ID: "${databaseId}"`);
    }

    if (!registry.profileId || registry.profileId !== profileId) {
      throw new ConflictError(
        `Database ownership conflict: Database "${databaseId}" is not owned by profile "${profileId}".`
      );
    }
  }

  /**
   * Validate that a physical database path is available for registration/use by a given profile.
   */
  async assertDatabasePathAvailable(rawPath: string, excludeDatabaseId?: string): Promise<string> {
    const pathRes = canonicalizeDatabasePath(rawPath);
    if (!pathRes.valid) {
      throw new ValidationError(pathRes.error || 'Invalid database path');
    }
    const { canonicalPath } = pathRes;

    const controlDb = path.resolve(getControlDbPath()).toLowerCase();
    const templateDb = getDatabaseTemplatePath() ? path.resolve(getDatabaseTemplatePath()!).toLowerCase() : '';
    const lowerPath = canonicalPath.toLowerCase();

    if (lowerPath === controlDb) {
      throw new ConflictError('Cannot use system control database (system.db) as a profile business database.');
    }
    if (templateDb && lowerPath === templateDb) {
      throw new ConflictError('Cannot use template database (template.db) as a profile business database.');
    }

    const allRegistries = await systemPrisma.databaseRegistry.findMany({
      include: { profile: true },
    });

    const existing = allRegistries.find(
      (r) => path.resolve(r.canonicalPath).toLowerCase() === path.resolve(canonicalPath).toLowerCase()
    );

    if (existing && existing.databaseId !== excludeDatabaseId) {
      if (existing.profileId) {
        throw new ConflictError(
          `Database path "${canonicalPath}" is already attached to profile "${existing.profile?.code || existing.profileId}".`
        );
      }
    }

    return canonicalPath;
  }

  /**
   * Run full health validation on a profile's database.
   */
  async validateProfileDatabase(profileId: string) {
    const ctx = await this.getDatabaseForProfile(profileId);
    return databaseValidationService.validateDatabase(ctx.canonicalPath);
  }

  /**
   * Get Prisma client for a profile.
   */
  getClientForProfile(profileCodeOrId: string): PrismaClient {
    return getClientForProfile(profileCodeOrId);
  }

  /**
   * Get Prisma client for the active profile in request context.
   */
  getClientForActiveProfile(): PrismaClient {
    const activeProfile = getActiveProfile();
    return getClientForProfile(activeProfile);
  }

  /**
   * Disconnect all active profile clients and control client.
   */
  async disconnectAll(): Promise<void> {
    await disconnectAllClients();
  }
}

export const databaseContextService = new DatabaseContextService();
