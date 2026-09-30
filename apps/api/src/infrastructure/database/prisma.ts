import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import fs from 'fs';
import { getConfigDir, getDatabaseTemplatePath, getControlDbPath } from '../paths';



// ── Profile Context ─────────────────────────────────────────────────────
export interface ProfileContext {
  profileId: string;
  profileCode?: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<ProfileContext>();

// ── Constants & Paths ───────────────────────────────────────────────────
const CONFIG_PATH = path.join(getConfigDir(), '.profile-config.json');

const MAX_CLIENTS = 10;
const PROFILE_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

interface ProfileConfig {
  activeProfile: string;
  allowedProfiles?: string[];
}

function readConfig(): ProfileConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Ignore read errors, fall back to default
  }
  // Fresh install default: do NOT default to hardcoded profile
  const fallback = process.env.DEFAULT_PROFILE || '';
  return { activeProfile: fallback, allowedProfiles: fallback ? [fallback] : [] };
}

export function saveConfig(cfg: ProfileConfig): void {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Prisma] Could not persist profile config:', err);
  }
}

export function ensureProfileDbFile(dbPath: string): void {
  if (!fs.existsSync(dbPath)) {
    const targetDir = path.dirname(dbPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const templateDb = getDatabaseTemplatePath();

    if (templateDb && fs.existsSync(templateDb)) {
      // Copy the schema-only template (no data rows)
      fs.copyFileSync(templateDb, dbPath);
    } else {
      // Fail closed: Never create an empty 0-byte SQLite database file
      throw new Error(
        `Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.`
      );
    }
  }
}

const config = readConfig();
export const defaultProfile = config.activeProfile || process.env.DEFAULT_PROFILE || '';

// Canonical in-memory profile definition
export interface CanonicalProfile {
  id: string;
  code: string;
  name: string;
  dbPath: string;
}

// ── Canonical Profile Registry Cache ─────────────────────────────────────
// Cache of registered profiles, maintained strictly by DatabaseContextService / system.db.
// Invariant: Prisma.ts MUST NOT independently infer or guess DB paths.
const configuredProfiles = new Map<string, CanonicalProfile>();
export const FORBIDDEN_PROFILE_NAMES = new Set(['system', 'template', 'test']);

/**
 * Register a canonical profile in the in-memory Prisma client cache.
 * Must be called by DatabaseContextService / DatabaseRegistry after validation.
 */
export function registerProfileInCache(profile: { code: string; name?: string; dbPath: string }): CanonicalProfile {
  if (!PROFILE_REGEX.test(profile.code)) {
    throw new Error(`Invalid profile code format: "${profile.code}". Must match ${PROFILE_REGEX}`);
  }
  if (FORBIDDEN_PROFILE_NAMES.has(profile.code.toLowerCase())) {
    throw new Error(`Reserved database profile name cannot be registered as a business profile: "${profile.code}"`);
  }

  const key = profile.code.toLowerCase();
  const canonicalDbPath = path.resolve(profile.dbPath);

  if (!fs.existsSync(canonicalDbPath)) {
    throw new Error(
      `Database file does not exist at "${canonicalDbPath}". Database provisioning must be completed before profile registration.`
    );
  }

  const canonical: CanonicalProfile = {
    id: key,
    code: profile.code,
    name: profile.name || profile.code,
    dbPath: canonicalDbPath,
  };

  configuredProfiles.set(key, canonical);

  // Evict any existing client if path changed so new connection is opened
  const existing = clientRegistry.get(key);
  if (existing) {
    clientRegistry.delete(key);
    existing.client.$disconnect().catch(() => {});
  }

  return canonical;
}

export const registerProfile = registerProfileInCache;

function initConfiguredProfiles() {
  configuredProfiles.clear();
  // Phase 1 Hardening: Load profile codes from .profile-config.json cache.
  // DB paths are NOT inferred here — they are registered only via registerProfileInCache()
  // which is called by DatabaseContextService.syncProfilesFromSystemDb() on startup.
  // ponytail: disk scan removed; system.db is the sole authority for DB paths.
}

initConfiguredProfiles();

export function removeConfiguredProfile(profileCode: string): void {
  const key = profileCode.toLowerCase();
  configuredProfiles.delete(key);
  const entry = clientRegistry.get(key);
  if (entry) {
    clientRegistry.delete(key);
    entry.client.$disconnect().catch(() => {});
  }
  const currentCfg = readConfig();
  const allowed = (currentCfg.allowedProfiles || []).filter(p => p.toLowerCase() !== key);
  saveConfig({
    activeProfile: currentCfg.activeProfile.toLowerCase() === key ? defaultProfile : currentCfg.activeProfile,
    allowedProfiles: allowed.length > 0 ? allowed : [defaultProfile],
  });
}

// End profile cache management

/**
 * Check if a profile is configured in the in-memory Prisma client cache.
 */
export function isConfiguredProfile(code: string): boolean {
  if (!code || !PROFILE_REGEX.test(code) || FORBIDDEN_PROFILE_NAMES.has(code.toLowerCase())) return false;
  return configuredProfiles.has(code.toLowerCase());
}

/**
 * Get canonical profile metadata by code.
 */
export function getCanonicalProfile(code: string): CanonicalProfile | undefined {
  if (!code || !PROFILE_REGEX.test(code) || FORBIDDEN_PROFILE_NAMES.has(code.toLowerCase())) return undefined;
  return configuredProfiles.get(code.toLowerCase());
}

/**
 * Return all registered canonical profile codes from authoritative cache.
 */
export function getAllProfiles(): string[] {
  return Array.from(configuredProfiles.values()).map((p) => p.code);
}

// ── Prisma Client Factory ───────────────────────────────────────────────
async function configureSqlitePragmas(client: PrismaClient): Promise<void> {
  try {
    await client.$connect();
    await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await client.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await client.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
    await client.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch (err) {
    // If running in test with mocked client or in-memory DB, log and proceed
    console.warn('[Prisma] Note applying PRAGMAs:', (err as Error).message);
  }
}

function createPrismaClient(dbUrl: string): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });
  return client;
}

