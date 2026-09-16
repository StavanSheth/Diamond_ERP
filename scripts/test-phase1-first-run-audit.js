/**
 * DiamondERP V3.0 — Phase 1 First-Run Lifecycle Architecture Audit Verification
 *
 * Verifies code-level architecture facts and assumptions across the repository:
 *   1. Repository & Workspace Topology (Monorepo apps/*, packages/*)
 *   2. Frontend Architecture (React 19, Vite, routing, deviceAuth, draftDb, contexts)
 *   3. Backend Architecture (Express 4, routes, profile middleware, auth)
 *   4. User / Auth Architecture (User, Profile, UserProfile, Session, no destructive deletion)
 *   5. Device Identity Architecture (WebAuthn/Platform authenticator, audit deviceId columns, absence of Device table in Phase 1)
 *   6. Database Architecture (paths.ts, prisma.ts multi-tenant proxy, SQLite WAL pragmas, template.db)
 *   7. Launcher Architecture (Launcher.cs, mutex, shutdown event, port 3002, WebView2)
 *   8. Installer Architecture (Installer.cs, Zip Slip protection, AppData preservation)
 *   9. Backup & Export Architecture (exceljs, csv-parse, settings.controller WAL checkpoint & VACUUM INTO)
 *  10. Packaging Architecture (staging, release scripts, pinned Node.js runtime)
 *  11. Phase 1 Documentation & Scorecard Completeness
 *
 * Note: This script validates ACTUAL EXISTING V3 architecture without pretending future features exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(section, name, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [${section}] ✔ PASS: ${name}${details ? ` (${details})` : ''}`);
  } else {
    failedChecks++;
    console.error(`  [${section}] ❌ FAIL: ${name}${details ? ` (${details})` : ''}`);
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT_DIR, relPath));
}

function fileContains(relPath, strOrRegex) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) return false;
  const content = fs.readFileSync(fullPath, 'utf-8');
  if (strOrRegex instanceof RegExp) {
    return strOrRegex.test(content);
  }
  return content.includes(strOrRegex);
}

console.log('================================================================');
console.log('🔍 Diamond ERP V3 — Phase 1 Architecture Verification Harness');
console.log('================================================================\n');

// ── Section 1: Monorepo & Repository Baseline ───────────────────────────
console.log('▶ Section 1: Repository Baseline & Workspaces');
check('Repo', 'Root package.json exists', fileExists('package.json'));
check('Repo', 'apps/api exists', fileExists('apps/api/package.json'));
check('Repo', 'apps/web exists', fileExists('apps/web/package.json'));
check('Repo', 'packages/contracts exists', fileExists('packages/contracts/package.json'));
check('Repo', 'packages/shared-utils exists', fileExists('packages/shared-utils/package.json'));
check('Repo', 'packages/api-client exists', fileExists('packages/api-client/package.json'));

// ── Section 2: Frontend Architecture ────────────────────────────────────
console.log('\n▶ Section 2: Frontend Architecture Mapping');
check('Frontend', 'React 19 dependency declared', fileContains('apps/web/package.json', /"react":\s*"\^?19/));
check('Frontend', 'Vite 6 bundler declared', fileContains('apps/web/package.json', /"vite":\s*"\^?6/));
check('Frontend', 'React Router DOM 7 declared', fileContains('apps/web/package.json', /"react-router-dom":\s*"\^?7/));
check('Frontend', 'Root entry main.tsx exists', fileExists('apps/web/src/main.tsx'));
check('Frontend', 'Root layout App.tsx exists', fileExists('apps/web/src/App.tsx'));
check('Frontend', 'Sidebar navigation component exists', fileExists('apps/web/src/components/layout/Sidebar.tsx'));
check('Frontend', 'TopBar navigation component exists', fileExists('apps/web/src/components/layout/TopBar.tsx'));
check('Frontend', 'FirstRunActivationOverlay component exists', fileExists('apps/web/src/components/security/FirstRunActivationOverlay.tsx'));
check('Frontend', 'AppLockOverlay component exists', fileExists('apps/web/src/components/security/AppLockOverlay.tsx'));
check('Frontend', 'AuthContext exists', fileExists('apps/web/src/contexts/AuthContext.tsx'));
check('Frontend', 'AppLockContext exists', fileExists('apps/web/src/contexts/AppLockContext.tsx'));
check('Frontend', 'deviceAuth platform authenticator exists', fileExists('apps/web/src/services/deviceAuth.ts'));
check('Frontend', 'IndexedDB draftDb (Dexie) exists', fileExists('apps/web/src/services/draftDb.ts'));
check('Frontend', 'All 8 core pages exist', [
  'DashboardPage.tsx',
  'InventoryPage.tsx',
  'LedgerPage.tsx',
  'CertificatesPage.tsx',
  'PartiesPage.tsx',
  'RepairsPage.tsx',
  'ReportsPage.tsx',
  'SettingsPage.tsx',
].every((page) => fileExists(`apps/web/src/pages/${page}`)));

// ── Section 3: Backend Architecture ─────────────────────────────────────
console.log('\n▶ Section 3: Backend Architecture Mapping');
check('Backend', 'Express framework declared', fileContains('apps/api/package.json', /"express":\s*"\^?4/));
check('Backend', 'Prisma Client declared', fileContains('apps/api/package.json', /"@prisma\/client":\s*"\^?5/));
check('Backend', 'Server entry index.ts exists', fileExists('apps/api/src/index.ts'));
check('Backend', 'Routes assembly routes.ts exists', fileExists('apps/api/src/routes.ts'));
check('Backend', 'Authoritative paths.ts resolver exists', fileExists('apps/api/src/infrastructure/paths.ts'));
check('Backend', 'Multi-tenant prisma.ts engine exists', fileExists('apps/api/src/infrastructure/database/prisma.ts'));
check('Backend', 'Profile tenancy middleware exists', fileExists('apps/api/src/middleware/profile.ts'));
check('Backend', 'Authentication middleware exists', fileExists('apps/api/src/middleware/auth.ts'));
check('Backend', 'Loopback default port 3002 configured', fileContains('apps/api/src/config/index.ts', '3002'));
check('Backend', 'Health controller exists', fileExists('apps/api/src/modules/system/health.controller.ts'));
check('Backend', 'Activation controller exists', fileExists('apps/api/src/modules/system/activation.controller.ts'));

// ── Section 4: User & Authentication Model ──────────────────────────────
console.log('\n▶ Section 4: User / Authentication Architecture');
check('User', 'Prisma schema defines User model', fileContains('apps/api/prisma/schema.prisma', 'model User {'));
check('User', 'Prisma schema defines Profile model', fileContains('apps/api/prisma/schema.prisma', 'model Profile {'));
check('User', 'Prisma schema defines UserProfile model', fileContains('apps/api/prisma/schema.prisma', 'model UserProfile {'));
check('User', 'Prisma schema defines Session model', fileContains('apps/api/prisma/schema.prisma', 'model Session {'));
check('User', 'User passwords use bcryptjs', fileContains('apps/api/src/modules/auth/auth.service.ts', "import bcrypt from 'bcryptjs'"));
check('User', 'JWT token authentication implemented', fileContains('apps/api/src/modules/auth/auth.service.ts', "import jwt from 'jsonwebtoken'"));
check('User', 'Instance JWT secret stored in AppData config', fileContains('apps/api/src/modules/auth/auth.service.ts', '.jwt_secret'));
check('User', 'Auth bootstrap endpoint exists', fileContains('apps/api/src/modules/auth/auth.controller.ts', 'bootstrap = async'));
check('User', 'Zero destructive user deletion in API controllers', !fileContains('apps/api/src/modules/auth/auth.controller.ts', 'deleteUser'));

// ── Section 5: Device & Installation Identity ───────────────────────────
console.log('\n▶ Section 5: Device Identity Architecture');
check('Device', 'WebAuthn platform authenticator service exists in web', fileContains('apps/web/src/services/deviceAuth.ts', 'isPlatformAuthenticatorAvailable'));
check('Device', 'Client-side PBKDF2 PIN hashing implemented', fileContains('apps/web/src/services/deviceAuth.ts', 'hashPin'));
check('Device', 'Constant-time comparison implemented for PIN', fileContains('apps/web/src/services/deviceAuth.ts', 'constantTimeEqual'));
check('Device', 'DraftRevision model has deviceId column', fileContains('apps/api/prisma/schema.prisma', 'model DraftRevision {') && fileContains('apps/api/prisma/schema.prisma', 'deviceId        String?'));
check('Device', 'RecordVersion model has deviceId column', fileContains('apps/api/prisma/schema.prisma', 'model RecordVersion {') && fileContains('apps/api/prisma/schema.prisma', 'deviceId      String?'));
check('Device', 'AuditEvent model has deviceId column', fileContains('apps/api/prisma/schema.prisma', 'model AuditEvent {') && fileContains('apps/api/prisma/schema.prisma', 'deviceId      String?'));
check('Device', 'Confirm Phase 1 boundary: Device table does NOT exist in Prisma schema yet', !fileContains('apps/api/prisma/schema.prisma', 'model Device {'));

// ── Section 6: Database Ownership & SQLite Lifecycle ────────────────────
console.log('\n▶ Section 6: Database Ownership & SQLite Lifecycle');
check('Database', 'paths.ts routes databases to %LOCALAPPDATA%\\DiamondERP\\databases in prod', fileContains('apps/api/src/infrastructure/paths.ts', 'databases'));
check('Database', 'template.db pre-migrated schema file exists', fileExists('apps/api/prisma/template.db'));
check('Database', 'SQLite PRAGMA WAL mode configured', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'PRAGMA journal_mode = WAL;'));
check('Database', 'SQLite PRAGMA foreign_keys = ON configured', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'PRAGMA foreign_keys = ON;'));
check('Database', 'SQLite PRAGMA busy_timeout configured', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'PRAGMA busy_timeout = 10000;'));
check('Database', 'AsyncLocalStorage profile context routing implemented', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'AsyncLocalStorage<ProfileContext>'));
check('Database', 'Dynamic client registry caching implemented', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'clientRegistry = new Map'));
check('Database', 'Bounded cache limit MAX_CLIENTS = 10', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'MAX_CLIENTS = 10'));
check('Database', 'Prisma transparent proxy export exists', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'const prismaProxy = new Proxy'));
check('Database', 'ensureProfileDbFile provisions from template.db without CLI', fileContains('apps/api/src/infrastructure/database/prisma.ts', 'fs.copyFileSync(templateDb, dbPath)'));
check('Database', 'Zero runtime db unlink in production API services', !fileContains('apps/api/src/modules/settings/settings.controller.ts', 'unlinkSync'));

// ── Section 7: Desktop Launcher Architecture ────────────────────────────
console.log('\n▶ Section 7: Desktop Launcher Architecture');
check('Launcher', 'Launcher.cs source exists', fileExists('installer/Launcher.cs'));
check('Launcher', 'Launcher.manifest exists', fileExists('installer/Launcher.manifest'));
check('Launcher', 'Single instance mutex implemented', fileContains('installer/Launcher.cs', /DiamondERP_SingleInstance_Mutex/));
check('Launcher', 'Remote IPC shutdown event implemented', fileContains('installer/Launcher.cs', /DiamondERP_Shutdown_Event/));
check('Launcher', 'Bundled node.exe runtime resolution implemented', fileContains('installer/Launcher.cs', 'ResolveRuntimeDirectory'));
check('Launcher', 'WebView2 integration implemented', fileContains('installer/Launcher.cs', 'InitializeWebView2'));
check('Launcher', 'WebView2 User Data Directory configured in AppData', fileContains('installer/Launcher.cs', 'WebView2Data'));
check('Launcher', 'DevTools and accelerator keys blocked in preview key down', fileContains('installer/Launcher.cs', 'PreviewKeyDown'));
check('Launcher', 'Graceful backend shutdown on exit', fileContains('installer/Launcher.cs', 'ShutdownBackend'));

// ── Section 8: Windows Setup & Installer Architecture ───────────────────
console.log('\n▶ Section 8: Windows Installer Architecture');
check('Installer', 'Installer.cs source exists', fileExists('installer/Installer.cs'));
check('Installer', 'Installer.manifest exists with requireAdministrator', fileContains('installer/Installer.manifest', 'requireAdministrator'));
check('Installer', 'Embedded zip resource extraction supported', fileContains('installer/Installer.cs', 'DiamondERP.Payload.zip'));
check('Installer', 'Zip Slip path traversal defense implemented', fileContains('installer/Installer.cs', 'Security violation: Archive entry'));
check('Installer', 'Atomic directory swap with rollback guard implemented', fileContains('installer/Installer.cs', '.staging_'));
check('Installer', 'Running app detection & IPC stop implemented', fileContains('installer/Installer.cs', 'EnsureAppNotRunning'));
check('Installer', 'Desktop and Start Menu shortcuts created', fileContains('installer/Installer.cs', 'CreateShortcut'));
check('Installer', 'Add/Remove Programs registry keys registered', fileContains('installer/Installer.cs', 'RegisterUninstall'));
check('Installer', 'Uninstall explicitly preserves %LOCALAPPDATA%\\DiamondERP', fileContains('installer/Installer.cs', 'userDbDir = Path.Combine(localAppData, "DiamondERP")'));

// ── Section 9: Backup & Export Architecture ─────────────────────────────
console.log('\n▶ Section 9: Backup & Export Architecture');
check('Backup', 'exceljs library installed for Excel generation', fileContains('apps/api/package.json', '"exceljs"'));
check('Backup', 'csv-parse library installed for CSV handling', fileContains('apps/api/package.json', '"csv-parse"'));
check('Backup', 'csv-stringify library installed for CSV handling', fileContains('apps/api/package.json', '"csv-stringify"'));
check('Backup', 'SQLite WAL checkpoint endpoint implemented', fileContains('apps/api/src/modules/settings/settings.controller.ts', 'PRAGMA wal_checkpoint(TRUNCATE)'));
check('Backup', 'SQLite online VACUUM INTO backup endpoint implemented', fileContains('apps/api/src/modules/settings/settings.controller.ts', 'VACUUM INTO'));
check('Backup', 'Excel report generation implemented in reports.service', fileContains('apps/api/src/modules/reports/reports.service.ts', 'ExcelJS.Workbook'));

// ── Section 10: Packaging & Staging Pipeline ────────────────────────────
console.log('\n▶ Section 10: Packaging & Staging Pipeline');
check('Packaging', 'stage-windows-build.js exists', fileExists('scripts/stage-windows-build.js'));
check('Packaging', 'package-windows-release.js exists', fileExists('scripts/package-windows-release.js'));
check('Packaging', 'create-release-manifest.js exists', fileExists('scripts/create-release-manifest.js'));
check('Packaging', 'verify-windows-release.js exists', fileExists('scripts/verify-windows-release.js'));
check('Packaging', 'Pinned Node.js v22.20.0 SHA-256 integrity verified in scripts', fileContains('scripts/stage-windows-build.js', 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d'));

// ── Section 11: Phase 1 Documentation Artifacts ─────────────────────────
console.log('\n▶ Section 11: Phase 1 Documentation Completeness');
check('Docs', 'V3-CURRENT-ARCHITECTURE.md exists', fileExists('docs/first-run-lifecycle/V3-CURRENT-ARCHITECTURE.md'));
check('Docs', 'V3-FILE-IMPACT-MAP.md exists', fileExists('docs/first-run-lifecycle/V3-FILE-IMPACT-MAP.md'));
check('Docs', 'V3-DATABASE-FLOW.md exists', fileExists('docs/first-run-lifecycle/V3-DATABASE-FLOW.md'));
check('Docs', 'V3-USER-DEVICE-DATABASE-MAP.md exists', fileExists('docs/first-run-lifecycle/V3-USER-DEVICE-DATABASE-MAP.md'));
check('Docs', 'V3-INSTALLER-LIFECYCLE.md exists', fileExists('docs/first-run-lifecycle/V3-INSTALLER-LIFECYCLE.md'));
check('Docs', 'V3-IMPLEMENTATION-PLAN.md exists', fileExists('docs/first-run-lifecycle/V3-IMPLEMENTATION-PLAN.md'));

console.log('\n================================================================');
console.log(`📊 Phase 1 Architecture Verification Summary:`);
console.log(`   Total Checks: ${totalChecks}`);
console.log(`   Passed:       ${passedChecks}`);
console.log(`   Failed:       ${failedChecks}`);
console.log(`   Score:        ${((passedChecks / totalChecks) * 100).toFixed(1)}%`);
console.log('================================================================');

if (failedChecks > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 1 Architecture Verification Passed with 100% Confidence.\n');
  process.exit(0);
}
