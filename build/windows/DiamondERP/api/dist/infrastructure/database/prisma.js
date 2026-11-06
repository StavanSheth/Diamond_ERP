"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAllDynamicClients = exports.systemPrisma = exports.registerProfile = exports.FORBIDDEN_PROFILE_NAMES = exports.defaultProfile = exports.requestContext = void 0;
exports.saveConfig = saveConfig;
exports.ensureProfileDbFile = ensureProfileDbFile;
exports.registerProfileInCache = registerProfileInCache;
exports.removeConfiguredProfile = removeConfiguredProfile;
exports.isConfiguredProfile = isConfiguredProfile;
exports.getCanonicalProfile = getCanonicalProfile;
exports.getAllProfiles = getAllProfiles;
exports.getClientForProfileAsync = getClientForProfileAsync;
exports.updateProfileDbPath = updateProfileDbPath;
exports.getClientForProfile = getClientForProfile;
exports.disconnectAllClients = disconnectAllClients;
exports.runWithProfile = runWithProfile;
exports.getActiveProfile = getActiveProfile;
exports.getActiveProfileOrDefault = getActiveProfileOrDefault;
const client_1 = require("@prisma/client");
const async_hooks_1 = require("async_hooks");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const paths_1 = require("../paths");
exports.requestContext = new async_hooks_1.AsyncLocalStorage();
// ── Constants & Paths ───────────────────────────────────────────────────
const CONFIG_PATH = path_1.default.join((0, paths_1.getConfigDir)(), '.profile-config.json');
const MAX_CLIENTS = 10;
const PROFILE_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
function readConfig() {
    try {
        if (fs_1.default.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs_1.default.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    }
    catch {
        // Ignore read errors, fall back to default
    }
    // Fresh install default: do NOT default to hardcoded profile
    const fallback = process.env.DEFAULT_PROFILE || '';
    return { activeProfile: fallback, allowedProfiles: fallback ? [fallback] : [] };
}
function saveConfig(cfg) {
    try {
        const configDir = path_1.default.dirname(CONFIG_PATH);
        if (!fs_1.default.existsSync(configDir)) {
            fs_1.default.mkdirSync(configDir, { recursive: true });
        }
        fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    }
    catch (err) {
        console.warn('[Prisma] Could not persist profile config:', err);
    }
}
function ensureProfileDbFile(dbPath) {
    if (!fs_1.default.existsSync(dbPath)) {
        const targetDir = path_1.default.dirname(dbPath);
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb && fs_1.default.existsSync(templateDb)) {
            // Copy the schema-only template (no data rows)
            fs_1.default.copyFileSync(templateDb, dbPath);
        }
        else {
            // Fail closed: Never create an empty 0-byte SQLite database file
            throw new Error(`Database template file (template.db) is missing or unavailable. Cannot provision database without immutable template.`);
        }
    }
}
const config = readConfig();
exports.defaultProfile = config.activeProfile || process.env.DEFAULT_PROFILE || '';
// ── Canonical Profile Registry Cache ─────────────────────────────────────
// Cache of registered profiles, maintained strictly by DatabaseContextService / system.db.
// Invariant: Prisma.ts MUST NOT independently infer or guess DB paths.
const configuredProfiles = new Map();
exports.FORBIDDEN_PROFILE_NAMES = new Set(['system', 'template', 'test']);
/**
 * Register a canonical profile in the in-memory Prisma client cache.
 * Must be called by DatabaseContextService / DatabaseRegistry after validation.
 */