// ── System / Control Database Client ─────────────────────────────────────
// Dedicated client for system/tenant metadata, installation lifecycle, and user auth
const controlDbPath = getControlDbPath();
ensureProfileDbFile(controlDbPath);
const systemDbUrl = `file:${controlDbPath}`;
export const systemPrisma = createPrismaClient(systemDbUrl);
configureSqlitePragmas(systemPrisma).catch(() => {});

// ── Client Registry with Bounded Cache & Mutex ─────────────────────────
interface ClientRegistryEntry {
  client: PrismaClient;
  lastUsedAt: number;
  activeOps: number;
}

const clientRegistry = new Map<string, ClientRegistryEntry>();
const clientInitLocks = new Map<string, Promise<PrismaClient>>();

/**
 * Get or create a PrismaClient for an authorized canonical profile.
 * Thread-safe: uses promises to prevent racing client initializations.
 */
export async function getClientForProfileAsync(profileCode: string): Promise<PrismaClient> {
  if (!PROFILE_REGEX.test(profileCode)) {
    throw new Error(`Invalid profile format: ${profileCode}`);
  }

  const key = profileCode.toLowerCase();
  const canonical = configuredProfiles.get(key);
  if (!canonical) {
    throw new Error(`Profile "${profileCode}" is not a configured canonical profile.`);
  }

  // Check existing cached client
  const existing = clientRegistry.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  // Mutex lock for concurrent requests
  if (clientInitLocks.has(key)) {
    return clientInitLocks.get(key)!;
  }

  const initPromise = (async () => {
    try {
      // Evict LRU client if cache limit reached, but NEVER evict a client with active operations
      if (clientRegistry.size >= MAX_CLIENTS) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, entry] of clientRegistry.entries()) {
          if (entry.activeOps === 0 && entry.lastUsedAt < oldestTime) {
            oldestTime = entry.lastUsedAt;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          const evicted = clientRegistry.get(oldestKey);
          clientRegistry.delete(oldestKey);
          if (evicted) {
            evicted.client.$disconnect().catch(() => {});
          }
        }
      }

      // Ensure database file exists with complete schema
      if (!fs.existsSync(canonical.dbPath)) {
        throw new Error(`Database file for profile "${canonical.code}" is missing at "${canonical.dbPath}".`);
      }
      ensureProfileDbFile(canonical.dbPath);

      const client = createPrismaClient(`file:${canonical.dbPath}`);
      await configureSqlitePragmas(client);

      clientRegistry.set(key, { client, lastUsedAt: Date.now(), activeOps: 0 });
      return client;
    } finally {
      clientInitLocks.delete(key);
    }
  })();

  clientInitLocks.set(key, initPromise);
  return initPromise;
}

