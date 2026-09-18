# Diamond ERP V3 — Phase 4 Database Discovery & Selection Decisions (ADRs)

## 1. Windows-First Database Path Validation & Normalization
- **Decision**: All candidate database paths are strictly validated through `canonicalizeDatabasePath` before inspecting or attaching.
- **Specific Path Invariants**:
  1. **UNC / Network Share Rejection**: Paths starting with `\\` or `//` are explicitly rejected with `UNC and network share paths are not supported for local SQLite database operation`. SQLite WAL mode and posix/win32 locks over SMB/NFS network filesystems are notoriously prone to corruption and silent file locking failures.
  2. **Reserved Device Names**: Paths containing Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `LPT1` through `LPT9`) are rejected before OS filesystem calls to prevent kernel handle deadlocks.
  3. **Invalid Characters**: Paths containing `< > " | ? *` are rejected immediately.
  4. **Directory Rejection**: If the path resolves to an existing directory rather than a file, validation fails.
  5. **Null Byte Defense**: Paths containing `\0` are rejected to prevent C-string truncation exploits.

---

## 2. Zero Automatic Candidate Pre-Selection
- **Decision**: When discovering databases in `%LOCALAPPDATA%\DiamondERP\databases` or from existing registries, the frontend wizard presents candidates in an explainable list but leaves `candidatePath` strictly empty (`""`).
- **Rationale**: Automatically populating the first discovered candidate (`setCandidatePath(candidates[0].canonicalPath)`) creates an extreme risk of user error: an operator clicking through setup could accidentally attach a previous test database or an unrelated database without realizing it was pre-selected.
- **Consequences**: The operator must explicitly click "Select & Inspect" on a candidate card or enter an explicit manual path.

---

## 3. Strict Boundary Protection: `system.db` & `template.db`
- **Decision**: Candidate database paths pointing to `system.db` (Control DB) or `template.db` (Prisma schema template) are permanently barred from inspection or attachment.
- **Rationale**:
  1. `system.db` contains system-level control metadata (`Installation`, `Device`, `DeviceSecurity`, `DatabaseRegistry`, `AuditLog`). Attaching it as a profile business database would subject it to ERP transactional queries, corrupting the installation.
  2. `template.db` is the pristine gold master used for new database provisioning. Attaching it directly would mutate the template.
- **Consequences**: Rejections return `suitability: CONFLICT` and `conflictReason: DATABASE_IS_CONTROL_DB` / `DATABASE_IS_TEMPLATE`.

---

## 4. Cross-Installation Ownership Conflict Enforcement
- **Decision**: If a candidate database is already registered to a different `installationId` in the Control DB, attachment is rejected with `DATABASE_INSTALLATION_CONFLICT` (HTTP 409 Conflict).
- **Rationale**: Silent ownership transfers between distinct application installations lead to severe data collisions, audit contamination, and profile divergence.
- **Consequences**: The system refuses to reassign the database to another installation without an explicit administrative migration workflow (deferred to Phase 5).

---

## 5. Re-Attachment Idempotency
- **Decision**: Attaching an already-attached database belonging to the current installation succeeds idempotently without duplicating `DatabaseRegistry`, `Profile`, or `UserProfile` rows.
- **Rationale**: If onboarding is restarted or an operator re-confirms an existing database, the system must recognize existing ownership and refresh status rather than throwing spurious constraint violations or creating orphaned duplicate records.
- **Consequences**: Predictable recovery and clean database state.