function registerProfileInCache(profile) {
    if (!PROFILE_REGEX.test(profile.code)) {
        throw new Error(`Invalid profile code format: "${profile.code}". Must match ${PROFILE_REGEX}`);
    }
    if (exports.FORBIDDEN_PROFILE_NAMES.has(profile.code.toLowerCase())) {
        throw new Error(`Reserved database profile name cannot be registered as a business profile: "${profile.code}"`);
    }
    const key = profile.code.toLowerCase();
    const canonicalDbPath = path_1.default.resolve(profile.dbPath);
    if (!fs_1.default.existsSync(canonicalDbPath)) {
        throw new Error(`Database file does not exist at "${canonicalDbPath}". Database provisioning must be completed before profile registration.`);
    }
    const canonical = {
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
        existing.client.$disconnect().catch(() => { });
    }
    return canonical;
}
exports.registerProfile = registerProfileInCache;
function initConfiguredProfiles() {
    configuredProfiles.clear();
    // Phase 1 Hardening: Load profile codes from .profile-config.json cache.
    // DB paths are NOT inferred here — they are registered only via registerProfileInCache()
    // which is called by DatabaseContextService.syncProfilesFromSystemDb() on startup.
    // ponytail: disk scan removed; system.db is the sole authority for DB paths.
}
initConfiguredProfiles();
function removeConfiguredProfile(profileCode) {
    const key = profileCode.toLowerCase();
    configuredProfiles.delete(key);
    const entry = clientRegistry.get(key);
    if (entry) {
        clientRegistry.delete(key);
        entry.client.$disconnect().catch(() => { });
    }
    const currentCfg = readConfig();
    const allowed = (currentCfg.allowedProfiles || []).filter(p => p.toLowerCase() !== key);
    saveConfig({
        activeProfile: currentCfg.activeProfile.toLowerCase() === key ? exports.defaultProfile : currentCfg.activeProfile,
        allowedProfiles: allowed.length > 0 ? allowed : [exports.defaultProfile],
    });
}
// End profile cache management
/**
 * Check if a profile is configured in the in-memory Prisma client cache.
 */
function isConfiguredProfile(code) {
    if (!code || !PROFILE_REGEX.test(code) || exports.FORBIDDEN_PROFILE_NAMES.has(code.toLowerCase()))
        return false;
    return configuredProfiles.has(code.toLowerCase());
}
/**
 * Get canonical profile metadata by code.
 */
function getCanonicalProfile(code) {
    if (!code || !PROFILE_REGEX.test(code) || exports.FORBIDDEN_PROFILE_NAMES.has(code.toLowerCase()))
        return undefined;
    return configuredProfiles.get(code.toLowerCase());
}
/**
 * Return all registered canonical profile codes from authoritative cache.
 */
