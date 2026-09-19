# Diamond ERP V3 — Phase 5 Recovery Flow

## 1. Candidate Discovery & Selection

```text
Discovery Trigger
       ↓
Scan %LOCALAPPDATA%\DiamondERP\backups and databases
       ↓
Filter Regular Files & Reject Non-DB Artifacts
       ↓
Reject system.db and template.db Anti-Spoofing Check
       ↓
Classify Suitability (SUITABLE, REQUIRES_CONFIRMATION, UNSUPPORTED, CORRUPTED)
       ↓
Present Validated Candidates to Operator (Path, Size, Schema Version, Checksum, Ownership)
```

---

## 2. Restore Lifecycle State Machine

A restore operation transitions deterministically through the following states:

```text
       [DISCOVERED]
             ↓
        [INSPECTED]
             ↓
        [CONFIRMED] (Operation token bound to restoreId, SHA-256, target DB)
             ↓
        [QUIESCING] (Disconnect Prisma client, flush pending writes)
             ↓
      [ROLLBACK_READY] (Verified backup of target DB created)
             ↓
        [ACTIVATING] (Rename active to .swap_old_<timestamp>, activate candidate)
             ↓
       [POST_VERIFY] (PRAGMA integrity_check, schema version check)
        ↙         ↘
   (PASS)         (FAIL)
      ↓             ↓
  [VERIFIED]     [ROLLBACK] (Swap .swap_old back or restore rollback backup)
                    ↓
              [ROLLED_BACK]
```

---

## 3. Atomic File Replacement (Windows Safe)

Because Windows file locks prevent overwriting open files or moving across volumes:

1. **Staged Candidate**: The candidate database is copied to a temporary staging path on the same drive (`.staging_<uuid>.db`).
2. **Rollback Backup**: A verified backup copy of the target database is written to `backups/<profileCode>/rollback_<timestamp>/`.
3. **Quiesce Connections**: The backend client cache disconnects the target database (`prismaClients.delete(profileCode)` / `$disconnect()`).
4. **Atomic Rename Swap**:
   - `fs.renameSync(targetPath, swapOldPath)` where `swapOldPath = targetPath + '.swap_old_' + timestamp`
   - `fs.renameSync(stagedCandidatePath, targetPath)`
5. **Post-Validation**:
   - Executes `PRAGMA integrity_check` on the newly activated `targetPath`.
   - If successful, `fs.unlinkSync(swapOldPath)` is called.
6. **Automatic Rollback**:
   - If validation fails, `fs.unlinkSync(targetPath)` (removes bad candidate) and `fs.renameSync(swapOldPath, targetPath)` (reinstates original).

---

## 4. Startup Crash Reconciliation

If the server crashes or power is lost midway through an activation:
- On next application startup, `reconcileInterruptedRestores()` scans `%LOCALAPPDATA%\DiamondERP\databases\`.
- If a `.swap_old_*` file exists and the main database file is missing or corrupted, the swap file is immediately restored to its canonical path.
- If the main database file is present and passes `PRAGMA integrity_check`, orphaned swap files older than 5 minutes are safely pruned.
- Stale `.partial` or `.staging_*` files are purged without affecting verified backups.
