# DIAMOND ERP V3 — PHASE 5 RECOVERY & ARCHITECTURAL DECISIONS

## 1. Why Backup is Strictly Copy-Only
The live active database is the operational heartbeat of the ERP. Modifying, renaming, unlinking, or moving the live database file to create a backup risks instant data loss or process crashes if an I/O failure or abrupt power loss occurs mid-operation. Diamond ERP V3 uses SQLite WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) to ensure all committed transactions are flushed to disk, and then safely copies the database into a temporary `.partial` file. The original live database file remains 100% untouched throughout the entire backup operation.

---

## 2. Why Restore is Staged in `restore-staging/`
Directly overwriting an active SQLite database while the application is running risks severe database corruption and permanent loss of data if the incoming file is invalid, corrupt, or incompatible. By staging the incoming candidate in a dedicated isolated folder (`restore-staging/<restore-id>/`), the system performs:
1. Header verification
2. Read-only PRAGMA integrity_check
3. Table and column schema validation
4. Schema version compatibility checks

Only after this multi-point verification completes and explicit confirmation is received is the staged candidate activated.

---

## 3. Why Explicit Confirmation is Required
Restoring a database replaces existing operational business records. It is fundamentally a destructive replacement operation. Under Phase 5 invariants:
- The user must explicitly view the source backup name, creation timestamp, schema version, and payload size.
- The user must view the target database path and profile name.
- The user must tick an explicit confirmation checkbox acknowledging that the active database will be replaced.
- Silent, automated, or default restore operations are strictly prohibited.

---

## 4. Why `system.db` is Strictly Rejected
`system.db` is the control-plane database containing local Installation identities, DeviceSecurity secrets, DatabaseRegistry mappings, and authentication metadata. It does NOT contain customer business tables (`Stock`, `Ledger`, `Party`, etc.). Treating `system.db` as a profile database would compromise security and break ERP tenancy. Every backup, recovery, and export endpoint checks the canonical path against `getControlDbPath()` and immediately fails closed with `ValidationError`.

---

## 5. Why `template.db` is Strictly Rejected
`template.db` is the immutable provisioning template used to instantiate blank profile databases. It contains zero business records and zero operational transactions. Treating `template.db` as customer data or allowing users to restore from it as a backup would create empty, disassociated databases or risk corrupting the application's clean provisioning source. It is rejected by all backup, export, and restore endpoints.

---

## 6. Why Whole-Drive Scanning is Avoided
Blindly scanning entire drives (`C:\`, `D:\`) on a Windows client machine:
1. Causes catastrophic I/O lag and frozen UIs while walking millions of OS files.
2. Triggers anti-virus alerts or permission errors accessing protected Windows directories.
3. Violates privacy boundaries.

Phase 5 candidate discovery is bounded strictly to:
- `%LOCALAPPDATA%\DiamondERP\backups`
- `%LOCALAPPDATA%\DiamondERP\databases`
- Explicit, user-selected folder paths provided via the UI.

---

## 7. Why the Original Backup Artifact Remains Immutable
A backup artifact represents a historical snapshot that the customer may need repeatedly or may store as an audit archive. During recovery, the system copies the candidate into `restore-staging/<restore-id>/staged.db` and operates exclusively on the copy. The original `.db` and its `.manifest.json` are NEVER modified, migrated, or deleted during a restore.

---

## 8. Why Rollback Backup is Mandatory Before Activation
Even after a candidate is verified in staging, activating it requires replacing the currently active profile database. If an unexpected OS crash, process kill, or disk error occurs during or immediately after the swap, the previous live database could be lost.
Therefore, the recovery service **always creates a verified rollback backup** of the live database (`target_rollback_<timestamp>.db`) in `%LOCALAPPDATA%\DiamondERP\backups` before replacing it. If post-activation verification fails, the system automatically rolls back to this backup.

---

## 9. How Reinstall Detects Previous Data
Reinstall detection inspects:
1. The presence of an existing `system.db` in `%LOCALAPPDATA%\DiamondERP`.
2. Existing active records in `DatabaseRegistry` and `Installation`.
3. Physical profile `.db` files in `%LOCALAPPDATA%\DiamondERP\databases\`.
4. Previous verified backups in `%LOCALAPPDATA%\DiamondERP\backups\`.

If any valid existing database or installation metadata is detected, `onboarding.service.ts` flags `reinstallRecovery.hasPreviousData = true` and presents the user with explicit options rather than silently wiping or defaulting.

---

## 10. Why Old Data Remains When "Start New" is Chosen
When a customer chooses to start fresh after reinstalling, they may be setting up a secondary company, testing a clean install, or starting a new financial year. Silently deleting their prior database is a catastrophic loss event.
Under Phase 5:
- "Start New" provisions a clean new installation ID and a clean database from `template.db`.
- The prior physical database files remain completely intact in `%LOCALAPPDATA%\DiamondERP\databases\` for future attachment or manual recovery.

---

## 11. How Interrupted Operations Recover
- **Interrupted Backup**: If the application crashes during backup creation, only a `.partial` file exists on disk. Startup invokes `backupService.cleanupPartialBackups()`, which purges `.partial` files while leaving all verified `.db` files intact.
- **Interrupted Restore**: Staged candidates reside in `restore-staging/<restore-id>/`. If the process restarts before confirmation and activation, the live database is untouched, and the temporary staging directory is ignored or pruned safely.
- **Database Mutexes**: In-memory active locks prevent concurrent backup or restore operations on the same physical database path.
