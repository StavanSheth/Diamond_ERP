import fs from 'fs';
import path from 'path';
import os from 'os';
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
import { databaseRegistryService } from '../../modules/system/database/database-registry.service';
import { ValidationError, NotFoundError, ConflictError } from '../../errors';
import { logger } from '../logging';
import { getControlDbPath, getDatabaseTemplatePath, getDatabasesDir } from '../paths';


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
        let canonicalDbPath = prof.databaseRegistries[0]?.canonicalPath || prof.dbPath;
        if (!canonicalDbPath) {
          const candidatePaths = [
            path.resolve(getDatabasesDir(), `${prof.code}.db`),
            path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DiamondERP', 'databases', `${prof.code}.db`),
          ];
          for (const cand of candidatePaths) {
            if (fs.existsSync(cand)) {
              canonicalDbPath = cand;
              await databaseRegistryService.registerDatabase({
                rawPath: cand,
                profileId: prof.id,
                displayName: prof.name || prof.code,
              }).catch(() => {});
              break;
            }
          }
        }
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
        }
      }
    } catch (err: any) {
      logger.warn(`[DatabaseContextService] Error syncing profiles from system.db: ${err.message}`);
    }
  }

  /**
   * Resolve authoritative database context for a profile by profile ID.
   */
  async getDatabaseForProfile(profileId: string): Promise<ProfileDatabaseContext> {
    if (!profileId || !profileId.trim()) {
      throw new ValidationError('Profile ID is required to resolve database context.');
    }

    const profile = await systemPrisma.profile.findUnique({
      where: { id: profileId.trim() },
      include: {
        databaseRegistries: true,
      },
    });

    if (!profile) {
      throw new NotFoundError(`Profile not found for ID: "${profileId}"`);
    }

    return this.resolveContextFromProfile(profile);
  }

  /**
   * Resolve authoritative database context for a profile by profile code.
   */
  async getDatabaseForProfileCode(profileCode: string): Promise<ProfileDatabaseContext> {
    if (!profileCode || !profileCode.trim()) {
      throw new ValidationError('Profile code is required to resolve database context.');
    }

    const cleanCode = profileCode.trim();
    const profile = await systemPrisma.profile.findFirst({
      where: {
        code: { equals: cleanCode },
      },
      include: {
        databaseRegistries: true,
      },
    });

    if (!profile) {
      throw new NotFoundError(`Profile not found for code: "${profileCode}"`);
    }

    return this.resolveContextFromProfile(profile);
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
   * Internal helper: validates ownership invariants on a loaded profile.
   */
  private async resolveContextFromProfile(profile: any): Promise<ProfileDatabaseContext> {
    const activeRegistries = (profile.databaseRegistries || []).filter(
      (r: any) => r.status === 'ACTIVE'
    );

    // Invariant F: A Profile can point to ONLY ONE active physical database
    if (activeRegistries.length > 1) {
      throw new ConflictError(
        `Database ownership conflict: Profile "${profile.code}" (${profile.id}) is mapped to ${activeRegistries.length} active databases. Expected exactly one.`
      );
    }

    let targetRegistry = activeRegistries[0];

    // If no active registry, inspect all registries for this profile
    if (!targetRegistry && (profile.databaseRegistries || []).length > 0) {
      targetRegistry = profile.databaseRegistries[0];
    }

    // Invariant: Profile exists BUT DatabaseRegistry entry does not exist -> Deterministic Lifecycle Error
    if (!targetRegistry) {
      throw new NotFoundError(
        `Database lifecycle error: Profile "${profile.code}" (${profile.id}) exists but has no registered DatabaseRegistry entry. Silent database path inference is forbidden.`
      );
    }

    const canonicalPath = targetRegistry.canonicalPath;
    const databaseId = targetRegistry.databaseId;
    let status: string = targetRegistry.status || 'ACTIVE';
    const schemaVersion: number = targetRegistry.schemaVersion || profile.schemaVersion || 1;

    // Invariant E: A physical database path can belong to ONLY ONE Profile
    const conflictingRegistries = await systemPrisma.databaseRegistry.findMany({
      where: {
        canonicalPath,
        NOT: { profileId: profile.id },
      },
      include: { profile: true },
    });

    if (conflictingRegistries.length > 0) {
      const conflict = conflictingRegistries[0];
      throw new ConflictError(
        `Database ownership conflict: Path "${canonicalPath}" is already attached to profile "${conflict.profile?.code || conflict.profileId}". Two profiles cannot share the same database file.`
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

    if (!fs.existsSync(canonicalPath)) {
      status = 'MISSING';
    }

    return {
      profileId: profile.id,
      profileCode: profile.code,
      profileName: profile.name,
      databaseId,
      canonicalPath,
      status,
      schemaVersion,
    };
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

    const existing = await systemPrisma.databaseRegistry.findUnique({
      where: { canonicalPath },
      include: { profile: true },
    });

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
