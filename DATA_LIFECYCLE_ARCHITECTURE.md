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

## End-to-End Architectural Data Flows

### 1. Profile → DB → Prisma → API → Frontend
```text
Profile ID / Profile Code
        ↓
DatabaseContextService.assertValidBusinessDatabaseContext()
        ↓
system.db `DatabaseRegistry` (canonicalPath, unique, active)
        ↓
Prisma Client Cache (`file:${canonicalPath}`)
        ↓
API Controller / Service
        ↓
Frontend (`X-Profile-Id` header + `profileChanged` custom event)
        ↓
UI Unmount/Remount via `key={profileId}` + isolated cache refetch
```

### 2. DB → Backup
```text
Customer Backup Request
        ↓
DatabaseContextService.getDatabaseForProfile()
        ↓
Authoritative BackupService (lock acquired, WAL checkpoint)
        ↓
VACUUM INTO staging
        ↓
SQLite header + PRAGMA integrity_check + PRAGMA foreign_key_check + SHA-256
        ↓
Move to `backups/` + register BackupRecord (status = 'VERIFIED')
```

### 3. DB → CSV & DB → XLSX
```text
Export Request
        ↓
DatabaseContextService.getDatabaseForProfile()
        ↓
Materialize In-Memory Snapshot Map via EXPORT_ENTITY_REGISTRY
        ↓
Generate CSV files (ORDER BY primary key, explicit headers)
        ↓
Generate business_data.xlsx (identical materialized rows)
        ↓
SemanticVerificationService: Live DB ↔ CSV ↔ XLSX
        ↓
Atomic Write of export-manifest.json (.tmp → fsync → rename)
```

### 4. DB → Preservation → Uninstall
```text
Windows Uninstall / Preservation Request
        ↓
PreservationService: Multi-Profile Discovery
        ↓
Iterate each Profile:
  - Take VERIFIED DB Backup
  - Materialize Snapshot Map
  - Generate CSV & XLSX
  - Run Semantic Verification (DB ↔ CSV ↔ XLSX)
  - Write profile-manifest.json
        ↓
Write Root preservation-manifest.json (atomic)
        ↓
UninstallPreflightService verifies entire package
        ↓
Issue One-Time Token (`uninstall-authorization.json`)
        ↓
Windows Uninstaller consumes token → Removes binaries → Preserves customer AppData
```

### 5. Uninstall → Reinstall → Recovery
```text
Reinstall / Startup
        ↓
Detect Existing AppData (`system.db`, `databases/`, `backups/`)
        ↓
RecoveryService.classifyReinstallDatabases():
  - KNOWN_PROFILE
  - KNOWN_DATABASE
  - ORPHAN_DATABASE
  - ORPHAN_PROFILE
  - MISSING_DATABASE
  - CORRUPTED_DATABASE
  - DUPLICATE_DATABASE
  - UNSUPPORTED_DATABASE
        ↓
Valid Existing Data?
  → Reconnect Existing Profile / Database (never create blank duplicate)
Orphan Data?
  → Require Explicit Attachment Preview & User Confirmation
```

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