# Diamond ERP V3 — Phase 5 File Impact Map

## 1. Backend Modifications & Core Services

### Primary Domain Modules
- **`apps/api/src/modules/system/backup/backup.service.ts`**:
  - Implements atomic staging under `backup-staging/<backupId>/`.
  - SQLite snapshotting via `PRAGMA wal_checkpoint(TRUNCATE)` and native `VACUUM INTO`.
  - Staging verification, manifest generation, SHA-256 calculation, and atomic directory rename to `backups/<profileCode>/<backupId>/`.
  - In-memory concurrency locks (`activeLocks`) to serialize parallel backup operations on the same database.
  - Stale `.partial` and `.staging` artifact purging.

- **`apps/api/src/modules/system/recovery/recovery.service.ts`**:
  - 7-layer validation engine for candidate databases.
  - Anti-spoofing guards (rejection of `system.db` and `template.db`).
  - Mandatory verified rollback backup of target database prior to swap.
  - Atomic Windows rename swap protocol (`.swap_old_<timestamp>`).
  - Automatic rollback on candidate verification failure.
  - Startup crash reconciliation (`reconcileInterruptedRestores`).
  - Reinstall detection (`detectReinstallState`) and non-destructive fresh installation (`startFreshInstallation`).

- **`apps/api/src/modules/system/export/export.service.ts`**:
  - Full business data export across CSV, XLSX, and SQLite formats.
  - Complete schema model classification.
  - Fail-closed validation (rejection of `system.db`/`template.db`).
  - Automatic exclusion of sensitive security fields (`passwordHash`, `pinHash`, tokens).
  - Export manifest generation with row counts and SHA-256 hashes.

- **`apps/api/src/modules/system/uninstall/uninstall-preflight.service.ts`**:
  - Evaluates system state, database counts, integrity, and pending operations prior to uninstallation.
  - Generates unified pre-uninstall backup bundle covering all active databases.
  - Fails fast and blocks uninstall if any database fails validation.

### Infrastructure & Startup
- **`apps/api/src/index.ts`**:
  - Registers startup crash reconciliation hook on boot (`reconcileInterruptedRestores()`).
- **`apps/api/src/infrastructure/paths.ts`**:
  - Authoritative path resolver for backups, staging directories, exports, databases, and config.

---

## 2. Windows Desktop & Installer Integration

- **`installer/Installer.cs`**:
  - Silent installation, upgrade, and uninstallation modes.
  - Add/Remove Programs registry key management.
  - Strict preservation of `%LOCALAPPDATA%\DiamondERP` during uninstallation.
- **`installer/Launcher.cs`**:
  - Standalone desktop boot without external dependencies.
  - Single-instance Win32 Mutex protection.
  - WebView2 profile isolation in `%LOCALAPPDATA%\DiamondERP\WebView2Data`.

---

## 3. Contracts & Shared DTOs

- **`packages/contracts/src/dto/recovery.ts`**:
  - DTOs for `RecoveryCandidate`, `InspectCandidateInput`, `RestoreConfirmation`, `ReinstallState`.
- **`packages/contracts/src/dto/export.ts`**:
  - DTOs for `ExportInput`, `ExportManifest`, `ExportResult`.
- **`packages/contracts/src/dto/uninstall.ts`**:
  - DTOs for `UninstallPreflightResult`, `UninstallBackupResult`.

---

## 4. Frontend Integration

- **`apps/web/src/services/api/recovery.api.ts`**:
  - API client methods for recovery discovery, inspection, restore confirmation, and reinstall handling.
- **`apps/web/src/components/onboarding/OnboardingWizard.tsx`**:
  - Enforces explicit user confirmation before database attachment or continuation.

---

## 5. Automated Test Suites

- `apps/api/src/tests/phase5-backup.test.ts`
- `apps/api/src/tests/phase5-recovery.test.ts`
- `apps/api/src/tests/phase5-restore-atomicity.test.ts`
- `apps/api/src/tests/phase5-export-formats.test.ts`
- `apps/api/src/tests/phase5-export-uninstall.test.ts`
- `apps/api/src/tests/phase5-reinstall.test.ts`
- `scripts/test-phase5-release-readiness.js`
- `scripts/validate-packaging-readiness.js`
- `scripts/test-phase7-launcher.js`
- `scripts/test-phase8-webview2.js`
- `scripts/test-phase9-installer.js`
- `scripts/test-phase10-final-release.js`
- `scripts/test-phase1-first-run-audit.js`
