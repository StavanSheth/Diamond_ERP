# DiamondERP V3 - Data Lifecycle Architecture

## Core Invariants

- 1 profile = exactly 1 physical .db file
- 1 .db file = exactly 1 profile
- system.db = authoritative profile registry (SSOT)
- DB = source of truth; CSV/XLSX = verified snapshots only
- Normal export uses same engine as preservation (ExportService + ExportEntityRegistry)
- Physical DB deletion requires verified PROFILE_DELETE backup (failure blocks deletion)
- Uninstall preservation is automatic; failure blocks uninstall

---

## Resolution Chain

`
HTTP Request (x-profile-code header)
  Profile Middleware
  DatabaseContextService.getDatabaseForProfileCode()
  system.db Profile record + DatabaseRegistry record
  canonicalPath (validated, ownership-checked)
  Prisma client (profile-scoped)
  Profile SQLite .db file
  Business data
`

---

## Authoritative Services

| Responsibility | Service | File |
|---|---|---|
| DB path resolution | DatabaseContextService | infrastructure/database/database-context.service.ts |
| Profile registry | system.db | infrastructure/database/prisma.ts |
| Profile provisioning | DatabaseProvisioningService | modules/system/database/database-provisioning.service.ts |
| Registry management | DatabaseRegistryService | modules/system/database/database-registry.service.ts |
| DB health | DatabaseHealthService | modules/system/database/database-health.service.ts |
| Backup | BackupService | modules/system/backup/backup.service.ts |
| Export (all flows) | ExportService + ExportEntityRegistry | modules/system/export/ |
| Semantic verification | SemanticVerificationService | modules/system/export/semantic-verification.service.ts |
| Preservation | PreservationService | modules/system/preservation/ |
| Uninstall preflight | UninstallPreflightService | modules/system/uninstall/ |
| Data migration | DataLocationService | infrastructure/data/data-location.service.ts |
| Recovery/reinstall | RecoveryService | modules/system/recovery/ |

---

## Export Architecture

`
ExportEntityRegistry (export-entity-registry.ts)
  Single source of truth for all exportable entities.
  Used by: ExportService, PreservationService, SemanticVerificationService.

ExportService.exportBusinessData()
  1. Resolves profile DB via DatabaseContextService
  2. Queries every entity via ExportEntityRegistry
  3. Writes CSV (ORDER BY pk) + XLSX (same dataset)
  4. SemanticVerificationService verifies: DB == CSV == XLSX
  5. Returns ExportResponseDto (hashes, row counts, verification status)

SettingsController.exportExcel() / exportCsv()
  Delegates to ExportService (NOT a separate implementation)
`

---

## Backup Architecture

`
BackupService.createBackup()
  1. Resolve source DB via DatabaseContextService
  2. Assert source is NOT system.db or template.db
  3. Acquire per-path concurrency lock
  4. WAL checkpoint (PASSIVE)
  5. VACUUM INTO staging file
  6. PRAGMA integrity_check
  7. SHA-256 hash
  8. Move to final backup dir
  9. Write BackupRecord to system.db

BackupType: FULL | SNAPSHOT | MANUAL | PRE_RESTORE | UNINSTALL | PROFILE_DELETE | PRE_DELETE
`

---

## Migration State Machine (Phase 25)

`
States: IDLE > PREPARING > BACKING_UP > COPYING > VERIFYING > COMMITTING > COMPLETED
Failure: any state > ROLLING_BACK > FAILED

State persisted to: %LOCALAPPDATA%/DiamondERP/migration-state.json
Startup: reads state file - detects interrupted migrations for deterministic recovery

Rollback restores:
  - Runtime data root (setCustomDataRoot)
  - ALL DatabaseRegistry canonical paths (snapshot taken before COPYING begins)

Verification: real PRAGMA integrity_check, not 16-byte header only
`

---

## Profile Lifecycle

`
CREATE: DatabaseProvisioningService.provisionBlankDatabase()
  template.db copied to code.db, DatabaseRegistry created, Profile = READY

SWITCH: DatabaseContextService.getDatabaseForProfileCode()
  Frontend calls window.location.reload() (full React Query cache bust)

DELETE (metadata only): DatabaseRegistry status = ORPHANED, Profile removed, .db retained

DELETE (with DB): PROFILE_DELETE backup REQUIRED
  Backup failure throws - deletion does NOT proceed

ORPHAN RECOVERY: RecoveryService detects .db without registry - explicit recovery flow
`

---

## Forbidden Patterns

| Pattern | Reason |
|---|---|
| findFirst() for database selection | Non-deterministic, hides conflicts |
| registries[0] or databases[0] | Same issue |
| profileCode.db path inference | Bypasses registry authority |
| console.warn + continue on backup failure before deletion | P0 safety violation |
| Separate export implementation per controller | Two-system drift |
| Header-only SQLite validation | Misses page-level corruption |
| Registry paths not restored on migration rollback | DB points at wrong path after rollback |