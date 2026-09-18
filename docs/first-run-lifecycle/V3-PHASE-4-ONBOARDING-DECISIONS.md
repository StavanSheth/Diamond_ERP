# Diamond ERP V3 — Phase 4 Onboarding Decisions (ADRs)

## 1. Explicit User Selection and Association
- **Decision**: Candidate ERP business users found during discovery are never attached automatically to the active installation. The user must explicitly select an existing user or create a new user.
- **Rationale**: Multiple operators may use the same machine or shared network drive. Implicit identity inference (e.g., matching Windows username or guessing based on folder name) leads to severe identity conflation, privilege escalation, and audit trail contamination.
- **Consequences**: Ensures that every `InstallationUser` relationship reflects conscious operator intent.

---

## 2. Explicit Database Attachment Confirmation
- **Decision**: Discovered or user-selected Diamond ERP databases are never automatically attached upon detection. Attachment requires an explicit confirmation step showing file path, display name, schema compatibility, and potential existing profile associations.
- **Rationale**: SQLite databases in multi-office diamond ERP environments can hold millions of dollars in inventory and ledger transactions. Silently attaching the first `.db` found or the newest file risk attaching a test database, a superseded backup, or an unrelated profile database.
- **Consequences**: Prevents accidental attachment of wrong business data. Gives the operator full visibility into database metadata before committing.

---

## 3. Prohibition of Arbitrary Filesystem Scanning
- **Decision**: Discovery is bounded strictly to registered `DatabaseRegistry` records, active profile databases, configured application data directories (`%LOCALAPPDATA%\DiamondERP\databases`), and user-specified paths. Recursive whole-drive scanning (such as walking `C:\`) is strictly prohibited.
- **Rationale**:
  1. Performance & Responsiveness: Traversing entire disks on Windows causes intense I/O thrashing, high latency, and UI freezes.
  2. Security & Privacy: Unrestricted directory crawling crosses user privacy boundaries and accesses unauthorized folders.
  3. False Positives: Blind scans encounter temporary, backup, or non-ERP SQLite files.
- **Consequences**: Instantaneous discovery results with zero system strain.

---

## 4. Control Database (`system.db`) Boundary Protection
- **Decision**: `system.db` is strictly barred from being selected, validated, or attached as a profile business database.
- **Rationale**: `system.db` contains system-wide control metadata (`Installation`, `Device`, `DeviceSecurity`, `DatabaseRegistry`, `AuditLog`). If an operator were allowed to attach `system.db` as a profile database, the profile Prisma proxy would attempt business schema operations on control tables, immediately corrupting the installation.
- **Consequences**: Rejection is enforced at both validation (`inspectDatabaseCandidate`) and attachment (`attachExistingDatabase`) levels.

---

## 5. Template Database (`template.db`) Boundary Protection & Invariant
- **Decision**: `template.db` cannot be attached as a live business database, and `template.db` must never be bypassed with an empty 0-byte file fallback.
- **Rationale**:
  1. The template database is the immutable pristine archetype for new tenant/profile databases. Attaching it directly would mutate the gold master.
  2. Inherited code previously wrote an empty string (`fs.writeFileSync(dbPath, '')`) if `template.db` was missing. A 0-byte file is not a valid SQLite database; opening it produces Prisma initialization errors and runtime crashes.
- **Consequences**: If `template.db` is missing, provisioning fails closed with an actionable error.

---

## 6. Physical Database Preservation (Zero Destructive Deletion)
- **Decision**: Disassociating a user, deleting a profile record, canceling onboarding, or resetting onboarding must NEVER delete the physical `.db` file on disk.
- **Rationale**: Business records must survive administrative or configuration changes. Accidental data loss from metadata cleanup is unacceptable in an ERP system.
- **Consequences**: Only metadata relationships in `systemPrisma` (`InstallationUser`, `UserProfile`, `DatabaseRegistry`) are severed. The physical database remains intact on the filesystem.

---

## 7. Backend-Authoritative Lifecycle State Machine
- **Decision**: The lifecycle state machine (`NOT_INITIALIZED` $\rightarrow$ `APP_SETUP` $\rightarrow$ `PIN_SETUP` $\rightarrow$ `DEVICE_SETUP` $\rightarrow$ `USER_DISCOVERY` $\rightarrow$ `DATABASE_DISCOVERY` $\rightarrow$ `DATABASE_VALIDATION` $\rightarrow$ `DATABASE_SETUP` $\rightarrow$ `READY`) resides solely in the Control DB and is governed by backend validation. The frontend derives all view states from `GET /api/system/onboarding`.
- **Rationale**: If the client maintained authoritative lifecycle state, an attacker or corrupted browser cache could jump directly to `READY` or bypass device security. Persisting state in `system.db` guarantees restart-safety across application crashes.
- **Consequences**: Deterministic recovery, zero state divergence, and auditable forward progress.

---

## 8. Device PIN Security Ownership (Phase 3 Discipline)
- **Decision**: Phase 4 strictly consumes Phase 3's `DeviceSecurityService` and `PinService`. No duplicate PIN hashing, local storage of PINs, or PIN recovery mechanisms were introduced.
- **Rationale**: The project mandates strict separation of device credentials (PIN) from user credentials (business passwords), and enforces **Zero PIN Recovery** (no backdoors, no master PIN, no recovery questions).
- **Consequences**: Strong, uncompromised device authentication with consistent rate-limiting and lockout protection.
