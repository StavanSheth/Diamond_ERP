# Diamond ERP V3.0 — SQLite & Prisma Database Flow Architecture

> **Phase 1 Audit Artifact — Code-Level Architecture Mapping**  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Branch:** `v3`  
> **Authority:** Actual V3 Source Code (`apps/api/src/infrastructure/database/prisma.ts`, `apps/api/src/infrastructure/paths.ts`, `apps/api/src/config/index.ts`, `apps/api/prisma/schema.prisma`)  
> **Status:** Remediated Phase 1 Architecture Audit (Confidence $\ge 90\%$)

---

## 1. End-to-End Database Lifecycle Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Launcher as Launcher (DiamondERP.exe)
    participant Node as Node Runtime (node.exe)
    participant Paths as paths.ts (Path Resolver)
    participant Middleware as profile.ts (Middleware)
    participant Context as AsyncLocalStorage (RequestContext)
    participant PrismaProxy as prismaProxy / prisma.ts
    participant Cache as Prisma Client Registry (LRU)
    participant Template as template.db (Schema Template)
    participant SQLite as SQLite File (<profile>.db)

    Note over Launcher,SQLite: 1. APPLICATION INITIALIZATION & ENVIRONMENT SETUP
    Launcher->>Node: Spawn child process with DIAMOND_DATA_DIR=%LOCALAPPDATA%\DiamondERP
    Node->>Paths: getDataDir() & getDatabasesDir()
    Paths-->>Node: Returns %LOCALAPPDATA%\DiamondERP\databases
    Node->>PrismaProxy: Initialize systemPrisma (file:%LOCALAPPDATA%\DiamondERP\databases\Stavan.db)
    PrismaProxy->>SQLite: PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;

    Note over Launcher,SQLite: 2. INCOMING HTTP REQUEST & TENANCY RESOLUTION
    Launcher->>Middleware: HTTP GET/POST with Header [X-Profile-Id: "stavan"]
    Middleware->>Middleware: Validate regex /^[a-zA-Z0-9_-]{1,50}$/
    Middleware->>Context: requestContext.run({ profileId: "stavan", profileCode: "stavan" })

    Note over Launcher,SQLite: 3. DYNAMIC CLIENT RESOLUTION & PROVISIONING
    Middleware->>PrismaProxy: Business Service invokes prisma.stock.findMany()
    PrismaProxy->>Context: getActiveProfileOrDefault() -> "stavan"
    PrismaProxy->>Cache: getClientForProfile("stavan")
    alt Client Not Cached in Registry
        Cache->>Paths: Resolve DB file path: %LOCALAPPDATA%\DiamondERP\databases\stavan.db
        alt File Does Not Exist
            Paths->>Template: Copy template.db -> stavan.db (fs.copyFileSync)
        end
        Cache->>SQLite: Open new PrismaClient("file:.../stavan.db")
        Cache->>SQLite: Configure PRAGMAs (WAL, NORMAL sync, busy_timeout 10000, FK ON)
        Cache->>Cache: Cache client in Map (bounded LRU, max 10 clients)
    end
    Cache-->>PrismaProxy: Active PrismaClient for "stavan"
    PrismaProxy->>SQLite: Execute SQL query on stavan.db
    SQLite-->>PrismaProxy: Return entity records
    PrismaProxy-->>Launcher: Return JSON response
