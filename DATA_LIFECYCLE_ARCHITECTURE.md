# DIAMOND ERP V3 — DATA LIFECYCLE & DESKTOP ARCHITECTURE (SSOT)

> **AUTHORITATIVE ARCHITECTURAL SPECIFICATION**  
> This document defines the single source of truth (SSOT) for DiamondERP V3 data lifecycle, profile ownership, database management, backup, export, preservation, uninstallation, reinstallation, and desktop runtime constraints.  
> Any change that violates the invariants described herein breaks system consistency and desktop reliability.

---

## 1. Core System Architecture

DiamondERP operates as a desktop Windows ERP using:
- **WPF / C# Desktop Launcher & Installer** (WebView2 embedded container)
- **React Frontend** (Vite SPA)
- **Node.js + Express API**
- **Prisma ORM**
- **SQLite** physical database engines:
  - **`system.db`**: Central installation, device, database registry, profile metadata, audit trails, and backup/restore ledger.
  - **`[profileCode].db`**: Dedicated, isolated physical database for business work-product data (Diamonds, Inventory, Transactions, Parties, Ledgers, Repairs, etc.).

```
                         DIAMOND ERP SYSTEM
                                 │
                             system.db
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     │                           │                           │
     ▼                           ▼                           ▼
 Profile A                   Profile B                   Profile C
     │                           │                           │
DatabaseRegistry            DatabaseRegistry            DatabaseRegistry
     │                           │                           │
     ▼                           ▼                           ▼
 physical A.db               physical B.db               physical C.db
     │                           │                           │
     ▼                           ▼                           ▼
BackupService               BackupService               BackupService
     │                           │                           │
     ▼                           ▼                           ▼
 A Backup                    B Backup                    C Backup
     │                           │                           │
     ▼                           ▼                           ▼
 CSV / XLSX                  CSV / XLSX                  CSV / XLSX
     │                           │                           │
     └───────────────────────────┼───────────────────────────┘
                                 │
                                 ▼
                     Semantic Verification Engine
                                 │
                                 ▼
                    Multi-DB Preservation Package
                                 │
                                 ▼
                           Uninstallation
                    (Customer Data Always Kept)
                                 │
                                 ▼
                            Reinstallation
                    (Auto-Discovery & Recovery)
```

---

## 2. The 20 Mandatory Invariants

1. **One Profile = One Physical Database**: Each profile maps strictly to its own discrete `.db` file on disk.
2. **One Physical Database = One Profile**: A physical `.db` file can belong to only one active profile. Shared business databases are strictly prohibited.
3. **Multi-User Isolation**: Multiple users may share access to the same profile, but profiles never share physical database storage.
4. **`system.db` is Not a Business Database**: System configuration, database registries, profiles, user records, and operation histories are never mixed into business databases or exported as customer work-product.
5. **Business Database is Authoritative**: Live business operations are executed against the active profile's SQLite database. Excel and CSV files are snapshots/exports only, never live storage or read caches.
6. **No "First Active Database" Guesswork**: The runtime must never pick `findFirst({ status: 'ACTIVE' })`, fallback to `Stavan.db`, or pick arbitrary files. Every business operation must explicitly resolve `profileId -> DatabaseRegistry -> canonicalPath`.
7. **Plain, Standard Exports**: CSV and XLSX exports saved or downloaded by users are standard, unencrypted files that open directly in Excel, LibreOffice, and Google Sheets without passwords or proprietary decryption wrappers.
8. **Semantic Verification Mandatory**: File existence and checksums are insufficient; export and preservation routines must verify live database rows against CSV and XLSX records across primary keys, null values, and fields.
9. **Profile-Scoped Backups**: Every backup explicitly records `profileId`, `databaseId`, `sourcePath`, `schemaVersion`, SQLite integrity checks, and SHA-256 digests.
10. **Consistent SQLite Online Backups**: Live database backups must use SQLite `VACUUM INTO` or online backup routines, never raw file copies during active write locks.
11. **Protected Backup Retention**: Pruning rules must never delete the latest verified backup or leave an active profile without a fallback restore point.
12. **Profile-Scoped Restores**: Restoring a database always targets an explicit profile and creates a pre-restore safety rollback checkpoint. It never overwrites another profile's database.
13. **Safe Profile Deletion**: Removing a profile metadata record deactivates it and marks the underlying database as `ORPHANED`. Physical database deletion requires an explicit secondary action and a mandatory verified backup.
14. **Customer Data Retention on Uninstall**: Normal desktop uninstallation removes application binaries, shortcuts, and runtime caches, but preserves customer databases, backups, exports, uploads, and logs.
15. **Pre-Uninstall Preservation Gate**: Uninstallation generates a multi-profile, semantically verified preservation package containing DB backups, CSVs, XLSXs, and a signed manifest. If preservation fails, uninstallation halts with actionable options.
16. **Reinstallation Auto-Discovery**: Post-reinstall setup detects existing `system.db`, profiles, database files, and backups, offering recovery without silently creating empty replacement databases.
17. **Frontend Cache Flush on Profile Switch**: When switching profiles, the UI unmounts all cached components and flushes query caches to guarantee zero state leakage across profiles.
18. **Import Idempotency**: Spreadsheet and CSV imports must use stable business keys (`itemCode`, `repairNumber`, `partyCode`, `transactionNo`) to prevent duplicate entities upon repeated imports.
19. **Derived-Data Transaction Integrity**: Financial entries, inventory movements, and item events generated by transactions must use deterministic relation keys rather than racy `count() === 0` checks.
20. **Single Authoritative Services**: No duplicated or parallel implementations for database resolution, backup, provisioning, export, or recovery.

