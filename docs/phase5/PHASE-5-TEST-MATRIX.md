# Diamond ERP V3 — Phase 5 Test Matrix

## 1. Automated Test Suites Overview

| Test Suite File | Type | Tests | Status | Key Coverage |
| :--- | :---: | :---: | :---: | :--- |
| `apps/api/src/tests/phase5-backup.test.ts` | Vitest Unit/Integration | 13 | PASS | WAL checkpoint (`TRUNCATE`), SQLite `VACUUM INTO`, PRAGMA integrity_check, SHA-256 manifest, anti-spoofing (`system.db`/`template.db` rejection), concurrency lock, stale `.partial` cleanup. |
| `apps/api/src/tests/phase5-recovery.test.ts` | Vitest Unit/Integration | 7 | PASS | Recovery candidate discovery, 7-layer validation, ownership classification, confirmation verification, foreign DB protection. |
| `apps/api/src/tests/phase5-restore-atomicity.test.ts` | Vitest Unit/Integration | 5 | PASS | Mandatory rollback backup, atomic swap via `.swap_old_<timestamp>`, post-restore integrity check, automatic rollback on corrupt candidate, crash recovery reconciliation. |
| `apps/api/src/tests/phase5-export-formats.test.ts` | Vitest Unit/Integration | 4 | PASS | CSV, XLSX, and standalone SQLite exports; manifest metadata; rejection of `system.db` and `template.db`. |
| `apps/api/src/tests/phase5-export-uninstall.test.ts` | Vitest Unit/Integration | 5 | PASS | Pre-uninstall preflight evaluation, all-or-nothing pre-uninstall backup bundle, fail-fast on missing/corrupt databases. |
| `apps/api/src/tests/phase5-reinstall.test.ts` | Vitest Unit/Integration | 4 | PASS | Reinstall state classification, multi-choice candidate selection, non-destructive fresh install (new UUID v4 installation ID, template DB provisioning, original DB preservation). |
| `scripts/test-phase5-release-readiness.js` | Node E2E Harness | 19 | PASS | Bundled Node independence, silent installer execution, loopback port binding, health check, ERP workflows, SQLite upgrade persistence, AppData preservation on uninstall. |
| `scripts/validate-packaging-readiness.js` | Build Gate | 41 | PASS | Desktop binaries, runtime staging, dependency isolation, Prisma engine staging, offline frontend assets, artifact cleanliness. |
| `scripts/test-phase7-launcher.js` | Integration Harness | 35 | PASS | Static launcher metadata, bundled runtime independence, real startup, single instance mutex, crash handling, restart persistence. |
| `scripts/test-phase8-webview2.js` | Integration Harness | 41 | PASS | WebView2 runtime detection, security settings, user data directory isolation, SPA routing, offline execution, persistence across restarts. |
| `scripts/test-phase9-installer.js` | Integration Harness | 99 | PASS | Fresh installation, ERP database workflow, upgrade execution, data preservation across upgrade, uninstall AppData preservation, reinstall data preservation. |
| `scripts/test-phase10-final-release.js` | Release Harness | 84 | PASS | Full release verification, setup packaging, SHA256 cryptographic check, clean machine execution, SQLite data persistence, offline loopback execution. |
| `scripts/test-phase1-first-run-audit.js` | Architecture Harness | 93 | PASS | Architecture verification across repository, backend, frontend, auth, device, database, launcher, installer, and docs. |

---

## 2. Vitest Test Execution Metrics

- **API Test Files**: 21 / 21 passed (264 passed, 0 failed, 7 skipped)
- **Web Test Files**: 3 / 3 passed (20 passed, 0 failed)
- **TypeScript Typecheck**: 0 errors across all workspaces (`npm run typecheck`)
- **Total Test Checks**: >440 automated checks executed and passing.
