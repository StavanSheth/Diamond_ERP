# DiamondERP V3.0 — Windows Package Manifest & Distribution Architecture

## 1. Overview
This manifest specifies the complete contents and layout of the DiamondERP V3.0 production distribution package for Windows. It provides the authoritative specification for Phase 2 installer generation and offline standalone deployment.

---

## 2. Directory Layout: `build/windows/DiamondERP/`

```
build/windows/DiamondERP/
│
├── DiamondERP.exe                     # Pre-compiled C# desktop launcher
├── Installer.exe                      # Pre-compiled setup wizard / installer
├── app.ico                            # Application window and shortcut icon
│
├── Microsoft.Web.WebView2.Core.dll    # WebView2 runtime wrapper library
├── Microsoft.Web.WebView2.Wpf.dll     # WebView2 WPF UI component
├── WebView2Loader.dll                 # Native WebView2 bootstrapper loader
│
├── runtime/
│   └── node.exe                       # Official portable Node.js runtime (Phase 2)
│
├── api/
│   ├── dist/                          # Compiled TypeScript backend (index.js, routes, etc.)
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema definition
│   │   └── template.db                # Pre-migrated SQLite pristine template (548 KB)
│   ├── node_modules/                  # Curated production-only runtime dependencies
│   │   ├── @prisma/client/
│   │   ├── .prisma/client/
│   │   │   └── query_engine-windows.dll.node
│   │   ├── bcryptjs/
│   │   ├── cors/
│   │   ├── csv-parse/
│   │   ├── csv-stringify/
│   │   ├── dotenv/
│   │   ├── exceljs/
│   │   ├── express/
│   │   ├── express-rate-limit/
│   │   ├── helmet/
│   │   ├── jsonwebtoken/
│   │   ├── multer/
│   │   ├── uuid/
│   │   └── zod/
│   └── package.json                   # Production metadata (stripped of devDependencies)
│
└── web/
    └── dist/                          # Compiled React Single Page Application
        ├── index.html                 # Root HTML document
        └── assets/                    # Optimized JS bundles, CSS, and media assets
            ├── index-*.js
            └── index-*.css
```

---

## 3. Component Details & Packaging Rules

### 1. Launcher (`DiamondERP.exe`)
- **Technology**: .NET Framework 4.7.2+ / C# with WPF.
- **Role**:
  - Resolves executable-relative application root (`AppDomain.CurrentDomain.BaseDirectory`).
  - Resolves mutable data root (`%LOCALAPPDATA%\DiamondERP`).
  - Detects runtime: prioritizes portable `runtime/node.exe` before system `node`.
  - Spawns backend process on loopback `127.0.0.1:3002` with `NODE_ENV=production`.
  - Polls `http://127.0.0.1:3002/health` until status `ok` is received.
  - Initializes `WebView2` using `%LOCALAPPDATA%\DiamondERP\WebView2Data` as persistent user data directory.
  - Navigates to `http://127.0.0.1:3002/`.
  - Manages graceful shutdown of the Node.js backend when the window is closed.

### 2. Runtime Engine (`runtime/node.exe`)
- **Version**: Node.js LTS (v20.x or v22.x x64).
- **Format**: Official portable binary (single `node.exe` executable).
- **Rule**: Eliminates customer requirement to have Node.js or npm installed on their machine.

### 3. Backend Distribution (`api/dist/`)
- **Source**: Compiled output of `npm run build --workspace=@diamond-erp/api` (`tsc`).
- **Dependencies**: All monorepo contracts (`@diamond-erp/contracts`) and utilities (`@diamond-erp/shared-utils`) are compiled into JavaScript and resolved directly.
- **Rule**: Zero TypeScript source files or development dependencies are packaged.

### 4. Database Schema & Template (`api/prisma/template.db`)
- **Role**: Contains the full pre-migrated schema with all tables, indices, and constraints.
- **Rule**: On fresh installation or when creating a new tenant profile, the application copies `template.db` to `%LOCALAPPDATA%\DiamondERP\databases\<profile>.db`. This eliminates the need for `@prisma/cli` or database migrations on customer PCs.

### 5. Frontend SPA Distribution (`web/dist/`)
- **Source**: Output of `npm run build --workspace=@diamond-erp/web` (`vite build`).
- **Delivery**: Served directly by the production Express backend with SPA fallback for client-side routing.
- **Rule**: Never run Vite dev server in production.

### 6. WebView2 Strategy
- **Libraries**: `Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.Wpf.dll`, and `WebView2Loader.dll` are bundled alongside `DiamondERP.exe`.
- **Evergreen Detection**: Launcher queries `CoreWebView2Environment.GetAvailableBrowserVersionString()`. If missing (e.g. on legacy Windows 10 machines without Edge updates), displays clear instruction or runs the bundled Microsoft Evergreen bootstrapper installer.
- **User Data**: Stored in `%LOCALAPPDATA%\DiamondERP\WebView2Data`. Guarantees cookies, sessions, IndexedDB, and localStorage persist across application launches.

---

## 4. User Data Isolation & Upgrade Safety

### Immutable Application Directory (Installed via Setup)
- **Target**: `C:\Program Files\DiamondERP\` (or user-selected program folder).
- **Permissions**: Read-only for standard users.
- **Lifecycle**: Replaceable during application updates. Upgrades overwrite application binaries without affecting user databases.

### Mutable User Data Directory (Runtime Persistent)
- **Target**: `%LOCALAPPDATA%\DiamondERP\`
- **Subdirectories**:
  - `databases/`: Holds `Stavan.db`, `<profile>.db`.
  - `uploads/certs/`: Uploaded diamond certification PDF documents.
  - `backups/`: Database backup archives.
  - `logs/`: Application execution and crash logs.
  - `config/`: Configuration files (`.jwt_secret`, `.profile-config.json`, `.app-activation.json`).
  - `WebView2Data/`: Browser storage (IndexedDB drafts, localStorage tokens).
- **Upgrade Guarantees**:
  - Installer and updater NEVER touch `%LOCALAPPDATA%\DiamondERP`.
  - Databases and certificate files are preserved 100% intact across upgrades.
  - Uninstallation leaves `%LOCALAPPDATA%\DiamondERP` intact or explicitly prompts the user to confirm data deletion.