---

## 3. End-to-End Data Flows

### Flow A: Request Resolution (Profile -> Prisma Client -> Frontend)
```
User / HTTP Request
  │ (Contains x-profile-id or active session profile)
  ▼
Profile Middleware (`apps/api/src/middleware/profile.ts`)
  │
  ▼
DatabaseContextService (`apps/api/src/infrastructure/database/database-context.service.ts`)
  │ 1. Validates profileId exists in system.db
  │ 2. Finds active DatabaseRegistry record for profile
  │ 3. Resolves canonicalPath on filesystem
  │ 4. Asserts no ownership conflict with another profile
  ▼
Prisma Dynamic Client Pool (`apps/api/src/infrastructure/database/prisma.ts`)
  │ 1. Normalizes file path to file:[path]?connection_limit=1&socket_timeout=10
  │ 2. Caches PrismaClient instance per canonicalPath
  ▼
Express Route / Business Service (Processes business logic on profile's .db)
  │
  ▼
HTTP 200 Response
  │
  ▼
React Query Cache (Scoped to current profileId)
  │
  ▼
React Components / Virtual DOM
```

### Flow B: Profile Switching Flow
```
User selects new Profile in UI
  │
  ▼
useAuth().switchProfile(newProfileId)
  │ 1. Updates auth token / headers
  │ 2. Sets active profileId in auth state
  ▼
<ErpAppLayout key={profileId} />
  │ 1. React key changes -> Complete unmount of layout tree
  │ 2. React Query client clears all query caches
  │ 3. Mounts fresh components with zero retained profile state
  ▼
Initial API Requests sent with `x-profile-id: [newProfileId]`
  │
  ▼
DatabaseContextService loads new profile's exact physical .db
```

### Flow C: Safe Backup Flow
```
Backup Trigger (Manual, Scheduled, or Pre-Uninstall)
  │
  ▼
BackupService.createBackup({ profileId, backupType })
  │ 1. Resolves profile database via DatabaseContextService
  │ 2. Asserts source .db file exists and is readable
  │ 3. Checkpoints WAL on business PrismaClient (PRAGMA wal_checkpoint(TRUNCATE))
  │ 4. Performs SQLite safe backup:
  │      `VACUUM INTO '[backupPath]'` (or verified safe copy if engine busy)
  │ 5. Executes `PRAGMA integrity_check` on backup file
  │ 6. Computes SHA-256 checksum of backup file
  │ 7. Creates BackupRecord in system.db with verificationStatus = 'VERIFIED'
  │ 8. Prunes obsolete backups respecting minimum retention (keeps latest verified)
  ▼
Verified Backup Artifact (.db) ready for restore or archiving
```

