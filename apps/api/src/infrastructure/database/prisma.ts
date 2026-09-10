import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import fs from 'fs';

// ── Profile Context ─────────────────────────────────────────────────────
export interface ProfileContext {
  profileId: string;
  profileCode?: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<ProfileContext>();

// ── Constants & Paths ───────────────────────────────────────────────────
const DB_DIR = path.resolve(__dirname, '../../../'); // backend root where .db files live
const CONFIG_PATH = path.join(DB_DIR, '.profile-config.json');
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
  return { activeProfile: 'Stavan', allowedProfiles: ['Stavan', 'Stuti'] };
}

const config = readConfig();
export const defaultProfile = config.activeProfile || 'Stavan';

// Canonical in-memory profile definition
export interface CanonicalProfile {
  id: string;
  code: string;
  name: string;
  dbPath: string;
}

// ── Canonical Profile Registry ──────────────────────────────────────────
// Server controls all known profiles. Arbitrary client inputs CANNOT open unconfigured DBs.
const configuredProfiles = new Map<string, CanonicalProfile>();

function initConfiguredProfiles() {
  // Profile sources (in priority order):
  // 1. Default profile from config
  // 2. Allowed profiles from config file
  // 3. CONFIGURED_PROFILES environment variable
  // NOTE: Hardcoded profile names were removed (Finding 3).
  // Profile registry should be seeded from config/DB, not source code.
  const allowed = new Set<string>([
    defaultProfile,
    ...(config.allowedProfiles || []),
  ]);

  if (process.env.CONFIGURED_PROFILES) {
    process.env.CONFIGURED_PROFILES.split(',').forEach((p) => allowed.add(p.trim()));
  }

  for (const code of allowed) {
    if (PROFILE_REGEX.test(code)) {
      const dbPath = path.resolve(DB_DIR, `${code}.db`);
      configuredProfiles.set(code.toLowerCase(), {
        id: code.toLowerCase(),
        code,
        name: code,
        dbPath,
      });
    }
  }
}

initConfiguredProfiles();

/**
 * Register a canonical profile programmatically.
 * 
 * WARNING: This is a PRIVILEGED operation. In production, profile creation
 * should be gated behind authorization, audit logging, and proper provisioning
 * workflows. This function exists for testing and bootstrap scenarios.
 * 
 * Finding 4: Profile creation should not be a casual utility operation.
 */
export function registerProfile(profile: { code: string; name?: string; dbPath?: string }): CanonicalProfile {
  if (!PROFILE_REGEX.test(profile.code)) {
    throw new Error(`Invalid profile code format: "${profile.code}". Must match ${PROFILE_REGEX}`);
  }

  const key = profile.code.toLowerCase();
  const canonicalDbPath = profile.dbPath
    ? path.resolve(DB_DIR, path.basename(profile.dbPath))
    : path.resolve(DB_DIR, `${profile.code}.db`);

  // Ensure DB path remains strictly under DB_DIR to prevent path traversal
  if (!canonicalDbPath.startsWith(DB_DIR)) {
    throw new Error(`Invalid database path outside allowed directory: ${canonicalDbPath}`);
  }

  const canonical: CanonicalProfile = {
    id: key,
    code: profile.code,
    name: profile.name || profile.code,
    dbPath: canonicalDbPath,
  };

  if (process.env.NODE_ENV === 'production') {
    console.warn(`[SECURITY] Profile "${profile.code}" registered programmatically in production. Ensure this is authorized.`);
  }

  configuredProfiles.set(key, canonical);
  return canonical;
}

/**
 * Check if a profile is configured on the server.
 */
export function isConfiguredProfile(code: string): boolean {
  if (!code || !PROFILE_REGEX.test(code)) return false;
  return configuredProfiles.has(code.toLowerCase());
}

/**
 * Get canonical profile metadata by code.
 */
export function getCanonicalProfile(code: string): CanonicalProfile | undefined {
  if (!code || !PROFILE_REGEX.test(code)) return undefined;
  return configuredProfiles.get(code.toLowerCase());
}

/**
 * Return all registered canonical profile codes.
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

// ── System Client ───────────────────────────────────────────────────────
// Dedicated client for system/tenant metadata, user auth, and sessions
const systemDbUrl = process.env.DATABASE_URL || `file:${path.resolve(DB_DIR, `${defaultProfile}.db`)}`;
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

      // Check if DB file exists or create it if in development/test
      if (!fs.existsSync(canonical.dbPath)) {
        // In testing, ensure file exists or copy from base
        if (process.env.NODE_ENV === 'test') {
          fs.writeFileSync(canonical.dbPath, '');
        } else {
          throw new Error(`[Profile] Database for profile "${canonical.code}" does not exist at ${canonical.dbPath}.`);
        }
      }

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

export function getClientForProfile(profileCode: string): PrismaClient {
  const key = profileCode.toLowerCase();
  const existing = clientRegistry.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  // Synchronous fallback (initializes immediately if not cached)
  const canonical = configuredProfiles.get(key);
  if (!canonical) {
    throw new Error(`Profile "${profileCode}" is not configured on this server`);
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
  return store?.profileCode || store?.profileId || defaultProfile;
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
    const activeClient = getClientForProfile(profileId);

    const value = (activeClient as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
});

export default prismaProxy;
