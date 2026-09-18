# DIAMOND ERP V3 — PHASE 5 DATA PRESERVATION & RECOVERY ARCHITECTURE

## 1. Executive Summary

Diamond ERP V3 Phase 5 implements the authoritative **Data Preservation, Backup/Export, Reinstall Detection, and Staged Recovery Foundation**. The central guiding principle of Phase 5 is:

> **Never allow installation, reinstall, uninstall, onboarding, backup, restore, or user-management operations to accidentally destroy the user's ERP data.**

---

## 2. Core Entities & Conceptual Separation

```text
Windows User
      ≠
Application Installation
      ≠
Application Device
      ≠
Business User
      ≠
Application PIN
      ≠
Business Password
      ≠
Profile
      ≠
Profile Database
```

And in the storage domain:

```text
LIVE DATA (Dynamic SQLite Profile DBs)
    ↓ (PRAGMA wal_checkpoint + copy / VACUUM INTO)
BACKUP (.db + .manifest.json + SHA-256)
    ↓
EXPORT (Sanitized CSV / XLSX + Manifest)
    ↓
RESTORE (Staged in restore-staging/ + Mandatory Rollback Backup)
    ↓
REINSTALL RECOVERY (Multi-choice: Continue, Restore, Start New, Inspect)
```

---

## 3. Storage Hierarchy & Roles

### 3.1 Live Database
- **Role**: The currently active operational ERP profile database (e.g., `%LOCALAPPDATA%\DiamondERP\databases\Stavan.db`).
- **Safety Invariant**: Live databases are NEVER modified to produce a backup, never unlinked during onboarding, and never restored directly in-place.

### 3.2 Control Database (`system.db`)
- **Role**: System metadata store containing Installation, Device, DeviceSecurity, DatabaseRegistry, InstallationUser, BackupRecord, and RestoreRecord.
- **Safety Invariant**: Strictly segregated from business profile databases. Rejected by all backup, export, and restore endpoints.

### 3.3 Template Database (`template.db`)
- **Role**: Immutable provisioning source for clean schema instantiation.
- **Safety Invariant**: Never contains user data. Rejected as a backup target or restore candidate.

### 3.4 Backup Artifacts
- **File Format**: `[profileCode]_backup_[timestamp]_[backupId].db` accompanied by `[filename].manifest.json`.
- **Integrity**: Verified SQLite header, PRAGMA integrity_check, table count, schema version, and SHA-256 payload checksum.
- **Staging**: Created as `[backupPath].partial`. Atomic rename only upon full verification.

### 3.5 Business Data Exports
- **Content**: Sanitized CSV/XLSX spreadsheets for core business entities (`Stock`, `Ledger`, `Party`, `DiamondItem`, `Certification`, `Repair`, `Transaction`, `TransactionItem`, `Location`).
- **Security**: Complete exclusion of passwords, PINs, tokens, and secrets. Automatic spreadsheet formula injection sanitization (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **Verification**: `export-manifest.json` with file counts, row counts, and per-file SHA-256 hashes.

### 3.6 Recovery Candidate & Staged Restore Engine
- **Discovery**: Bounded scan of `%LOCALAPPDATA%\DiamondERP\backups`, `databases`, and explicit user paths. No whole-drive walking.
- **Staging Pipeline**:
  ```text
  User selects candidate
            ↓
  Candidate copied to restore-staging/<restore-id>/staged.db (Original artifact immutable)
            ↓
  Deep validation & SQLite PRAGMA integrity_check
            ↓
  Explicit confirmation required from user (with target path & consequence review)
            ↓
  Pre-Restore Rollback Backup created of active live database
            ↓
  Atomic replacement of live database
            ↓
  Post-activation verification (Auto-rollback on failure)
  ```

### 3.7 Reinstall Detection
- **Detection**: Probes for existing installations, registered databases, and backups in AppData upon startup.
- **Multi-Choice Decisions**:
  1. **Continue**: Preserves existing database, resumes onboarding or enters application.
  2. **Restore from Backup**: Enters staged restore flow.
  3. **Start New**: Allocates new installation ID, provisions blank database from `template.db`. **Existing physical database is preserved untouched on disk.**
  4. **Inspect**: Safely inspects schemas and row counts without mutating files.

### 3.8 Uninstall Data Preservation Contract
- **Default Invariant**: Uninstaller removes application binaries in `Program Files\Diamond ERP` while leaving `%LOCALAPPDATA%\DiamondERP` completely intact.
- **Pre-uninstall Backup**: Dedicated endpoint produces a verified standalone backup bundle prior to any administrative uninstallation.

---

## 4. Subsystem Modules

```text
apps/api/src/modules/system/
├── backup/
│   ├── backup.service.ts         # Atomic backup creation, verification, and manifest generation
│   ├── backup.controller.ts      # REST API handlers
│   ├── backup.routes.ts          # Mounted at /api/system/backup
│   └── index.ts
├── recovery/
│   ├── recovery.service.ts       # Bounded candidate discovery, staged restore, rollback, reinstall detection
│   ├── recovery.controller.ts    # REST API handlers
│   ├── recovery.routes.ts        # Mounted at /api/system/recovery
│   └── index.ts
├── export/
│   ├── export.service.ts         # Sanitized CSV business data export & bundle verification
│   ├── export.controller.ts      # REST API handlers
│   ├── export.routes.ts          # Mounted at /api/system/export
│   └── index.ts
└── uninstall/
    ├── uninstall-preflight.service.ts  # Preflight status & pre-uninstall standalone backup bundles
    ├── uninstall.controller.ts   # REST API handlers
    ├── uninstall.routes.ts       # Mounted at /api/system/uninstall
    └── index.ts
```