### Flow D: Export & Semantic Verification Flow
```
Export Request (Settings, Manual, or Uninstall Preservation)
  │
  ▼
ExportService.exportBusinessData(client, profileId, options)
  │ 1. Queries all BUSINESS and REFERENCE models defined in EXPORT_ENTITY_REGISTRY
  │ 2. Streams standard, unencrypted CSV files into export directory
  │ 3. Streams standard, unencrypted XLSX workbook (ExcelJS)
  ▼
SemanticVerificationService.verifyDatabaseAgainstExports(client, csvDir, xlsxPath)
  │ For every registered business model:
  │   a. Loads live DB records from SQLite
  │   b. Loads CSV records & XLSX worksheet rows
  │   c. Matches records by primary key (id / business code)
  │   d. Checks:
  │        - Row counts
  │        - Missing rows / Extra rows
  │        - Duplicate primary keys
  │        - Field-by-field value equality (numbers, dates, nulls)
  │   e. Produces SemanticVerificationResult
  ▼
SemanticVerificationResult attached to export manifest (Status: VERIFIED or FAILED)
```

### Flow E: Uninstallation & Preservation Flow
```
User clicks Uninstall in Windows Add/Remove Programs
  │
  ▼
Installer.cs (Uninstall Mode)
  │ 1. Detects customer data in %LOCALAPPDATA%\DiamondERP
  │ 2. Enumerates all registered profiles in system.db
  │ 3. Signals API / backend to initiate pre-uninstall preservation
  ▼
PreservationService.createPreservationPackage()
  │ For EACH profile:
  │   a. Executes BackupService.createBackup (verified .db)
  │   b. Executes ExportService (unencrypted CSVs + XLSX)
  │   c. Runs SemanticVerificationService (DB ↔ CSV ↔ XLSX)
  │ Writes `preservation-manifest.json` with multi-profile audit logs
  ▼
Preservation Package Verified?
  ├── YES:
  │     1. Gracefully terminates background API process
  │     2. Unregisters services and removes application binaries from Program Files
  │     3. Preserves %LOCALAPPDATA%\DiamondERP (databases, backups, exports, logs)
  │     4. Uninstall completes cleanly
  └── NO:
        1. Halts uninstallation immediately
        2. Prompts user: "Customer data preservation could not be completed"
        3. Offers options: Retry, Open Data Folder, Open Logs, Cancel
```

### Flow F: Reinstallation & Auto-Discovery Flow
```
User runs DiamondERP Installer on previously used machine
  │
  ▼
Installer installs application binaries to Program Files
  │
  ▼
Application Launcher starts API backend
  │
  ▼
DatabaseHealthService & RecoveryService scan %LOCALAPPDATA%\DiamondERP:
  │ 1. Inspects system.db (reads existing Profile and DatabaseRegistry records)
  │ 2. Scans `databases/` folder for physical `.db` files
  │ 3. Runs PRAGMA integrity_check on all discovered databases
  │ 4. Identifies:
  │      - Known active profiles
  │      - Orphaned databases (present on disk but not linked)
  │      - Missing databases (registered in system.db but file absent)
  │      - Database ownership conflicts
  ▼
Does valid existing customer data exist?
  ├── YES: Re-links existing profiles, prompts user with Recovery/Setup screen
  └── NO:  Prompts user with first-time onboarding wizard
```

---

## 4. Authoritative Data Directory & Path Authority

DiamondERP centralizes all data paths through `apps/api/src/infrastructure/data/data-paths.ts`.
Direct path construction via `path.join("C:\\...")` or un-governed environment variables is forbidden.

