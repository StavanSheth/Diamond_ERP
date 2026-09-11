# Part 1: Targeted Audit - Production Readiness

## Audit Scope
This audit reviews the Diamond ERP codebase against the strict offline Windows packaging requirements outlined in Phase 1. The goal is to document exactly what must change before writing any code.

## Findings Table

| Issue | Current Implementation | Risk | Required Fix | Files Affected | Behavior Change | Test Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SQLite Paths** | `DB_DIR` is hardcoded to `__dirname + '../../../'` | Fails when installed in `C:\Program Files` due to permissions. | Move `DB_DIR` to `%LOCALAPPDATA%\DiamondERP\databases`. | `prisma.ts` | No | Multiple profiles persistence across restarts |
| **Profile Multi-DB** | Dynamically scans `DB_DIR` for `.db` files | New profiles will attempt to create DBs in Program Files. | Update profile generation to target `%LOCALAPPDATA%`. | `prisma.ts` | No | Profile creation / switching |
| **Prod Config** | `config/index.ts` relies on `process.env` (e.g. `.env`) | Offline users do not have a `.env` file. | Create local config storage in `%LOCALAPPDATA%`. | `config/index.ts`, `auth.service.ts` | No | Startup without `.env` |
| **JWT Config** | Requires `JWT_SECRET` in production | App crashes without secret; cannot expect user to set one. | Auto-generate & persist a secret on first-run. | `auth.service.ts` | No | Re-login after restart |
| **Default Admin** | Random base64 password generated if not passed via ENV | User is locked out because they cannot see the console output. | Force a secure first-run setup or store default password securely. | `auth.service.ts` | Yes (first run) | Fresh install |
| **Prisma Runtime** | Relies on `npm` generated client & local engine | Prisma won't run offline without its engine/client. | Package `node_modules/@prisma/client` and `.engine` files into build. | Build Script | No | DB Operations |
| **Frontend Serving** | Express does not serve static React files | Requires `vite` dev server to run in background. | Express must serve `apps/web/dist/` in production. | `index.ts` | No | SPA Routing |
| **Node.js Dep** | Launcher runs `cmd.exe /c npm run dev:api` | Users without Node/NPM cannot run the app. | Bundle portable `node.exe` and execute `node api/dist/index.js`. | `Launcher.cs`, Build Script | No | Clean PC Test |
| **WebView2 Dep** | Initialized dynamically, falls back to Edge `--app` | Safe, but installer fails without DLLs. | Bundle DLLs correctly during build/install. | `Launcher.cs`, `Installer.cs` | No | WebView2 UI loads |
| **Working Directory**| `process.cwd()` used for `backups` and `.app-activation` | Fails if app launched from arbitrary shortcut/working dir. | Use centralized absolute path abstraction. | `settings.controller.ts`, `activation.controller.ts` | No | Export/Backup |
| **Launcher Start/Stop**| Runs `cmd` and kills process tree on exit | Spawns orphaned processes if crashes. | Launch `node.exe` directly via Process, handle graceful shutdown. | `Launcher.cs` | No | Start/Kill |
| **Installer** | Compiles `Launcher.cs` via `csc.exe` | Requires .NET Framework 4.0 SDK at runtime. | Precompile everything in CI/Build step. | `Installer.cs`, Build Script | No | Install |
| **CORS / Ports** | Hardcoded `localhost` dev origins | Need static origin for production (WebView2 local url). | Update CORS logic to allow single bundled origin. | `cors.ts`, `index.ts` | No | E2E API Calls |
| **Offline Assets** | Unknown | Remote CDNs/fonts will fail offline. | Audit and download any remote assets to React `public`. | React Components | No | Disconnect internet |

## Conclusion
The application is not yet production-ready for offline Windows packaging. The biggest risks are **file paths pointing to Program Files** and **reliance on the `npm`/`node` developer environment**. 

I am ready to proceed with **Part 2: Database and Windows Data Paths**.
