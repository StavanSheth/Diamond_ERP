# DIAMOND ERP V3 — PHASE 5 FILE IMPACT DOCUMENT

## 1. Summary of Changes
- **Files Created**: 23
- **Files Modified**: 14
- **Files Deleted**: 0

---

## 2. Created Files

| File | Action | Reason / Phase 5 Requirement | Dependencies | Risk | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `packages/contracts/src/dto/backup.ts` | CREATED | Defines DTOs for backup creation, record listing, manifest JSON, and verification | None | Low | `phase5-backup.test.ts` |
| `packages/contracts/src/dto/recovery.ts` | CREATED | Defines DTOs for candidate discovery, inspection, staged restore, and reinstall detection | `lifecycle.ts`, `onboarding.ts` | Low | `phase5-recovery.test.ts`, `phase5-reinstall.test.ts` |
| `packages/contracts/src/dto/export.ts` | CREATED | Defines DTOs for CSV/XLSX business exports, manifests, and bundle verification | None | Low | `phase5-export-uninstall.test.ts` |
| `packages/contracts/src/dto/uninstall.ts` | CREATED | Defines DTOs for uninstall preflight status and pre-uninstall backup bundles | None | Low | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/backup/backup.service.ts` | CREATED | Implements atomic `.partial` staging, WAL checkpoint, SHA-256 calculation, manifest creation, and mutex concurrency | `paths.ts`, `prisma.ts`, `database-validation.service.ts` | Medium | `phase5-backup.test.ts` (12 tests) |
| `apps/api/src/modules/system/backup/backup.controller.ts` | CREATED | Exposes REST endpoints for backup creation, listing, inspection, and verification | `backup.service.ts` | Low | `phase5-backup.test.ts` |
| `apps/api/src/modules/system/backup/backup.routes.ts` | CREATED | Express router mounting `/api/system/backup` endpoints with authorization | Express, `backup.controller.ts` | Low | `phase5-backup.test.ts` |
| `apps/api/src/modules/system/backup/index.ts` | CREATED | Module entry point | `backup.service.ts` | Low | Unit & integration tests |
| `apps/api/src/modules/system/recovery/recovery.service.ts` | CREATED | Implements bounded candidate discovery, staged restore, rollback backup, and reinstall detection | `paths.ts`, `prisma.ts`, `backup.service.ts` | High | `phase5-recovery.test.ts` (7 tests), `phase5-reinstall.test.ts` (2 tests) |
| `apps/api/src/modules/system/recovery/recovery.controller.ts` | CREATED | Exposes REST endpoints for discovery, inspection, restore staging, and confirmation | `recovery.service.ts` | Low | `phase5-recovery.test.ts` |
| `apps/api/src/modules/system/recovery/recovery.routes.ts` | CREATED | Express router mounting `/api/system/recovery` endpoints | Express, `recovery.controller.ts` | Low | `phase5-recovery.test.ts` |
| `apps/api/src/modules/system/recovery/index.ts` | CREATED | Module entry point | `recovery.service.ts` | Low | Unit & integration tests |
| `apps/api/src/modules/system/export/export.service.ts` | CREATED | Implements sanitized business data CSV export, secret stripping, and formula injection sanitization | `csv-stringify`, `paths.ts`, `prisma.ts` | Medium | `phase5-export-uninstall.test.ts` (4 tests) |
| `apps/api/src/modules/system/export/export.controller.ts` | CREATED | Exposes REST endpoints for business export and export verification | `export.service.ts` | Low | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/export/export.routes.ts` | CREATED | Express router mounting `/api/system/export` endpoints | Express, `export.controller.ts` | Low | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/export/index.ts` | CREATED | Module entry point | `export.service.ts` | Low | Unit & integration tests |
| `apps/api/src/modules/system/uninstall/uninstall-preflight.service.ts` | CREATED | Answers preflight checks on user data preservation and produces full verified pre-uninstall backup bundles | `paths.ts`, `prisma.ts`, `backup.service.ts` | Medium | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/uninstall/uninstall.controller.ts` | CREATED | Exposes REST endpoints for uninstall preflight and backup | `uninstall-preflight.service.ts` | Low | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/uninstall/uninstall.routes.ts` | CREATED | Express router mounting `/api/system/uninstall` endpoints | Express, `uninstall.controller.ts` | Low | `phase5-export-uninstall.test.ts` |
| `apps/api/src/modules/system/uninstall/index.ts` | CREATED | Module entry point | `uninstall-preflight.service.ts` | Low | Unit & integration tests |
| `apps/web/src/services/api/backup.api.ts` | CREATED | Frontend API client for backup operations | `apiClient` | Low | `SettingsPage.tsx` |
| `apps/web/src/services/api/recovery.api.ts` | CREATED | Frontend API client for recovery candidate discovery and staged restore | `apiClient` | Low | `OnboardingWizard.tsx`, `SettingsPage.tsx` |
| `apps/api/prisma/migrations/20260918140000_add_phase5_backup_recovery/migration.sql` | CREATED | SQLite migration script creating `BackupRecord` and `RestoreRecord` tables with indices | SQLite | High | Integration tests & migration script |
| `apps/api/src/tests/phase5-backup.test.ts` | CREATED | Automated test suite validating atomic backups, hash validation, tamper detection, and cleanup | Vitest | Low | 12 tests |
| `apps/api/src/tests/phase5-recovery.test.ts` | CREATED | Automated test suite validating candidate discovery, staged restore, and rollback backup | Vitest | Low | 7 tests |
| `apps/api/src/tests/phase5-export-uninstall.test.ts` | CREATED | Automated test suite validating business data CSV export, secret stripping, and uninstall backup | Vitest | Low | 4 tests |
| `apps/api/src/tests/phase5-reinstall.test.ts` | CREATED | Automated test suite validating reinstall detection and multi-choice decision workflows | Vitest | Low | 2 tests |

---

## 3. Modified Files

| File | Action | Reason / Phase 5 Requirement | Dependencies | Risk | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/prisma/schema.prisma` | MODIFIED | Added `BackupRecord` and `RestoreRecord` models and relations to `Installation` | Prisma | High | `phase5-backup.test.ts`, `phase5-recovery.test.ts` |
| `packages/contracts/src/dto/index.ts` | MODIFIED | Exported `backup`, `recovery`, `export`, and `uninstall` DTOs | None | Low | Monorepo build |
| `packages/contracts/src/dto/onboarding.ts` | MODIFIED | Added optional `reinstallRecovery?: ReinstallDetectionDto` to `OnboardingStateResponseDto` | `recovery.ts` | Low | `phase5-reinstall.test.ts` |
| `apps/api/src/infrastructure/paths.ts` | MODIFIED | Added `getRecoveryDir()`, `getExportDir()`, `getRestoreStagingDir()` and registered in `ensureAllDataDirs()` | Node path/os | Low | Unit & path tests |
| `apps/api/src/modules/system/system.routes.ts` | MODIFIED | Mounted `/backup`, `/recovery`, `/export`, and `/uninstall` route modules | Express | Low | All Phase 5 API tests |
| `apps/api/src/modules/system/onboarding/onboarding-authorization.service.ts` | MODIFIED | Added Phase 5 operations (`BACKUP_CREATE`, `BACKUP_VIEW`, `RECOVERY_DISCOVER`, `RECOVERY_RESTORE`, `EXPORT_DATA`, `UNINSTALL_PREFLIGHT`) to authorization matrix | Security model | Medium | `phase4-onboarding-security.test.ts`, Phase 5 tests |
| `apps/api/src/modules/system/onboarding/onboarding.service.ts` | MODIFIED | Integrated `recoveryService.detectReinstallState()` in onboarding status and `backupService.cleanupPartialBackups()` in app initialization | `recovery.service.ts`, `backup.service.ts` | Medium | `phase5-reinstall.test.ts`, Onboarding tests |
| `apps/web/src/services/api.ts` | MODIFIED | Re-exported `backup` and `recovery` API services | `backup.api.ts`, `recovery.api.ts` | Low | Frontend build |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | MODIFIED | Added previous installation detection banner with explicit multi-choice cards (Continue, Restore, Start New) | React, `recovery.api.ts` | Medium | Web build & unit tests |
| `apps/web/src/pages/SettingsPage.tsx` | MODIFIED | Added Section 7 with Backup List, Create Verified Backup, Staged Restore confirmation modal with rollback notice, and Uninstall Data Preservation card | React, `backup.api.ts`, `recovery.api.ts` | Medium | Web build & unit tests |

---

## 4. Deleted Files
- **None**. No files were deleted. Existing architecture and files preserved.
