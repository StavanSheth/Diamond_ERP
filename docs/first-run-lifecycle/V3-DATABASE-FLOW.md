# Diamond ERP V3.0 — SQLite & Prisma Database Flow Architecture

> **Phase 1 Audit Artifact**  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Branch:** `v3`  
> **Topic:** Authoritative Database Lifecycle, Tenancy Routing & Provisioning Flow

---

## 1. End-to-End Database Lifecycle Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Launcher as Launcher (DiamondERP.exe)
    participant Node as Node Runtime (node.exe)
    participant Paths as paths.ts (Path Resolver)
    participant Middleware as profile.ts (Middleware)
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
    Launcher->>Middleware: HTTP GET/POST with Header [X-Profile-Id: "user_a"]
    Middleware->>Middleware: Validate regex /^[a-zA-Z0-9_-]{1,50}$/
    Middleware->>PrismaProxy: Establish AsyncLocalStorage context { profileId: "user_a" }

    Note over Launcher,SQLite: 3. DYNAMIC CLIENT RESOLUTION & PROVISIONING
    Middleware->>PrismaProxy: Business Service invokes prisma.stock.findMany()
    PrismaProxy->>Cache: Lookup client for "user_a"
    alt Client Not Cached in Registry
        Cache->>Paths: Resolve DB file path: %LOCALAPPDATA%\DiamondERP\databases\user_a.db
        alt File Does Not Exist
            Paths->>Template: Copy template.db -> user_a.db (fs.copyFileSync)
        end
        Cache->>SQLite: Open new PrismaClient("file:.../user_a.db")
        Cache->>SQLite: Configure PRAGMAs (WAL, NORMAL sync, busy_timeout 10000, FK ON)
        Cache->>Cache: Cache client in Map (bounded LRU, max 10 clients)
    end
    Cache-->>PrismaProxy: Active PrismaClient for "user_a"
    PrismaProxy->>SQLite: Execute SQL query on user_a.db
    SQLite-->>PrismaProxy: Return entity records
    PrismaProxy-->>Launcher: Return JSON response
```

---

## 2. Flow A: Application Start → Environment → DATABASE_URL → Prisma → SQLite

### Step-by-Step Code Execution Path:

1. **Process Launch & Environment Injection:**
   - **File:** [`installer/Launcher.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L626-L645) (`StartBackendProcess`)
   - The launcher configures child process environment variables:
     ```csharp
     psi.EnvironmentVariables["NODE_ENV"] = "production";
     psi.EnvironmentVariables["PORT"] = "3002";
     psi.EnvironmentVariables["HOST"] = "127.0.0.1";
     psi.EnvironmentVariables["DIAMOND_DATA_DIR"] = _dataDir; // %LOCALAPPDATA%\DiamondERP
     ```
2. **Path Resolution Service:**
   - **File:** [`apps/api/src/infrastructure/paths.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L35-L64)
   - Function: `getDataDir()` checks `process.env.DIAMOND_DATA_DIR` -> returns `%LOCALAPPDATA%\DiamondERP`.
   - Function: `getDatabasesDir()` returns `path.join(getDataDir(), 'databases')`.
3. **Database URL Assembly:**
   - **File:** [`apps/api/src/config/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts#L10)
   - Assembly logic:
     ```typescript
     databaseUrl: process.env.DATABASE_URL || `file:${path.join(getDatabasesDir(), 'Stavan.db')}`
     ```
4. **System Client Spin-up:**
   - **File:** [`apps/api/src/infrastructure/database/prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L250-L260)
   - Variable: `systemDbUrl = process.env.DATABASE_URL || 'file:' + defaultDbPath`
   - Method: `systemPrisma = createPrismaClient(systemDbUrl)`
   - Execution: `configureSqlitePragmas(systemPrisma)` applies:
     - `PRAGMA journal_mode = WAL;` (Enables concurrent reads and non-blocking writes)
     - `PRAGMA synchronous = NORMAL;` (Safe with WAL while minimizing disk fsync stalls)
     - `PRAGMA busy_timeout = 10000;` (10-second SQLite file lock wait before SQLITE_BUSY error)
     - `PRAGMA foreign_keys = ON;` (Strict relational integrity enforcement)

---

## 3. Flow B: Template DB → Production DB

How brand new databases are created without requiring `prisma migrate` or network access on client machines:

1. **Origin of Schema Template:**
   - **Source:** [`apps/api/prisma/template.db`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/template.db)
   - Created during development via [`scripts/sync-template-db.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/sync-template-db.js) or `prisma migrate deploy`.
   - Contains all 20+ tables (`User`, `Profile`, `UserProfile`, `Session`, `Stock`, `Ledger`, `DiamondItem`, `Transaction`, `Party`, etc.) with zero business records.
2. **Packaging & Staging:**
   - **Script:** [`scripts/stage-windows-build.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/stage-windows-build.js#L237-L246)
   - Staged into: `build/windows/DiamondERP/api/prisma/template.db`
   - Release manifest checks SHA-256 hash in `scripts/create-release-manifest.js`.
3. **Template Discovery at Runtime:**
   - **Function:** `getDatabaseTemplatePath()` in [`apps/api/src/infrastructure/paths.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L123-L144):
     Evaluates candidates in order:
     1. `process.env.DIAMOND_TEMPLATE_DB`
     2. `path.resolve(__dirname, '../../prisma/template.db')`
     3. `path.resolve(__dirname, '../prisma/template.db')`
     4. Fallback to `test.db` or `Stavan.db`
4. **Offline Database Provisioning:**
   - **Function:** `ensureProfileDbFile(dbPath)` in [`apps/api/src/infrastructure/database/prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L52-L71):
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

## 4. Flow C: Database → Migration → Runtime

### Development vs Production Migration Mechanics:

| Phase | Migration Strategy | Tooling Used | Dependency on Internet / CLI |
|---|---|---|---|
| **Development** | Schema migration via migrations directory | `prisma migrate dev` / `prisma db push` | Requires devDependencies, Prisma CLI, Node dev tooling |
| **Packaging** | Schema snapshot synchronization | `scripts/sync-template-db.js` | Runs locally during release build to generate `template.db` |
| **Customer Installation** | Pre-migrated SQLite schema cloning | Direct binary copy `fs.copyFileSync` | **ZERO** dependencies, completely offline, zero CLI execution |
| **Runtime Querying** | Standalone Prisma Rust Query Engine DLL | `query_engine-windows.dll.node` | Node C++ native binding loaded in-process by `@prisma/client` |

---

## 5. Tenancy Routing via `prismaProxy` & `AsyncLocalStorage`

All domain services import the default `prisma` export from [`apps/api/src/infrastructure/database/prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L414-L435):

```typescript
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
```

### Tenancy Protection Rules & Findings:
- **Tenant Scope Isolation:** `getActiveProfile()` throws an explicit error if accessed without an `AsyncLocalStorage` profile context for strict operations.
- **Client Cache Bounding:** `clientRegistry` holds at most 10 open Prisma clients. When capacity is exceeded, an LRU client with `activeOps === 0` is disconnected and evicted to prevent file descriptor leaks.
- **Graceful Clean Shutdown:** `disconnectAllClients()` ([Line 361](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L361)) iterates over all registry entries and `systemPrisma`, calling `$disconnect()` with `Promise.allSettled` to release file handles before process exit.
