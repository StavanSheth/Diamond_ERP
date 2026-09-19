# Diamond ERP V3 — Phase 5 Data Preservation Architecture

## 1. Executive Summary

Phase 5 establishes a secure, local, deterministic, and crash-resilient data preservation, backup, export, recovery, reinstall, and uninstall foundation for Diamond ERP V3.0 on Windows workstations.

The architecture prioritizes **Data Safety > Recovery Correctness > Security > Consistency > Testability > UX**.

---

## 2. Critical Safety Invariants

The data preservation architecture strictly enforces and preserves the following core invariants:

```text
Windows User != Application Installation != Application Device != Business User != Application PIN != Business Password != Profile != Profile Database

system.db != business database
template.db != business database
backup != live database
recovery candidate != active database
discovered DB != selected DB
selected DB != attached DB

user deletion != physical database deletion
uninstall != automatic deletion of AppData
backup failure != permission to delete source data
restore failure != destruction of source backup
```

---

## 3. Component Architecture

```text
Windows Installer (Installer.exe / Installer.cs)
      ↓
Launcher (DiamondERP.exe / Launcher.cs)
      ↓
Express REST API (apps/api/src/index.ts)
      ↓
systemPrisma (Control Database: system.db)
      ↓
Installation & Device Registry
      ↓
DatabaseRegistry (Canonical Physical SQLite Paths)
      ↓
Profile SQLite Database (databases/<profileCode>.db)
      ↓
Backup Engine (VACUUM INTO + Staging + Integrity Check + Manifest + Atomic Publication)
      ↓
Verified Backup Artifacts (backups/<profileCode>/<backupId>/)
```

---

## 4. Subsystems Detail

### 4.1. Backup Engine (`backup.service.ts`)
- **Isolation & Mutex**: Concurrency locks serialize simultaneous backup requests for the same database.
- **SQLite Snapshot Protocol**:
  1. Issues `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL frames into the primary SQLite database file.
  2. Executes native SQLite `VACUUM INTO` into a dedicated staging directory: `backup-staging/<backupId>/`.
  3. Verifies staged database using `PRAGMA integrity_check`.
  4. Computes cryptographic SHA-256 hash of the snapshot.
  5. Generates `manifest.json` recording database metadata, installation ID, profile code, row counts, and checksums. Passwords, PINs, tokens, and secrets are strictly excluded.
  6. Atomically publishes the verified snapshot and manifest into the final destination directory `backups/<profileCode>/<backupId>/`.
  7. Conducts post-publication verification; sets status to `VERIFIED` only if all verifications succeed.
  8. Automatic cleanup of transient `.partial` or `.staging` artifacts upon completion or failure.

### 4.2. Recovery & Restore Engine (`recovery.service.ts`)
- **Discovery**: Enumerates recovery candidates across standard AppData paths (`backups/`, `databases/`, and archived directories).
- **Candidate Validation**: 7-layer validation:
  1. Regular file check.
  2. Anti-spoofing guards (strictly rejects `system.db` and `template.db`).
  3. Path canonicalization and traversal guards.
  4. Read-only SQLite `PRAGMA integrity_check`.
  5. Schema compatibility validation (verifies supported tables and schema versions).
  6. Manifest integrity and SHA-256 verification when manifest is present.
  7. Installation and ownership classification (`CURRENT_INSTALLATION`, `PREVIOUS_INSTALLATION`, `EXTERNAL_SOURCE`, `UNKNOWN_SOURCE`).
- **Atomic Activation & Rollback**:
  1. Resolves target profile via `DatabaseRegistry` to its canonical physical path.
  2. Creates a mandatory verified rollback backup of the active target database.
  3. Quiesces active connections (disconnects Prisma client from active profile).
  4. Performs atomic rename swap using `.swap_old_<timestamp>`.
  5. Activates the recovery candidate into the live path.
  6. Executes post-restore SQLite integrity and schema checks.
  7. If post-restore check fails, automatically reverts the active database from the rollback backup.
  8. If post-restore check passes, cleans up the temporary `.swap_old_*` file.

### 4.3. Business-Data Export (`export.service.ts`)
- **Format Parity**: Exports full business data across CSV, XLSX, and standalone SQLite formats.
- **Fail-Closed Guarantee**: Verifies non-empty database, enforces strict model classifications, and rejects `system.db` or `template.db`.
- **Secret Sanitization**: Automatically scrubs passwords, PIN hashes, session tokens, and security metadata.
- **Integrity Manifest**: Manifest tracks table counts, row counts, individual file checksums, and overall archive SHA-256.

### 4.4. Reinstall Detection & Multi-Choice Preservation (`recovery.service.ts`)
- **Classification Engine**: Detects existing data on startup and classifies into:
  - `FIRST_INSTALL`
  - `CURRENT_INSTALLATION`
  - `PREVIOUS_INSTALLATION_DATA`
  - `ORPHANED_DATA`
  - `RECOVERY_CANDIDATE`
  - `NO_RECOVERABLE_DATA`
- **Multi-Choice Flow**:
  1. Continue Existing Installation
  2. Restore From Backup
  3. Start Fresh Installation
  4. Review Existing Data
- **Start Fresh Isolation**: Non-destructive. Generates a new `installationId` (standard UUID v4), archives previous installation records, provisions clean databases from `template.db`, and preserves all previous physical databases and backups on disk.

### 4.5. Uninstall Protection (`uninstall-preflight.service.ts` & `Installer.cs`)
- **Preflight Evaluation**: Analyzes active profiles, databases, disk sizes, integrity, latest verified backups, and pending operations.
- **Blocking Guard**: Blocks uninstallation if backup/restore operations are pending or if database files are corrupted.
- **All-or-Nothing Pre-Uninstall Backup**: Verifies every active database and generates a unified verified backup bundle.
- **AppData Preservation**: `Installer.cs` removes binaries from `Program Files` and cleans Windows Add/Remove Programs registry keys, while strictly preserving `%LOCALAPPDATA%\DiamondERP` containing customer databases, backups, and configurations.
