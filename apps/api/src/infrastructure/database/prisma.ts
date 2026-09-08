import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// ── Profile Config Persistence ──────────────────────────────────────────
// We persist the active profile name to a JSON file so it survives server restarts.
const DB_DIR = path.resolve(__dirname, '../../../'); // backend root where dev.db lives
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
    // Corrupted config file, fall back to default
  }
  if (fs.existsSync(path.resolve(DB_DIR, 'Stavan.db'))) {
    return { activeProfile: 'Stavan' };
  }
  return { activeProfile: 'Default' };
}

function writeConfig(cfg: ProfileConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
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

function ensureDatabaseExists(profileName: string): void {
  const dbPath = getDbPathForProfile(profileName);
  if (!fs.existsSync(dbPath)) {
    console.log(`[Profile] Initializing fresh database for profile: ${profileName} at ${dbPath}`);
    try {
      const schemaPath = path.resolve(DB_DIR, 'prisma', 'schema.prisma');
      const env = { ...process.env, DATABASE_URL: getDbUrlForProfile(profileName) };
      execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
        env,
        stdio: 'inherit',
        cwd: DB_DIR,
      });
    } catch (err) {
      console.error('[Profile] Failed to create database:', err);
    }
  }
}

// ── State ───────────────────────────────────────────────────────────────
const config = readConfig();
let currentProfile = config.activeProfile;
ensureDatabaseExists(currentProfile);
let activeClient = createClientForProfile(currentProfile);

// ── Public API ──────────────────────────────────────────────────────────
export function getActiveProfile(): string {
  return currentProfile;
}

export function getAllProfiles(): string[] {
  try {
    const files = fs.readdirSync(DB_DIR);
    const dbs = files
      .filter(f => f.endsWith('.db') && !f.includes('journal') && !f.includes('test'))
      .map(f => f.replace('.db', ''));
    return dbs.length > 0 ? dbs : [currentProfile || 'Default'];
  } catch {
    return [currentProfile || 'Default'];
  }
}

export async function switchProfile(profileName: string): Promise<void> {
  // Sanitize profile name: only allow alphanumeric, hyphens, underscores
  const sanitized = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitized) return;

  if (currentProfile === sanitized) return;

  // Disconnect old client
  try {
    await activeClient.$disconnect();
  } catch {
    // Ignore disconnect errors
  }

  currentProfile = sanitized;
  writeConfig({ activeProfile: sanitized });

  ensureDatabaseExists(sanitized);

  activeClient = createClientForProfile(sanitized);
  console.log(`[Profile] Switched to profile: ${sanitized} (${getDbPathForProfile(sanitized)})`);
}

// ── Proxy ───────────────────────────────────────────────────────────────
// All modules import `prisma` (the default export). This proxy forwards
// every property/method access to whichever PrismaClient is currently active.
const prismaProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = (activeClient as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
});

export default prismaProxy;

