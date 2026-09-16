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

## 3. Frontend Architecture

- **Framework & Libraries:**
  - **React:** `19.1.0` ([`apps/web/package.json`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/package.json))
  - **Vite:** `6.4.3` (bundler and dev server)
  - **Routing:** `react-router-dom` `7.5.0`
  - **Styling:** Vanilla CSS design system + TailwindCSS utilities ([`apps/web/src/index.css`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/index.css))
- **Entry & Layout:**
  - Entry Point: [`apps/web/src/main.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/main.tsx) mounting `<App />` inside `React.StrictMode` and `BrowserRouter`.
  - Root Component: [`apps/web/src/App.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/App.tsx)
  - Layout Wrapper: Horizontal desktop split with collapsible liquid-glass [`Sidebar`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/layout/Sidebar.tsx) and main content area managed by [`TopBar`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/layout/TopBar.tsx).
- **Existing Route Map:**
  - `/` -> [`DashboardPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/DashboardPage.tsx)
  - `/inventory` -> [`InventoryPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/InventoryPage.tsx)
  - `/ledger` -> [`LedgerPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/LedgerPage.tsx)
  - `/certificates` -> [`CertificatesPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/CertificatesPage.tsx)
  - `/parties` -> [`PartiesPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/PartiesPage.tsx)
  - `/repairs` -> [`RepairsPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/RepairsPage.tsx)
  - `/reports` -> [`ReportsPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/ReportsPage.tsx)
  - `/settings` -> [`SettingsPage`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/pages/SettingsPage.tsx)
  - `*` -> Catch-all fallback navigation redirect to `/`.
- **Global Contexts & Overlays:**
  - [`AuthProvider`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AuthContext.tsx): Manages active token, logged-in user state, active profile (`diamond_erp_active_profile_id`), and auto-hydrates from `sessionStore`. Falls back to hardcoded `DEFAULT_USER` (`stavan`, `SUPER_ADMIN`).
  - [`AppLockProvider`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AppLockContext.tsx): Manages auto-lock timeouts (idle timer), PIN lock state, and lock overlay visibility.
  - [`FirstRunActivationOverlay`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/security/FirstRunActivationOverlay.tsx): Fullscreen master password lock on initial launch checking `/api/system/activation-status`.
- **API Client:**
  - Located at [`apps/web/src/services/api/client.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/api/client.ts) and [`apps/web/src/services/api.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/api.ts).
  - Automatically attaches `Authorization: Bearer <token>` and `X-Profile-Id: <activeProfile>`.
  - Base URL defaults to empty string `''` in production (relative loopback `/api`) and proxy port `5175` -> `3002` in development.

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
