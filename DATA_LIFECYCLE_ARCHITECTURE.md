# DiamondERP V3 - Data Lifecycle Architecture

## Core Invariants

- **I1: One Profile = One Physical DB**: 1 profile = exactly 1 physical `.db` file; 1 `.db` file = exactly 1 profile.
- **I2: System Control Plane**: `system.db` = authoritative control/registry database (SSOT).
- **I3: No Fallback DB Guessing**: No silent fallback to `Stavan.db`, first registry, first active DB, or directory scans.
- **I4: Missing Registry Fails Closed**: Missing or invalid registry throws explicit lifecycle errors; never automatically creates DB.
- **I5: Profile Switching Never Creates DB**: Switching validates existing profile & database context; returns `PROFILE_NOT_FOUND` if absent.
- **I6: Verified Safety Backup Before Deletion**: Physical DB deletion is strictly blocked unless a verified `PROFILE_DELETE` backup succeeds.
- **I7: Single Authoritative Export Engine**: Normal export and uninstall preservation use the identical `ExportService` + `EXPORT_ENTITY_REGISTRY`.
- **I8: Semantic Equality**: Exports are verified only when DB == CSV, DB == XLSX, and CSV == XLSX at row and field semantics.
- **I9: Local Exports Unencrypted**: Local CSV and XLSX files are completely unencrypted and directly openable in Excel and LibreOffice.
- **I10: No Import / No Cloud Sync**: No Excel/CSV import and no cloud sync infrastructure exists in the application; 100% local-first.
- **I11: Multi-Profile Preservation**: Every profile is preserved independently under `profiles/<ProfileCode>/`; no single `primaryDb` authority.
- **I12: Uninstall Preservation Safety Gate**: Customer data detection initiates preservation; unverified preservation blocks Windows uninstall.
- **I13: AppData Customer Data Survives Uninstall**: Windows installer removes binaries and shortcuts but preserves AppData databases and backups.
- **I14: Reinstall Discovery Taxonomy**: Existing databases classified into granular taxonomy (`KNOWN_PROFILE`, `ORPHAN_DATABASE`, etc.) without overwrite.

---

## Resolution Chain

```text
HTTP Request (X-Profile-Id / X-Profile-Code)
  │
  ▼
Profile Middleware (AsyncLocalStorage requestContext)
  │
  ▼
DatabaseContextService.assertValidBusinessDatabaseContext(profileIdOrCode)
  │
  ▼
system.db: Profile record (isActive=true) + DatabaseRegistry record (status=ACTIVE)
  │
  ▼
canonicalPath (validated, Windows case-insensitive uniqueness, reject system.db / template.db)
  │
  ▼
Prisma client (profile-scoped client cache with LRU eviction and connection pooling)
  │
  ▼
Profile SQLite .db file (PRAGMA journal_mode=WAL, foreign_keys=ON)
```

---

## Authoritative Services

| Responsibility | Service | File |
|---|---|---|
| DB context & path resolution | `DatabaseContextService` | `infrastructure/database/database-context.service.ts` |
| Client pool & connection manager | `prisma.ts` | `infrastructure/database/prisma.ts` |
| Authoritative DB provisioning | `DatabaseProvisioningService` | `modules/system/database/database-provisioning.service.ts` |
| Registry management & uniqueness | `DatabaseRegistryService` | `modules/system/database/database-registry.service.ts` |
| Comprehensive DB health | `DatabaseHealthService` | `modules/system/database/database-health.service.ts` |
| Safety backup engine | `BackupService` | `modules/system/backup/backup.service.ts` |
| Single export engine | `ExportService` | `modules/system/export/export.service.ts` |
| Authoritative export schema | `EXPORT_ENTITY_REGISTRY` | `modules/system/export/export-entity-registry.ts` |
| Semantic verification (DB ↔ CSV ↔ XLSX) | `SemanticVerificationService` | `modules/system/export/semantic-verification.service.ts` |
| Multi-profile preservation | `PreservationService` | `modules/system/preservation/preservation.service.ts` |
| Uninstall safety gate & tokens | `UninstallPreflightService` | `modules/system/uninstall/uninstall-preflight.service.ts` |
| Transactional data migration | `DataLocationService` | `infrastructure/data/data-location.service.ts` |
| Recovery & reinstall classification | `RecoveryService` | `modules/system/recovery/recovery.service.ts` |

---

## Export & Verification Lifecycle

