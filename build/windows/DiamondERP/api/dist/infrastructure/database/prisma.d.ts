import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
export interface ProfileContext {
    profileId: string;
    profileCode?: string;
    userId?: string;
}
export declare const requestContext: AsyncLocalStorage<ProfileContext>;
interface ProfileConfig {
    activeProfile: string;
    allowedProfiles?: string[];
}
export declare function saveConfig(cfg: ProfileConfig): void;
export declare function ensureProfileDbFile(dbPath: string): void;
export declare const defaultProfile: string;
export interface CanonicalProfile {
    id: string;
    code: string;
    name: string;
    dbPath: string;
}
export declare const FORBIDDEN_PROFILE_NAMES: Set<string>;
/**
 * Register a canonical profile in the in-memory Prisma client cache.
 * Must be called by DatabaseContextService / DatabaseRegistry after validation.
 */
export declare function registerProfileInCache(profile: {
    code: string;
    name?: string;
    dbPath: string;
}): CanonicalProfile;
export declare const registerProfile: typeof registerProfileInCache;
export declare function removeConfiguredProfile(profileCode: string): void;
/**
 * Check if a profile is configured in the in-memory Prisma client cache.
 */
export declare function isConfiguredProfile(code: string): boolean;
/**
 * Get canonical profile metadata by code.
 */
export declare function getCanonicalProfile(code: string): CanonicalProfile | undefined;
/**
 * Return all registered canonical profile codes from authoritative cache.
 */
export declare function getAllProfiles(): string[];
export declare const systemPrisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
/**
 * Get or create a PrismaClient for an authorized canonical profile.
 * Thread-safe: uses promises to prevent racing client initializations.
 */
export declare function getClientForProfileAsync(profileCode: string): Promise<PrismaClient>;
export declare function updateProfileDbPath(profileCode: string, newDbPath: string): void;
export declare function getClientForProfile(profileCode: string): PrismaClient;
/**
 * Disconnect all open clients and cleanly shutdown database connections.
 */
export declare function disconnectAllClients(): Promise<void>;
export declare const closeAllDynamicClients: typeof disconnectAllClients;
export declare function runWithProfile<T>(profileCode: string, fn: () => T | Promise<T>): Promise<T>;
/**
 * Get the active profile for the current request context.
 *
 * SECURITY (Finding 2.1): This function throws if no profile context exists,
 * rather than silently falling back to a default. This prevents business
 * operations from accidentally executing against the wrong tenant.
 *
 * If you need a fallback for profile-agnostic operations, use
 * getActiveProfileOrDefault() instead.
 */
export declare function getActiveProfile(): string;
/**
 * Get the active profile or fall back to the default.
 * Use ONLY for operations that genuinely do not require tenant scoping
 * (e.g., system health checks, profile listing).
 */
export declare function getActiveProfileOrDefault(): string;
declare const prismaProxy: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export default prismaProxy;
//# sourceMappingURL=prisma.d.ts.map