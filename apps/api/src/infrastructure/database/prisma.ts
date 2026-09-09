import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import fs from 'fs';

// ── Profile Context ─────────────────────────────────────────────────────
export interface ProfileContext {
  profileId: string;
}

export const requestContext = new AsyncLocalStorage<ProfileContext>();

// ── Profile Config Persistence ──────────────────────────────────────────
// We persist a default fallback profile name.
const DB_DIR = path.resolve(__dirname, '../../../'); // backend root where .db files live
const CONFIG_PATH = path.join(DB_DIR, '.profile-config.json');

interface ProfileConfig {
  activeProfile: string;
}

function readConfig(): ProfileConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Ignore read errors
  }
  return { activeProfile: 'Stavan' };
}

// ── Helpers ─────────────────────────────────────────────────────────────
function getDbPathForProfile(profileName: string): string {
  return path.resolve(DB_DIR, `${profileName}.db`);
}

function getDbUrlForProfile(profileName: string): string {
  // Must be an absolute file: URL so Prisma's engine resolves it correctly
  return `file:${getDbPathForProfile(profileName)}`;
}

function createClientForProfile(profileName: string): PrismaClient {
  const dbPath = getDbPathForProfile(profileName);
  
  if (!fs.existsSync(dbPath)) {
    throw new Error(`[Profile] Database for profile "${profileName}" does not exist at ${dbPath}.`);
  }

  const client = new PrismaClient({
    datasources: {
      db: {
        url: getDbUrlForProfile(profileName),
      },
    },
  });

  // Optimize SQLite: Enable WAL mode, normal synchronous, and busy timeout to prevent lock delays
  client.$connect().then(() => {
    client.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => null);
    client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => null);
    client.$executeRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => null);
  }).catch(() => null);

  return client;
}

// ── State ───────────────────────────────────────────────────────────────
const config = readConfig();
const defaultProfile = config.activeProfile || 'Stavan';
const clientRegistry = new Map<string, PrismaClient>();

function getClientForProfile(profileName: string): PrismaClient {
  const sanitized = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitized) throw new Error('Invalid profile name');

  if (!clientRegistry.has(sanitized)) {
    clientRegistry.set(sanitized, createClientForProfile(sanitized));
  }
  return clientRegistry.get(sanitized)!;
}

// ── Public API ──────────────────────────────────────────────────────────
export function getActiveProfile(): string {
  const store = requestContext.getStore();
  return store?.profileId || defaultProfile;
}

export function getAllProfiles(): string[] {
  try {
    const files = fs.readdirSync(DB_DIR);
    return files
      .filter(f => f.endsWith('.db') && !f.includes('journal'))
      .map(f => f.replace('.db', ''));
  } catch {
    return [defaultProfile];
  }
}

// ── Proxy ───────────────────────────────────────────────────────────────
// All modules import `prisma` (the default export). This proxy forwards
// every property/method access to whichever PrismaClient is currently active
// for the request context.
const prismaProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const store = requestContext.getStore();
    const profileId = store?.profileId || defaultProfile;
    const activeClient = getClientForProfile(profileId);

    const value = (activeClient as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
});

export default prismaProxy;
