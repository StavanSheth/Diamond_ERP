# Diamond ERP V3.0 — Current Architecture & Repository Baseline Audit

> **Audit Date:** September 16, 2026  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Target Branch:** `v3`  
> **Baseline Commit:** `6f859bb8c053560495244e08c8343fffff88ceea` (`fix: clean install data, sidebar toggle, profile isolation`)  
> **Auditor Role:** Senior Software Architect & Repository Engineer  
> **Scope:** Phase 1 Architecture & Lifecycle Audit (Source Code as Sole Authority)

---

## 1. Repository Baseline & Git Environment

- **Remote URL:** `https://github.com/StavanSheth/Diamond_ERP.git` (`origin`)
- **Active Branch:** `v3` (verified via `git branch --show-current`)
- **Commit SHA:** `6f859bb8c053560495244e08c8343fffff88ceea`
- **Working Tree:** Clean prior to audit document creation.
- **Monorepo Structure:** npm workspaces declared in root [`package.json`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/package.json#L6-L9):
  - `apps/*`: `apps/api` (`@diamond-erp/api`), `apps/web` (`@diamond-erp/web`)
  - `packages/*`: `packages/contracts` (`@diamond-erp/contracts`), `packages/shared-utils` (`@diamond-erp/shared-utils`), `packages/api-client` (`@diamond-erp/api-client`)
- **Runtime Engines:**
  - Node.js Requirement: `>= 20.0.0` (active host: `v22.20.0`, npm `10.9.3`)
  - Pinned Production Node Runtime: Node.js `v22.20.0` Windows x64 (SHA-256: `fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d`)
  - .NET Target: .NET Framework 4.0 / 4.5+ (`csc.exe` in `C:\Windows\Microsoft.NET\Framework64\v4.0.30319`)

---

## 2. Monorepo Directory Layout & Module Responsibilities

```
c:\Projects\ERP - Copy\Test\TestV3.0\
├── apps/
│   ├── api/                     # Backend Express REST API & Prisma Engine
│   │   ├── prisma/              # Prisma schema & SQLite templates
│   │   ├── src/                 # TypeScript controllers, services, middleware
│   │   └── package.json         # API dependencies (bcryptjs, express, exceljs, etc.)
│   └── web/                     # Frontend React 19 SPA
│       ├── src/                 # Pages, components, hooks, contexts, client services
│       └── package.json         # Web dependencies (react, react-router-dom, tailwindcss)
├── installer/                   # C# Native Windows Executables & Manifests
│   ├── Launcher.cs              # WPF + WebView2 Desktop Shell Application
│   ├── Installer.cs             # WinForms Standalone & Silent Setup Wizard
│   ├── DiamondERP.csproj        # MSBuild / CSC build configuration
│   ├── Launcher.manifest        # Per-monitor DPI, Windows 10/11 compatibility
│   ├── Installer.manifest       # requireAdministrator elevation manifest
│   ├── app.ico                  # Application icon asset
│   └── *.dll                    # WebView2 Core, WPF, and native loader binaries
├── packages/                    # Internal Monorepo Packages
│   ├── contracts/               # TypeScript DTO and domain interface contracts
│   ├── shared-utils/            # Common calculation, validation, and date routines
│   └── api-client/              # Generated / typed fetch client for frontend
├── scripts/                     # Build, Staging, Packaging & Verification Harness
│   ├── stage-windows-build.js   # Production layout staging builder
│   ├── package-windows-release.js # Release packaging and Setup.exe generation
│   ├── create-release-manifest.js # Cryptographic SHA-256 manifest generator
│   ├── verify-windows-release.js  # Release integrity validator
│   ├── test-phase7-launcher.js  # Launcher integration test runner
│   ├── test-phase8-webview2.js  # WebView2 behavioral & security test runner
│   └── test-phase9-installer.js # Installer lifecycle & data preservation test runner
├── docs/                        # Architecture & release documentation
└── package.json                 # Monorepo workspace scripts
```

---

## 3. Frontend Architecture (Code-Level Audit)

### 3.1 Complete Frontend Source Tree (`apps/web/src/`)

```
apps/web/src/
├── components/                  # Global and Shared UI Components
│   ├── layout/                  # Application Shell & Navigation
│   │   ├── Sidebar.tsx          # Liquid-glass collapsible navigation dock with pop-out colorful icons
│   │   └── TopBar.tsx           # Mobile / desktop header with sync status and manual refresh trigger
│   ├── security/                # Security & Access Guards
│   │   ├── FirstRunActivationOverlay.tsx  # Master password lifetime activation shield
│   │   └── AppLockOverlay.tsx   # PIN & Windows Hello biometric workstation screen-lock
│   └── ui/                      # Reusable atom components (badges, modals, cards, inputs)
├── contexts/                    # Global React Context Providers
│   ├── AuthContext.tsx          # User session, JWT hydration, profile switching, DEFAULT_USER fallback
│   └── AppLockContext.tsx       # Idle inactivity timer, WebAuthn integration, PIN verification
├── domains/                     # Domain-Driven ERP Modules
│   ├── common/                  # Shared domain buttons and pagination hooks (useEntityPage.ts)
│   ├── inventory/               # Diamond item modals, filter drawers, stock cards, detail drawers
│   ├── ledger/                  # Double-entry ledger views, payment summaries, transaction registers
│   ├── parties/                 # Party modal, party types (CUSTOMER, SUPPLIER, WORKSHOP, BROKER)
│   ├── repairs/                 # Workshop repair modals, carat loss trackers, vendor assignments
│   ├── reports/                 # KPI analytics charts, report filter sections, preset cards
│   └── transactions/            # Multi-item transaction composer, brokerage calculator, payment splits
├── hooks/                       # Domain & Data Synchronization Hooks
│   ├── useStocks.ts             # Primary stock parcel fetcher, CRUD, sync status tracker
│   ├── useLocations.ts          # Physical stock location hierarchy resolver
│   ├── useDrafts.ts             # In-memory and IndexedDB draft state manager
│   ├── useDraftAutoSave.ts      # Periodic background autosave trigger for open forms
│   └── useReferenceData.ts      # Party, category, and currency lookup caches
├── pages/                       # Primary Route View Controllers (React Router DOM)
│   ├── DashboardPage.tsx        # High-level inventory KPI cards, recent transactions, stock summaries
│   ├── InventoryPage.tsx        # Diamond parcel catalog, search filters, carat/price aggregations
│   ├── LedgerPage.tsx           # Financial transactions, receivables/payables, balance reconciliation
│   ├── CertificatesPage.tsx     # Lab report tracking (GIA, IGI, HRD), document viewer, upload dropzone
│   ├── PartiesPage.tsx          # Business entity directory, GSTIN records, ledger statement access
│   ├── RepairsPage.tsx          # Workshop job tracking, polish/symmetry recut monitoring
│   ├── ReportsPage.tsx          # Comprehensive financial, inventory, and transaction reports
│   └── SettingsPage.tsx         # System settings, manual SQLite WAL checkpoint, database backup
├── services/                    # Client Services & Local Data Stores
│   ├── api.ts                   # Centralized API service aggregator
│   ├── deviceAuth.ts            # WebAuthn platform authenticator (Windows Hello) & PBKDF2 PIN hashing
│   ├── draftDb.ts               # Dexie.js (IndexedDB) client-side offline autosave & draft store
│   └── api/                     # Domain-specific REST API client wrappers
│       ├── client.ts            # Fetch wrapper, bearer auth, X-Profile-Id attachment, sessionStore
│       ├── auth.api.ts          # Login, bootstrap, change-password API calls
│       ├── stocks.api.ts        # Stock CRUD API endpoints
│       ├── ledger.api.ts        # Ledger & financial API endpoints
│       ├── parties.api.ts       # Party directory API endpoints
│       ├── repairs.api.ts       # Workshop repair API endpoints
│       ├── certificates.api.ts  # Certificate & PDF upload API endpoints
│       ├── reports.api.ts       # Report definitions & Excel download API endpoints
│       └── settings.api.ts      # System settings, WAL checkpoint, backup API endpoints
├── types/                       # TypeScript Domain Definitions & Enums
├── utils/                       # Utility functions (blob downloads, currency formatters, floral colors)
├── App.tsx                      # Root component, provider tree, security overlays, route definitions
├── main.tsx                     # Vite DOM mount entry point (React.StrictMode, BrowserRouter)
└── index.css                    # Design system tokens, liquid-glass CSS styles, TailwindCSS directives
```

### 3.2 Authoritative Startup Rendering Flow

```text
Browser / WebView2 Host (Navigates to http://127.0.0.1:3002/)
    ↓
index.html (Loads /src/main.tsx)
    ↓
main.tsx (Initializes React 19 root)
    ↓
<BrowserRouter>
    ↓
<AuthProvider> (Checks sessionStore.getToken() in localStorage: 'diamond_erp_auth_token')
    ├─ If Token Found: Calls GET /api/auth/me to hydrate User state
    └─ If No Token: Defaults state to DEFAULT_USER (stavan / SUPER_ADMIN)
    ↓
<AppLockProvider> (Reads localStorage: 'appLock_enabled', 'appLock_timeout', 'appLock_locked')
    ├─ Checks isPlatformAuthenticatorAvailable() (Windows Hello / Platform Credential)
    └─ Evaluates elapsed inactivity against 'appLock_lastActive'
    ↓
<AppContent>
    ├─ <FirstRunActivationOverlay />
    │    └─ Queries GET /api/system/activation-status
    │         ├─ If Unactivated: Renders modal blocking ALL user interaction
    │         └─ If Activated: Stores 'diamond_erp_lifetime_activated' = 'true', unblocks
    ├─ <AppLockOverlay />
    │    └─ If isLocked === true: Renders fullscreen workstation shield requiring PIN / Windows Hello
    ├─ <Sidebar /> (Collapsible desktop dock with liquid-glass aesthetic)
    ├─ <TopBar /> (Mobile header & manual sync trigger)
    └─ <Routes> (Renders active page component based on window.location.pathname)
```

### 3.3 Complete Route & Authentication Mapping

| Route | Component | Layout Wrapper | Auth / Security Requirement | Data Loading Behavior |
|---|---|---|---|---|
| `/` | `DashboardPage` | Shell (`Sidebar` + `TopBar`) | Requires Token (or `DEFAULT_USER` dev fallback) | Fetches stocks summary via `useStocks()` hook on mount |
| `/inventory` | `InventoryPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches parcels, categories, locations via `useStocks()` |
| `/ledger` | `LedgerPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches transactions, party balances, payment summaries |
| `/certificates` | `CertificatesPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches GIA/IGI certificates, pending submissions |
| `/parties` | `PartiesPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches customer, supplier, and workshop party directory |
| `/repairs` | `RepairsPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches active repair jobs, recutting carat logs |
| `/reports` | `ReportsPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches report definitions, KPI summaries, chart datasets |
| `/settings` | `SettingsPage` | Shell (`Sidebar` + `TopBar`) | Requires Token | Fetches system settings, profile list, backup logs |
| `*` | `<Navigate to="/" replace />` | None | Fallback | Redirects any unknown route to `/` |

### 3.4 Local Browser Storage & Persistence Audit

The frontend relies on two client-side storage mechanisms:

#### A. LocalStorage Keys:
- `diamond_erp_auth_token`: Holds the active JWT bearer token for backend API requests.
- `diamond_erp_active_profile_id`: Holds the active multi-tenant profile code (e.g. `'Stavan'`) attached as `X-Profile-Id`.
- `diamond_erp_lifetime_activated`: Cached boolean flag (`'true'`) indicating master password unlock status.
- `appLock_enabled`: Boolean flag indicating whether the workstation screen shield is enabled.
- `appLock_timeout`: Inactivity timeout duration in minutes (clamped between 1 and 525,600 minutes).
- `appLock_locked`: Boolean flag indicating whether the screen lock is currently engaged.
- `appLock_credentialId`: Base64URL credential ID for WebAuthn platform authenticator (Windows Hello).
- `appLock_pinHash`: PBKDF2 salted hash (`salt:hex` format, 100,000 iterations) for fallback workstation PIN.
- `appLock_lastActive`: Timestamp (milliseconds) of user's last keyboard/mouse activity.

#### B. IndexedDB Client Store (`Dexie.js` in `apps/web/src/services/draftDb.ts`):
- Database Name: `DiamondERP_DraftDB`
- Tables:
  - `drafts`: Stores offline uncommitted business entity drafts (`TRANSACTION`, `STOCK`, `CERTIFICATION`, `REPAIR`).
  - `revisions`: Stores point-in-time snapshots and JSON diff changesets for document recovery.
  - `syncQueue`: Offline mutation queue storing pending actions (`CREATE`, `SAVE_REVISION`, `COMMIT`) with retry counters.

### 3.5 API Client Architecture & Tenancy Routing

- **Implementation:** [`apps/web/src/services/api/client.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/api/client.ts)
- **Base URL Resolution:**
  - Production (WebView2): Resolves to empty string `''` (relative loopback `http://127.0.0.1:3002`).
  - Development (Vite): Routes through Vite proxy `http://localhost:5175/api` -> `http://127.0.0.1:3002/api`.
- **Header Injection:**
  Every outgoing request automatically injects:
  - `Authorization: Bearer <token>` (from `sessionStore.getToken()`)
  - `X-Profile-Id: <profileCode>` (from `sessionStore.getProfileId()` or `'Stavan'`)
  - `Content-Type: application/json`
- **Error & Session Handling:**
  - Intercepts HTTP `401 Unauthorized`: Clears `diamond_erp_auth_token` from localStorage and dispatches a window event `'unauthorized'` to reset `AuthContext` without redirect loops.
  - Profile switching: When switching profiles via `sessionStore.setProfileId(code)`, dispatches `'profileChanged'` event causing all active queries and hooks to refetch against the new tenant database.

### 3.6 Recommended Future Onboarding Integration Point

- **Target Component:** [`apps/web/src/App.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/App.tsx#L18-L48)
- **Mechanism:**
  Insert an `<OnboardingWizard />` container above the primary `<main>` layout.
  When the application initializes, query `GET /api/system/onboarding-status`.
  If the installation is unconfigured (`isInitialized === false`), render the Onboarding Wizard full-screen, bypassing the standard ERP shell until device binding, PIN creation, and database selection are committed.

---

## 4. Backend Architecture

- **Framework:** **Express 4.21.2** with TypeScript (NOTE: The application uses Express, not Fastify).
- **Entry Point:** [`apps/api/src/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/index.ts)
- **Configuration Service:** [`apps/api/src/config/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts)
  - Port: `3002` (configurable via `process.env.PORT`)
  - Host: `127.0.0.1` (loopback strictly bound)
  - Database URL: Defaults to `file:${getDatabasesDir()}/Stavan.db`
- **Routing & Middleware Stack:**
  - Express Router: [`apps/api/src/routes.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/routes.ts)
  - Middleware Pipeline in [`apps/api/src/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/index.ts#L60-L115):
    1. Request correlation tracking (`x-request-id`)
    2. Structured JSON/HTTP logging ([`apps/api/src/infrastructure/logging`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/logging))
    3. Security headers (`helmet`)
    4. Loopback CORS policy (`http://localhost:3002`, `http://127.0.0.1:3002`, etc.)
    5. Rate limiting (`express-rate-limit`: 100 req/min general, 10 req/min for auth)
    6. System routes (`/health`, `/api/system/*`)
    7. Authentication middleware ([`apps/api/src/middleware/auth.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/middleware/auth.ts))
    8. Dynamic multi-tenancy profile middleware ([`apps/api/src/middleware/profile.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/middleware/profile.ts))
    9. Domain routers (`/api/stocks`, `/api/ledger`, `/api/parties`, `/api/repairs`, `/api/reports`, `/api/settings`)
    10. Production SPA static file serving from `apps/web/dist` with index fallback.
    11. Centralized error handling middleware.

---

## 5. Database & Multi-Tenancy Engine

- **Database Engine:** SQLite 3 via Prisma Client (`@prisma/client` `5.22.0`).
- **Prisma Schema:** [`apps/api/prisma/schema.prisma`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma)
- **Multi-Tenancy / Profile Model:**
  - V3 employs a **database-per-profile** architecture.
  - Managed by [`apps/api/src/infrastructure/database/prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts).
  - Context isolation: `AsyncLocalStorage<ProfileContext>` stores the active profile code per request.
  - Client registry: LRU-cached pool of up to 10 active `PrismaClient` instances keyed by lowercase profile code (`clientRegistry: Map<string, ClientRegistryEntry>`).
  - Thread-safe mutex lock: `clientInitLocks: Map<string, Promise<PrismaClient>>` prevents race conditions during profile client spin-up.
  - Transparent Proxy: `prismaProxy` intercepts all business service queries (`import prisma from '...'`) and delegates calls to the PrismaClient active in the current `AsyncLocalStorage` store.
- **SQLite Performance PRAGMAs:**
  - Applied upon connection in `configureSqlitePragmas()` ([`prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L225-L236)):
    ```sql
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 10000;
    PRAGMA foreign_keys = ON;
    ```
- **Template Database Provisioning:**
  - When a new profile is registered or requested, `ensureProfileDbFile(dbPath)` checks if the SQLite file exists on disk.
  - If missing, it copies the schema-only pre-migrated template from [`getDatabaseTemplatePath()`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L123-L144) (`apps/api/prisma/template.db`).
  - No runtime `prisma migrate` or external CLI tool is invoked in customer environments.

---

## 6. Authoritative Path Resolution & Data Directories

All mutable file storage is centralized in [`apps/api/src/infrastructure/paths.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts).

### Path Routing Rules:
1. **Production Mode (`NODE_ENV === 'production'` or `DIAMOND_DATA_DIR` set):**
   - Root: `%LOCALAPPDATA%\DiamondERP` (e.g. `C:\Users\<User>\AppData\Local\DiamondERP`)
2. **Development Mode:**
   - Root: `apps/api/` inside workspace.

### Directory Classification Matrix:

| Subdirectory | Production Path | Classification | Survivability on Uninstall |
|---|---|---|---|
| `databases/` | `%LOCALAPPDATA%\DiamondERP\databases` | User Business Data (SQLite `.db`, `-wal`, `-shm`) | **MUST NEVER BE DELETED** |
| `uploads/certs/` | `%LOCALAPPDATA%\DiamondERP\uploads\certs` | User Documents (PDF Certificates) | **MUST NEVER BE DELETED** |
| `backups/` | `%LOCALAPPDATA%\DiamondERP\backups` | User Backups (Manual & Auto `.db`) | **MUST NEVER BE DELETED** |
| `config/` | `%LOCALAPPDATA%\DiamondERP\config` | Application State (`.profile-config.json`, `.jwt_secret`, `.app-activation.json`) | **PRESERVED** (Contains tenant configuration) |
| `logs/` | `%LOCALAPPDATA%\DiamondERP\logs` | Diagnostic Logs (`app-*.log`, `launcher-*.log`) | Purgeable / Non-critical |
| `WebView2Data/` | `%LOCALAPPDATA%\DiamondERP\WebView2Data` | Browser Cache & LocalStorage | Application-owned / Regenerable |

---

## 7. C# Launcher Architecture (`installer/Launcher.cs`)

The desktop launcher is a single-binary WPF application ([`installer/Launcher.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs)):

- **Entry Point:** `AppMainWindow.Main(string[] args)` ([Line 88](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L88))
- **Single-Instance Enforcement:** Named system Mutex `Global\DiamondERP_SingleInstance_Mutex`. If already acquired, brings existing window to foreground via Win32 `FindWindow` + `SetForegroundWindow` ([Lines 163-175](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L163-L175)).
- **IPC Remote Shutdown Event:** Named event `Global\DiamondERP_Shutdown_Event`. A worker thread listens on this event; when signaled, it invokes graceful backend termination and application exit ([Lines 177-206](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L177-L206)).
- **CLI Arguments:**
  - `--check-env`: Outputs environment diagnostic strings (`MODE`, `APPDIR`, `DATADIR`, `RUNTIMEDIR`, `NODE_RUNTIME_EXISTS`, etc.) ([Lines 102-135](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L102-L135)).
  - `--version` / `-v`: Outputs `Diamond ERP v3.0.0` ([Lines 136-141](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L136-L141)).
  - `--shutdown`: Signals `Global\DiamondERP_Shutdown_Event` to terminate any running instance ([Lines 142-160](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L142-L160)).
- **Production Mode Detection:** `DetectProductionMode()` ([Line 492](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L492)) verifies existence of `api/dist/index.js`.
- **Runtime Resolution:** `ResolveRuntimeDirectory()` ([Line 450](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L450)) locates bundled `runtime/node.exe`.
- **Process Orchestration:** `StartBackendProcess()` ([Line 598](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L598)) launches child Node process with hidden window, standard I/O redirection, and environment variables (`PORT=3002`, `HOST=127.0.0.1`, `DIAMOND_DATA_DIR=%LOCALAPPDATA%\DiamondERP`).
- **Health Verification:** `WaitForBackend()` ([Line 716](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L716)) polls `http://127.0.0.1:3002/health` with bounded retry loop (up to 40 attempts, 250ms interval) while rendering a branded WPF splash screen.
- **WebView2 Integration:**
  - Checks available browser runtime via `CoreWebView2Environment.GetAvailableBrowserVersionString()` ([Line 756](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L756)).
  - Configures user data directory to `%LOCALAPPDATA%\DiamondERP\WebView2Data` ([Line 772](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L772)).
  - Enforces navigation policy in `NavigationStarting` ([Line 900](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L900)): strictly permits `127.0.0.1:3002`, cancels arbitrary external navigation, and delegates valid HTTP/HTTPS URLs to the default external browser via `Process.Start`.
  - Blocks DevTools, context menus, and developer keyboard shortcuts (`F12`, `Ctrl+Shift+I`, `F5`) in `OnPreviewKeyDown` ([Lines 980-1015](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L980-L1015)).
- **Graceful Shutdown:** `ShutdownBackend()` ([Line 1132](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L1132)) executes idempotent shutdown: closes stdin, sends process kill signal if unresponsive after timeout, disposes notify tray icon, and disconnects event handles.

---

## 8. C# Installer Architecture (`installer/Installer.cs`)

The installer is a WinForms application compiled via `csc.exe` ([`installer/Installer.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs)):

- **Payload Extraction Modes:**
  1. Embedded Zip Resource (`Assembly.GetManifestResourceStream("DiamondERP.Payload.zip")`) for single-file `Setup.exe` ([Lines 1348-1371](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1348-L1371)).
  2. Adjacent Zip File (`DiamondERP-*.zip`) fallback ([Lines 1380-1396](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1380-L1396)).
- **Zip Slip Defense:** `ExtractZipStream()` ([Lines 1260-1315](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1260-L1315)) strictly validates canonical target paths using `Path.GetFullPath(destFile).StartsWith(targetRoot)` before creating any directory or extracting files. Throws `SecurityException` if path traversal is detected.
- **Atomic Upgrade & Rollback:**
  - Upgrades extract new payload into `<targetDir>.staging_` ([Line 1451](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1451)).
  - Verifies payload file completeness via `VerifyPayloadIntegrity()` ([Line 1319](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1319)).
  - Gracefully stops any active application instance via `EnsureAppNotRunning()` ([Line 1580](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1580)).
  - Backs up active installation to `<targetDir>.backup_` ([Line 1475](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1475)).
  - Swaps directories atomically. If an exception occurs, automatically restores from `.backup_`.
- **Customer Data Preservation on Uninstall:**
  - `PerformUninstall()` ([Lines 1857-1975](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1857-L1975)) deletes shortcuts, deletes registry entries, and removes application installation directory (e.g. `C:\Program Files\DiamondERP`).
  - It explicitly guards and preserves `%LOCALAPPDATA%\DiamondERP`, ensuring that user databases, certificates, logs, and backups remain intact.

---

## 9. Packaging Pipeline

Orchestrated by [`scripts/package-windows-release.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/package-windows-release.js) and [`scripts/stage-windows-build.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/stage-windows-build.js):

1. **Clean:** Deletes `build/windows/` and `build/releases/`.
2. **Build:** Compiles contracts, shared-utils, api-client, web (`apps/web/dist`), and backend (`apps/api/dist`).
3. **Stage:**
   - Bundles `runtime/node.exe` (pinned Node.js v22.20.0 x64, SHA-256: `fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d`).
   - Copies native binaries: `DiamondERP.exe`, `Installer.exe`, `Microsoft.Web.WebView2.*.dll`, `WebView2Loader.dll`, `app.ico`.
   - Copies `apps/api/dist/` (excluding sourcemaps).
   - Stages pre-migrated `api/prisma/template.db` and `schema.prisma`.
   - Executes deterministic production `npm install --omit=dev` inside staged `api/` directory.
   - Copies Prisma native query engine `query_engine-windows.dll.node`.
   - Copies React frontend bundle to `web/dist/`.
4. **Validation Gate:** `scripts/validate-packaging-readiness.js` executes 41 automated packaging checks.
5. **Compression & Setup Compilation:**
   - Creates `DiamondERP-3.0.0-Windows-x64.zip`.
   - Invokes `csc.exe` with `/resource:DiamondERP.Payload.zip` to produce self-contained `DiamondERP-Setup.exe`.
6. **Manifest & Hashes:** Generates `build/releases/release-manifest.json` with SHA-256 checksums.

---

## 10. Existing User & Authentication System

- **Database Model:** [`schema.prisma`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L14-L60) contains `User`, `Profile`, `UserProfile`, and `Session`.
- **Password Security:** Salted hashes using `bcryptjs` with 12 rounds ([`apps/api/src/modules/auth/auth.service.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts#L15)).
- **Session Tokens:** JWT signed with 32+ character instance secret persisted in `%LOCALAPPDATA%\DiamondERP\config\.jwt_secret`.
- **Current Deletion Semantics:**
  - `User` deletion cascades to `UserProfile` and `Session`.
  - Deleting a user in the database **does not** delete the underlying SQLite database file (`.db`) on disk.
  - However, there is no UI or API endpoint for deleting users or profiles in production V3.
- **Limitation:** User identity in V3 is tied to standard enterprise usernames and passwords. It does not yet feature local hardware PIN authentication, device fingerprinting, or device-level binding.

---

## 11. Existing Backup & Export Capabilities

- **SQLite WAL Checkpoint & Backup:**
  - Implemented in [`apps/api/src/modules/settings/settings.controller.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/settings/settings.controller.ts#L1460-L1515).
  - `POST /api/settings/checkpoint`: Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL logs to the main `.db` file.
  - `POST /api/settings/backup`: Runs `wal_checkpoint(TRUNCATE)` and creates a timestamped atomic backup in `%LOCALAPPDATA%\DiamondERP\backups\diamond_erp_backup_<timestamp>.db` using SQLite `VACUUM INTO` (with file copy fallback).
- **Excel & CSV Export:**
  - `exceljs` `4.4.0` is installed and actively used in [`apps/api/src/modules/reports/reports.service.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/reports/reports.service.ts#L1342-L1403) for streaming `.xlsx` reports.
  - `csv-parse` and `csv-stringify` are installed in `apps/api/package.json`.

---

## 12. Known Architectural Limitations & Friction Points for First-Run Lifecycle

1. **Hardcoded Default Profile ('Stavan'):**
   - Hardcoded in [`prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts#L74) (`defaultProfile = config.activeProfile || 'Stavan'`), [`apps/api/src/config/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts#L10) (`Stavan.db`), and [`AuthContext.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AuthContext.tsx#L25) (`DEFAULT_USER`).
   - Must be decoupled in Phase 2 & 6 to allow arbitrary dynamic user and database names.
2. **Absence of Device Fingerprinting:**
   - No hardware/machine identification exists to bind a local installation to a physical PC.
3. **No PIN / Biometric Setup:**
   - Auth is currently password-based. Quick PIN setup for POS/desktop use is not implemented.
4. **No Onboarding Flow:**
   - The frontend currently renders an activation password overlay (`FirstRunActivationOverlay.tsx`), but no wizard exists for first installation, PIN setup, database discovery, or user creation.
5. **No Database Validation Routine:**
   - Existing `.db` files are auto-discovered simply by file extension in `getAllProfiles()` without verifying schema compatibility or table integrity.
6. **No Pre-Uninstall Backup Trigger:**
   - Installer protects AppData files from deletion, but does not trigger an explicit verified backup before uninstallation or rollback.