```text
EXPORT FLOW (Normal & Preservation):
  ExportService.exportBusinessData() / exportProfileToFilesystem()
    │
    ├── Resolve Profile & DB Context (via DatabaseContextService)
    ├── Query all exportable entities via EXPORT_ENTITY_REGISTRY
    ├── Write entity CSVs (ordered by primary/business key, sensitive columns stripped)
    ├── Write single multi-sheet business_data.xlsx
    ├── Write export-manifest.json with SHA-256 hashes atomically via .tmp
    │
    ▼
  SemanticVerificationService:
    ├── DB ↔ CSV semantic equality
    ├── DB ↔ XLSX semantic equality
    └── CSV ↔ XLSX semantic equality (verifyCsvEqualsXlsx)
        └── Returns VERIFIED only if 0 discrepancies found
```

---

## Backup Lifecycle

```text
BackupService.createBackup():
  1. Resolve source DB via DatabaseContextService
  2. Reject system.db and template.db
  3. Assert disk space available (size * 2 + 10MB)
  4. Acquire per-canonical-path concurrency lock
  5. Checkpoint SQLite WAL (PRAGMA wal_checkpoint(PASSIVE))
  6. Execute atomic VACUUM INTO staging file
  7. Validate SQLite integrity (PRAGMA integrity_check == 'ok')
  8. Compute SHA-256 hash
  9. Atomically publish to final destination with manifest
  10. Record BackupRecord in system.db with status=VERIFIED

Backup Types:
  - MANUAL: User-triggered snapshot
  - PROFILE_DELETE: Mandatory safety backup before deleting physical database
  - UNINSTALL: Mandatory safety backup during uninstall preservation
  - PRE_RESTORE: Safety snapshot before staged restore overwrite
```

---

## Profile Deletion Lifecycle

```text
DELETE PROFILE REQUEST:
  ├── deleteDatabase = false
  │     │
  │     ├── Evict Prisma client from memory
  │     ├── Mark DatabaseRegistry status = 'ORPHANED'
  │     ├── Delete user associations and Profile record from system.db
  │     └── Physical .db file is PRESERVED on disk
  │
  └── deleteDatabase = true
        │
        ├── Resolve exact DatabaseRegistry path via DatabaseContextService
        ├── Reject system.db, template.db, and reserved databases
        ├── Create mandatory PROFILE_DELETE backup
        │     └── If backup fails -> ABORT (do NOT delete anything)
        ├── Evict Prisma client from memory
        ├── Safely unlink .db, -wal, and -shm files
        ├── Verify files no longer exist on disk
        ├── Delete DatabaseRegistry entry
        └── Delete Profile record from system.db
```

---

## Migration State Machine

```text
States: IDLE -> PREPARING -> BACKING_UP -> COPYING -> VERIFYING -> COMMITTING -> COMPLETED
Failure: any state -> ROLLING_BACK -> FAILED

State persisted to: %LOCALAPPDATA%/DiamondERP/migration-state.json

Rollback guarantees:
  - Restores original runtime data root
  - Restores all original DatabaseRegistry canonical paths from pre-migration snapshot
  - Verifies SQLite integrity using PRAGMA integrity_check and PRAGMA foreign_key_check
```

---

## Multi-Profile Preservation Structure

```text
DiamondERP-Preservation-YYYYMMDD-HHMMSS/
├── preservation-manifest.json
├── manifest.json (compatibility artifact)
└── profiles/
    ├── ProfileA/
    │   ├── database/
    │   │   └── ProfileA_backup.db
    │   ├── csv/
    │   │   ├── Stock.csv
    │   │   ├── Party.csv
    │   │   └── ...
    │   └── business_data.xlsx
    └── ProfileB/
        ├── database/
        │   └── ProfileB_backup.db
        ├── csv/
        │   └── ...
        └── business_data.xlsx
```

---

## Forbidden Patterns & Deprecations

| Forbidden Pattern | Reason | Remediated Status |
|---|---|---|
| `findFirst()` for database selection | Non-deterministic, risks profile cross-talk | Replaced by `databaseContextService.resolveDatabaseContext` |
| `registries[0]` or `databases[0]` | Implicitly chooses first DB without verification | Replaced by strict profile-to-registry mapping |
| Guessing `${profileCode}.db` | Bypasses registry authority | Removed from all services and controllers |
| Excel/CSV import | Vulnerability-prone, out-of-scope for desktop ERP | Completely removed from API, UI, routes, contracts |
| Cloud sync / Google Sheets sync | Cloud-dependent, violates local-first invariant | Removed from UI and configuration |
| Export encryption | Prevents opening in standard desktop spreadsheet tools | Exports are pure standard unencrypted CSV/XLSX |
| Automatic DB creation on switch | Violates profile authorization and isolation | Profile switch returns `PROFILE_NOT_FOUND` if non-existent |