### Directory Structure
```text
%LOCALAPPDATA%\DiamondERP\
├── system/
│   └── system.db          (Authoritative control registry, installation & user data)
├── databases/
│   ├── ProfileA.db        (Dedicated business SQLite DB for Profile A)
│   ├── ProfileB.db        (Dedicated business SQLite DB for Profile B)
│   └── ProfileC.db        (Dedicated business SQLite DB for Profile C)
├── backups/
│   ├── backup-staging/    (Temporary directory for atomic backup verification)
│   └── [profile]_[date].db
├── exports/
│   └── DiamondERP_Export_[date]/
│       ├── Stock.csv
│       ├── DiamondItem.csv
│       └── DiamondERP_Export.xlsx
├── uploads/
│   └── certs/             (Uploaded certificate PDF documents)
├── logs/                  (Application runtime and crash logs)
├── recovery/              (Disaster recovery artifacts and staged candidate DBs)
├── restore-staging/       (Staged pre-restore checkpoints and rollback copies)
└── config/                (.data-location.json, .installation-id, device lock credentials)
```

### Centralized Methods
- `getDataRoot()`: Resolves active customer data root (default `%LOCALAPPDATA%\DiamondERP`).
- `getSystemDatabasePath()`: Resolves `system.db` control database.
- `getDatabaseRoot()`: Resolves business `.db` storage folder.
- `getBackupRoot()`: Resolves database backups directory.
- `getExportRoot()`: Resolves CSV and XLSX snapshots directory.
- `getUploadRoot()`: Resolves certificate uploads directory.
- `getLogRoot()`: Resolves log file directory.
- `getRecoveryRoot()`: Resolves recovery candidates directory.
- `getBackupStagingRoot()`: Resolves atomic backup scratch directory.
- `getRestoreStagingRoot()`: Resolves pre-restore rollback staging directory.

---

## 5. Safe Data Location Migration Workflow