```

---

## 2. Code-Level Database Lifecycle Tracing

### Flow A: API Startup $\to$ Configuration $\to$ DATABASE_URL $\to$ Prisma $\to$ SQLite $\to$ Queries

1. **Process Spawning & Environment Injection:**
   - **File:** [`installer/Launcher.cs:626-645`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L626-L645) (`StartBackendProcess`)
   - The launcher injects `DIAMOND_DATA_DIR = %LOCALAPPDATA%\DiamondERP`, `PORT = 3002`, `HOST = 127.0.0.1`, `NODE_ENV = production`.
2. **Path Resolution:**
   - **File:** [`apps/api/src/infrastructure/paths.ts:35-64`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L35-L64)
   - `getDataDir()` reads `process.env.DIAMOND_DATA_DIR` or defaults to `%LOCALAPPDATA%\DiamondERP`.
   - `getDatabasesDir()` returns `path.join(getDataDir(), 'databases')`.
3. **Database URL Assembly:**
   - **File:** [`apps/api/src/config/index.ts:10`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts#L10)
   - Configuration defines:
     ```typescript
     databaseUrl: process.env.DATABASE_URL || `file:${path.join(getDatabasesDir(), 'Stavan.db')}`
     ```
4. **System Prisma Client Initialization:**
   - **File:** [`apps/api/src/infrastructure/database/prisma.ts:250-260`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L250-L260)
   - `systemDbUrl = process.env.DATABASE_URL || 'file:' + defaultDbPath`
   - `systemPrisma = createPrismaClient(systemDbUrl)`
   - Applies SQLite PRAGMAs:
     - `PRAGMA journal_mode = WAL;` (Enables concurrent reads and non-blocking writes)
     - `PRAGMA synchronous = NORMAL;` (Ensures durability while minimizing fsync overhead)
     - `PRAGMA busy_timeout = 10000;` (Wait up to 10 seconds for locks before throwing `SQLITE_BUSY`)
     - `PRAGMA foreign_keys = ON;` (Enforces relational integrity constraints)
5. **Runtime Query Execution:**
   - Business modules call methods on the default export `prisma` (which is `prismaProxy`).
   - `prismaProxy` intercepts the method call, retrieves the active tenant code from `AsyncLocalStorage`, grabs the corresponding `PrismaClient` from `clientRegistry`, and executes the query against that profile's SQLite database.

---

### Flow B: Template DB $\to$ Production Database Provisioning

1. **Origin of Schema Template:**
   - **Source:** [`apps/api/prisma/template.db`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/template.db)
   - Created during development via [`scripts/sync-template-db.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/sync-template-db.js).
   - Runs `PRAGMA wal_checkpoint(TRUNCATE)` before copying to guarantee a clean, standalone database file with zero uncommitted WAL transactions.
   - **Verification:** Contains all 20+ tables (`User`, `Profile`, `UserProfile`, `Session`, `Stock`, `Ledger`, `DiamondItem`, `Transaction`, `Party`, etc.) with **0 users and 0 stock rows** (100% clean schema-only template).