export function updateProfileDbPath(profileCode: string, newDbPath: string): void {
  const key = profileCode.toLowerCase();
  const canonical = configuredProfiles.get(key);
  if (canonical) {
    canonical.dbPath = newDbPath;
  }
  const entry = clientRegistry.get(key);
  if (entry) {
    clientRegistry.delete(key);
    entry.client.$disconnect().catch(() => {});
  }
}

export function getClientForProfile(profileCode: string): PrismaClient {
  const key = profileCode.toLowerCase();
  const existing = clientRegistry.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  // Phase 8: Do NOT implicitly create/register profile.
  const canonical = configuredProfiles.get(key);
  if (!canonical) {
    throw new Error(
      `Profile "${profileCode}" is not configured or registered. Explicit setup/registration is required before accessing database client.`
    );
  }

  if (!fs.existsSync(canonical.dbPath)) {
    throw new Error(`Database file for profile "${profileCode}" is missing at "${canonical.dbPath}".`);
  }

  const client = createPrismaClient(`file:${canonical.dbPath}`);
  configureSqlitePragmas(client).catch(() => {});
  clientRegistry.set(key, { client, lastUsedAt: Date.now(), activeOps: 0 });
  return client;
}

/**
 * Disconnect all open clients and cleanly shutdown database connections.
 */
export async function disconnectAllClients(): Promise<void> {
  const disconnectPromises: Promise<unknown>[] = [];

  for (const entry of clientRegistry.values()) {
    disconnectPromises.push(entry.client.$disconnect().catch(() => {}));
  }
  clientRegistry.clear();

  disconnectPromises.push(systemPrisma.$disconnect().catch(() => {}));

  await Promise.allSettled(disconnectPromises);
}

export const closeAllDynamicClients = disconnectAllClients;

// ── Public API ──────────────────────────────────────────────────────────
export function runWithProfile<T>(profileCode: string, fn: () => T | Promise<T>): Promise<T> {
  return requestContext.run({ profileId: profileCode, profileCode }, async () => {
    return await fn();
  });
}

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
export function getActiveProfile(): string {
  const store = requestContext.getStore();
  const profile = store?.profileCode || store?.profileId;
  if (!profile) {
    throw new Error(
      'No active profile context. Business operations require an explicit profile scope. ' +
      'Ensure the request passes through profileMiddleware with a valid X-Profile-Id header.'
    );
  }
  return profile;
}

/**
 * Get the active profile or fall back to the default.
 * Use ONLY for operations that genuinely do not require tenant scoping
 * (e.g., system health checks, profile listing).
 */
export function getActiveProfileOrDefault(): string {
  const store = requestContext.getStore();
  const explicit = store?.profileCode || store?.profileId;
  if (explicit) return explicit;
  if (defaultProfile) return defaultProfile;
  const cfg = readConfig();
  if (cfg.activeProfile) return cfg.activeProfile;
  const all = getAllProfiles();
  if (all.length > 0) return all[0];
  return '';
}

// ── Proxy ───────────────────────────────────────────────────────────────
// All business modules import `prisma` (the default export). This proxy forwards
// every property/method access to whichever PrismaClient is active for the current request context.
// 
// NOTE: The proxy uses getActiveProfileOrDefault() because it may be accessed
// during startup or in contexts where AsyncLocalStorage hasn't been established.
// Business services that need strict tenant isolation should call
// getActiveProfile() directly to ensure a profile context exists.
const prismaProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const profileId = getActiveProfileOrDefault();
    if (!profileId) {
      if (prop === '$connect' || prop === '$disconnect') {
        return async () => {};
      }
      throw new Error(
        'Profile "" is not configured or registered. Explicit setup/registration is required before accessing database client.'
      );
    }
    const activeClient = getClientForProfile(profileId);

    const value = (activeClient as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
});

export default prismaProxy;