DiamondERP supports migrating customer data to an alternate drive (e.g. `D:\DiamondERPData\`) via `DataLocationService.migrateDataLocation()`.

```text
User requests change (target: D:\DiamondERPData)
        ↓
1. Validate destination path (non-empty, absolute, not root drive, not reserved)
        ↓
2. Check destination creatable (`mkdir -p`)
        ↓
3. Check write & read permissions (write probe file, verify content, delete)
        ↓
4. Check destination collision (cannot be identical, nested, or parent of source)
        ↓
5. Check free disk space (source size + 500 MB safety buffer)
        ↓
6. Create verified safety backups for all active profiles
        ↓
7. Lock business DB writes (`isMigrationLocked = true`)
        ↓
8. Close all dynamic Prisma clients & systemPrisma connection
        ↓
9. Copy customer data recursively (`system/`, `databases/`, `backups/`, `uploads/`, `config/`)
        ↓
10. Verify copied databases (SQLite format header + PRAGMA integrity_check)
        ↓
11. Verify schema & profile mappings in copied system.db
        ↓
12. Update authoritative registry (`canonicalPath` in `DatabaseRegistry`)
        ↓
13. Persist new location in `.data-location.json` and update in-memory root
        ↓
14. Reconnect Prisma clients & run DatabaseHealthService check
        ↓
15. Unlock business writes (`isMigrationLocked = false`)
        ↓
16. Migration Successful (Original data retained safely as fallback)
```

*Rollback Guarantee*: If any step fails between 1 and 14, the migration aborts immediately, original data paths are restored, clients reconnected, lock released, and no source customer data is deleted.

---

## 6. Single Application Instance & Backend Ownership

To prevent multiple instances from corrupting local SQLite databases concurrently:
1. **WPF Global Mutex**: `installer/Launcher.cs` acquires a system-wide named mutex `Global\DiamondERP_SingleInstance_Mutex`.
2. **Foreground Activation**: If another instance is launched, the second launcher brings the existing application window to the foreground via `ShowWindow(SW_RESTORE)` and `SetForegroundWindow()`, then exits immediately.
3. **Managed Node Process**: The launcher starts exactly one Node.js child process, monitors its PID, checks loopback port `3002`, and establishes parent-child process tree termination on window close.
4. **IPC Shutdown Signal**: Launcher communicates clean shutdown through `Global\DiamondERP_Shutdown_Event` allowing the Node backend to flush WAL journals before exiting.

---

## 7. Offline-First & Zero External Dependencies

DiamondERP is strictly designed to operate 100% offline:
- **No Internet Required**: Login, profile switching, business transactions, certificate management, exports, backups, and recovery function with network interfaces disabled.
- **No Cloud Synchronization**: Cloud DB synchronization, Google Sheets sync, Google Drive sync, and multi-device live replication are explicitly prohibited.
- **Bundled Fonts & Assets**: Fonts and icon glyphs (`Segoe UI`, Material Symbols) are embedded locally in the web distribution bundle without CDN dependencies.
- **Bundled Runtimes**: Node.js v20.18.0 and WebView2 runtime are packaged directly with the Windows desktop installer.

---

## 8. Disk Space Assessment & Safety Thresholds

All heavy file operations (Backup, Export, Preservation, Migration) execute pre-flight disk space assessments:
- **`HEALTHY`**: > 5.0 GB available disk space. Normal operations permitted.
- **`LOW`**: 1.0 GB – 5.0 GB available. Operations permitted with warning logged.
- **`CRITICAL`**: 200 MB – 1.0 GB available. Non-essential operations flagged.
- **`INSUFFICIENT`**: < 200 MB available. All mutating backups, exports, and migrations strictly fail fast with descriptive error to protect database files from disk exhaustion corruption.

---

## 9. Single Authoritative Services Directory

All operations must be routed through these authoritative services:

| Function | Authoritative Service | Location |
| :--- | :--- | :--- |
| **Profile & DB Resolution** | `DatabaseContextService` | `apps/api/src/infrastructure/database/database-context.service.ts` |
| **Data Paths & Location** | `DataLocationService` | `apps/api/src/infrastructure/data/data-location.service.ts` |
| **Database Provisioning** | `DatabaseProvisioningService` | `apps/api/src/modules/system/database/database-provisioning.service.ts` |
| **Database Health & Invariants**| `DatabaseHealthService` | `apps/api/src/modules/system/database/database-health.service.ts` |
| **Backup & Pruning** | `BackupService` | `apps/api/src/modules/system/backup/backup.service.ts` |
| **Data Export (CSV & XLSX)** | `ExportService` | `apps/api/src/modules/system/export/export.service.ts` |
| **Semantic Verification** | `SemanticVerificationService` | `apps/api/src/modules/system/export/semantic-verification.service.ts` |
| **Data Preservation** | `PreservationService` | `apps/api/src/modules/system/preservation/preservation.service.ts` |
| **Disaster Recovery** | `RecoveryService` | `apps/api/src/modules/system/recovery/recovery.service.ts` |

---

## 10. Model Classification Policy

Every Prisma model in `schema.prisma` must have an explicit classification in `EXPORT_ENTITY_REGISTRY`:
- **`BUSINESS`**: Customer work-product data (e.g., `DiamondItem`, `Certification`, `Repair`, `Transaction`, `TransactionItem`, `InventoryMovement`, `FinancialEntry`, `ItemEvent`, `ItemTransformation`, `TransformationProvenance`, `DocumentDraft`, `DraftRevision`). **Always exported.**
- **`REFERENCE`**: Supporting master entities (e.g., `Party`, `Ledger`, `Location`, `Settings`). **Always exported.**
- **`SYSTEM`**: System control and operational metadata stored in `system.db` (e.g., `Installation`, `Device`, `InstallationUser`, `DatabaseRegistry`, `Profile`, `UserProfile`, `BackupRecord`, `RestoreRecord`, `ProvisioningOperation`, `PreservationPackage`, `ExportRecord`, `AuditLog`). **Never exported as customer work-product.**
- **`INTERNAL/CONTROL`**: Ephemeral business operational tables (e.g., `SyncSession`, `JobQueue`, `MigrationLock`).

*Automated test `apps/api/src/tests/phase7-export-completeness.test.ts` (test case `P7-EXP-6`) runs in CI to guarantee that any new model added to `schema.prisma` without classification will fail the build.*