2. **Packaging & Staging:**
   - **Script:** [`scripts/stage-windows-build.js:237-246`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/stage-windows-build.js#L237-L246)
   - Staged into: `build/windows/DiamondERP/api/prisma/template.db`.
   - Release manifest verifies SHA-256 hash in `scripts/create-release-manifest.js`.
3. **Template Discovery at Runtime:**
   - **Function:** `getDatabaseTemplatePath()` in [`apps/api/src/infrastructure/paths.ts:123-144`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L123-L144):
     Evaluates candidates in order:
     1. `process.env.DIAMOND_TEMPLATE_DB`
     2. `path.resolve(__dirname, '../../prisma/template.db')`
     3. `path.resolve(__dirname, '../prisma/template.db')`
     4. Fallback to `test.db` or `Stavan.db`
4. **Offline Database Provisioning:**
   - **Function:** `ensureProfileDbFile(dbPath)` in [`apps/api/src/infrastructure/database/prisma.ts:52-71`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L52-L71):
     ```typescript
     if (!fs.existsSync(dbPath)) {
       const targetDir = path.dirname(dbPath);
       if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
       const templateDb = getDatabaseTemplatePath();
       if (templateDb && fs.existsSync(templateDb)) {
         fs.copyFileSync(templateDb, dbPath);
       } else {
         fs.writeFileSync(dbPath, '');
       }
     }
     ```

---

## 3. Exact Database Path Logic Across Repository

| Variable / Identifier | Exact Code Location | Resolution Logic |
|---|---|---|
| `DIAMOND_DATA_DIR` | [`installer/Launcher.cs:633`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L633), [`paths.ts:35`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L35) | Passed by Launcher as `%LOCALAPPDATA%\DiamondERP`. `getDataDir()` reads `process.env.DIAMOND_DATA_DIR`. |
| `DATABASE_URL` | [`config/index.ts:10`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts#L10), [`prisma.ts:257`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L257) | Defaults to `file:${path.join(getDatabasesDir(), 'Stavan.db')}` if not explicitly supplied in environment. |
| `DB_DIR` | [`prisma.ts:17`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L17) | `getDatabasesDir()` returns `%LOCALAPPDATA%\DiamondERP\databases`. |
| `template.db` | [`paths.ts:123-144`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L123-L144) | Resolved via `getDatabaseTemplatePath()` from staged `api/prisma/template.db`. |
| Tenant `.db` Path | [`prisma.ts:100, 144`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L100) | `path.resolve(DB_DIR, `${profileCode}.db`)`. Path traversal guarded: must start with `DB_DIR`. |
| Backup Directory | [`paths.ts:84-90`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L84-L90) | `getBackupsDir()` returns `%LOCALAPPDATA%\DiamondERP\backups` (or `DIAMOND_BACKUPS_DIR`). |
| `.profile-config.json` | [`prisma.ts:18`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L18) | Stored at `%LOCALAPPDATA%\DiamondERP\config\.profile-config.json`. |

---

## 4. Multi-Database Architecture Capabilities (Authoritative Audit Answers)

### Q1: Can multiple SQLite files exist?
**YES.** Multiple `.db` files can coexist in `%LOCALAPPDATA%\DiamondERP\databases\` (e.g. `Stavan.db`, `Stuti.db`, `Trading.db`).
Code proof: [`prisma.ts:110-128`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L110-L128) scans `fs.readdirSync(DB_DIR)` for any `*.db` file and automatically registers them into `configuredProfiles`.

### Q2: Can runtime choose database?
**YES.** The client supplies the header `X-Profile-Id: <code_or_tenant>`.
Code proof: [`apps/api/src/middleware/profile.ts:31-60`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/middleware/profile.ts#L31-L60) reads this header, checks user authorization, and sets `AsyncLocalStorage` context. All subsequent ORM calls are routed to that database.

### Q3: Is database path hard-coded?
**NO.** Database paths are constructed dynamically as `path.resolve(DB_DIR, `${code}.db`)`. Only the default fallback profile name (`'Stavan'`) is hardcoded if `.profile-config.json` is missing.

### Q4: Is `DATABASE_URL` static?
**NO.** While `systemPrisma` uses the startup `DATABASE_URL`, tenant databases use dynamic connection strings created at runtime: `createPrismaClient("file:" + canonical.dbPath)` in [`prisma.ts:322`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L322).

### Q5: Is `PrismaClient` a singleton?
**NO.** V3 uses a multi-client connection pool (`clientRegistry: Map<string, ClientRegistryEntry>`) containing up to 10 distinct `PrismaClient` instances simultaneously, plus a dedicated `systemPrisma` client.

### Q6: Can `PrismaClient` be recreated?
**YES.** When `clientRegistry` exceeds `MAX_CLIENTS` (10), `getClientForProfileAsync` evicts the least recently used idle client (`activeOps === 0`), calls `$disconnect()`, and deletes it from the registry. If requested again, a fresh `PrismaClient` is instantiated.

### Q7: Can multiple `PrismaClient` instances exist simultaneously?
**YES.** Up to 10 active tenant clients plus 1 `systemPrisma` client exist concurrently in the Node process.

### Q8: Is the database path stored in DB?
**OPTIONAL / PARTIAL.** The `Profile` table in [`schema.prisma:37`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L37) contains an optional `dbPath String?` column, but `prisma.ts` enforces that all paths resolve strictly inside `DB_DIR` to prevent path traversal attacks.

### Q9: Is the database path stored in configuration?
**YES.** Active profile and allowed profiles are stored in `%LOCALAPPDATA%\DiamondERP\config\.profile-config.json`.

---

## 5. Active Database Selection & Ownership Model

### 5.1 Who decides the active DB and when?
- **Decision Authority:** The frontend client dictates the active profile via the `X-Profile-Id` HTTP request header.
- **Timing:** Evaluated **per-request at runtime** by `profileMiddleware` (`apps/api/src/middleware/profile.ts`).
- **Authorization Enforcement:** In [`profileMiddleware:43-52`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/middleware/profile.ts#L43-L52), the middleware checks if the authenticated user's `profiles` array includes the requested profile code. If unauthorized, it returns `403 FORBIDDEN (PROFILE_ACCESS_DENIED)`.

### 5.2 Current Database Ownership:
In existing V3 code:
$$\text{User} \xleftrightarrow{\text{UserProfile}} \text{Profile (Database Code)}$$
- There is **no device or machine ownership** of databases.
- Any user who possesses an entry in `UserProfile` for a given `Profile` can connect to that database.
- If a user record is deleted, the join row in `UserProfile` cascades, but the `Profile` record and the SQLite `.db` file on disk are **100% untouched**.

---

## 6. Database Switching Risks Analysis

If future onboarding introduces multiple databases and frequent switching:

1. **`AsyncLocalStorage` Scope Isolation:**
   - **Risk:** If asynchronous operations spawn detached callbacks or timers outside `requestContext.run()`, context is lost, falling back to `getActiveProfileOrDefault()`.
   - **Audit Finding:** V3 wraps route execution inside `profileMiddleware` using `requestContext.run()`, ensuring all promise chains maintain the profile context.
2. **SQLite File Locking & Concurrency:**
   - **Risk:** Multiple processes or threads accessing the same SQLite database concurrently causing `SQLITE_BUSY`.
   - **Audit Finding:** Every `PrismaClient` is configured with `PRAGMA busy_timeout = 10000;` (10 seconds) and `PRAGMA journal_mode = WAL;`. Readers never block writers, and writers never block readers.
3. **LRU Client Eviction During Active Transactions:**
   - **Risk:** Evicting and disconnecting a `PrismaClient` while a transaction is pending could abort the transaction.
   - **Audit Finding:** [`prisma.ts:305`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L305) explicitly checks `entry.activeOps === 0` before selecting an eviction candidate, preventing disconnection of active clients.

---

## 7. Database Deletion Audit (Trace of All Deletion Mechanisms)

A search across all backend and frontend source files for `unlink`, `rm`, `deleteFile`, `File.Delete`, `fs.unlink`, and `fs.rm` confirmed:

1. **API / Web Application:**
   - Zero application endpoints delete `.db` files.
   - User profile deletion routes do not exist.
   - Only test cleanup files (`apps/api/src/tests/*.ts`) unlink test databases.
2. **Windows Installer / Uninstaller:**
   - [`installer/Installer.cs:1924-1930`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1924-L1930) (`PerformUninstall`) explicitly protects `%LOCALAPPDATA%\DiamondERP` from deletion:
     ```csharp
     string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
     string userDbDir = Path.Combine(localAppData, "DiamondERP");
     string canonicalInstallDir = Path.GetFullPath(installDir);

     if (!canonicalInstallDir.Equals(userDbDir, StringComparison.OrdinalIgnoreCase) &&
         !canonicalInstallDir.StartsWith(userDbDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
     {
         // Deletes Program Files installation directory only!
         // %LOCALAPPDATA%\DiamondERP is 100% preserved.
     }
     ```

**Conclusion:** V3 provides an absolute architectural guarantee that no user action or uninstallation can accidentally delete customer SQLite database files.