function getAllProfiles() {
    return Array.from(configuredProfiles.values()).map((p) => p.code);
}
// ── Prisma Client Factory ───────────────────────────────────────────────
async function configureSqlitePragmas(client) {
    try {
        await client.$connect();
        await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await client.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
        await client.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
        await client.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
    }
    catch (err) {
        // If running in test with mocked client or in-memory DB, log and proceed
        console.warn('[Prisma] Note applying PRAGMAs:', err.message);
    }
}
function createPrismaClient(dbUrl) {
    const client = new client_1.PrismaClient({
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
const controlDbPath = (0, paths_1.getControlDbPath)();
ensureProfileDbFile(controlDbPath);
const systemDbUrl = `file:${controlDbPath}`;
exports.systemPrisma = createPrismaClient(systemDbUrl);
configureSqlitePragmas(exports.systemPrisma).catch(() => { });
const clientRegistry = new Map();
const clientInitLocks = new Map();
/**
 * Get or create a PrismaClient for an authorized canonical profile.
 * Thread-safe: uses promises to prevent racing client initializations.
 */
async function getClientForProfileAsync(profileCode) {
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
        return clientInitLocks.get(key);
    }
    const initPromise = (async () => {
        try {
            // Evict LRU client if cache limit reached, but NEVER evict a client with active operations
            if (clientRegistry.size >= MAX_CLIENTS) {
                let oldestKey = null;
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
                        evicted.client.$disconnect().catch(() => { });
                    }
                }
            }
            // Ensure database file exists with complete schema
            if (!fs_1.default.existsSync(canonical.dbPath)) {
                throw new Error(`Database file for profile "${canonical.code}" is missing at "${canonical.dbPath}".`);
            }
            ensureProfileDbFile(canonical.dbPath);
            const client = createPrismaClient(`file:${canonical.dbPath}`);
            await configureSqlitePragmas(client);
            clientRegistry.set(key, { client, lastUsedAt: Date.now(), activeOps: 0 });
            return client;
        }
        finally {
            clientInitLocks.delete(key);
        }
    })();
    clientInitLocks.set(key, initPromise);
    return initPromise;
}
function updateProfileDbPath(profileCode, newDbPath) {
    const key = profileCode.toLowerCase();
    const canonical = configuredProfiles.get(key);
    if (canonical) {
        canonical.dbPath = newDbPath;
    }
    const entry = clientRegistry.get(key);
    if (entry) {
        clientRegistry.delete(key);
        entry.client.$disconnect().catch(() => { });
    }
}
function getClientForProfile(profileCode) {
    const key = profileCode.toLowerCase();
    const existing = clientRegistry.get(key);
    if (existing) {
        existing.lastUsedAt = Date.now();
        return existing.client;
    }
    // Phase 8: Do NOT implicitly create/register profile.
    const canonical = configuredProfiles.get(key);
    if (!canonical) {
        throw new Error(`Profile "${profileCode}" is not configured or registered. Explicit setup/registration is required before accessing database client.`);
    }
    if (!fs_1.default.existsSync(canonical.dbPath)) {
        throw new Error(`Database file for profile "${profileCode}" is missing at "${canonical.dbPath}".`);
    }
    const client = createPrismaClient(`file:${canonical.dbPath}`);
    configureSqlitePragmas(client).catch(() => { });
    clientRegistry.set(key, { client, lastUsedAt: Date.now(), activeOps: 0 });
    return client;
}
/**
 * Disconnect all open clients and cleanly shutdown database connections.
 */
async function disconnectAllClients() {
    const disconnectPromises = [];
    for (const entry of clientRegistry.values()) {
        disconnectPromises.push(entry.client.$disconnect().catch(() => { }));
    }
    clientRegistry.clear();
    disconnectPromises.push(exports.systemPrisma.$disconnect().catch(() => { }));
    await Promise.allSettled(disconnectPromises);
}
exports.closeAllDynamicClients = disconnectAllClients;
// ── Public API ──────────────────────────────────────────────────────────
function runWithProfile(profileCode, fn) {
    return exports.requestContext.run({ profileId: profileCode, profileCode }, async () => {
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
function getActiveProfile() {
    const store = exports.requestContext.getStore();
    const profile = store?.profileCode || store?.profileId;
    if (!profile) {
        throw new Error('No active profile context. Business operations require an explicit profile scope. ' +
            'Ensure the request passes through profileMiddleware with a valid X-Profile-Id header.');
    }
    return profile;
}
/**
 * Get the active profile or fall back to the default.
 * Use ONLY for operations that genuinely do not require tenant scoping
 * (e.g., system health checks, profile listing).
 */
function getActiveProfileOrDefault() {
    const store = exports.requestContext.getStore();
    const explicit = store?.profileCode || store?.profileId;
    if (explicit)
        return explicit;
    if (exports.defaultProfile)
        return exports.defaultProfile;
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
const prismaProxy = new Proxy({}, {
    get(_target, prop) {
        const profileId = getActiveProfileOrDefault();
        if (!profileId) {
            if (prop === '$connect' || prop === '$disconnect') {
                return async () => { };
            }
            throw new Error('Profile "" is not configured or registered. Explicit setup/registration is required before accessing database client.');
        }
        const activeClient = getClientForProfile(profileId);
        const value = activeClient[prop];
        if (typeof value === 'function') {
            return value.bind(activeClient);
        }
        return value;
    },
});
exports.default = prismaProxy;
//# sourceMappingURL=prisma.js.map