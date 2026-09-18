# Diamond ERP V3 — Phase 4 Onboarding Architecture

## 1. Executive Summary
Phase 4 implements the authoritative first-run onboarding foundation for Diamond ERP V3. It moves a fresh installation from `NOT_INITIALIZED` through deterministic, idempotent lifecycle gates to `READY` without silently attaching unrelated databases or guessing user identities.

---

## 2. Relational Identity Model
Phase 4 maintains strict separation across all identity layers:

```text
Installation (UUID)
    │
    ├── Device (UUID)
    │     │
    │     └── DeviceSecurity (PIN Hash, Salt, Lock State)
    │
    └── InstallationUser (UUID)
          │
          └── Business User (User Table: username, passwordHash, role)
                 │
                 └── UserProfile (UUID)
                        │
                        └── Profile (UUID, Profile Code, Display Name)
                               │
                               └── DatabaseRegistry (UUID)
                                      │
                                      └── Physical SQLite DB (.db file)
```

**Fundamental Invariants**:
- Windows User $\ne$ Application Installation
- Application Installation $\ne$ Application Device
- Application Device $\ne$ Business User
- Application Device PIN $\ne$ Business User Password
- Business User $\ne$ Profile
- Profile $\ne$ Physical SQLite Database

---

## 3. Authoritative Lifecycle State Machine
Onboarding follows the single authoritative 9-step lifecycle state machine in the Control DB (`system.db`):

```text
┌─────────────────┐
│ NOT_INITIALIZED │ ── Fresh install detected
└────────┬────────┘
         │ initializeApplication()
         ▼
┌─────────────────┐
│    APP_SETUP    │ ── Installation identity & directories confirmed
└────────┬────────┘
         │ setupPin() / verifyPin()
         ▼
┌─────────────────┐
│    PIN_SETUP    │ ── Authoritative PIN configured in DeviceSecurity
└────────┬────────┘
         │ registerDevice() / bindDevice()
         ▼
┌─────────────────┐
│  DEVICE_SETUP   │ ── Active Device confirmed
└────────┬────────┘
         │ discoverUsers()
         ▼
┌─────────────────┐
│ USER_DISCOVERY  │ ── Select existing user or create new user
└────────┬────────┘
         │ selectExistingUser() / createBusinessUser()
         ▼
┌──────────────────────┐
│  DATABASE_DISCOVERY  │ ── Discovered candidates or user-selected path
└────────┬─────────────┘
         │ inspectDatabaseCandidate() / validateDatabaseCandidate()
         ▼
┌──────────────────────┐
│ DATABASE_VALIDATION  │ ── Integrity, tables, schema version check
└────────┬─────────────┘
         │ attachExistingDatabase() OR createNewDatabase()
         ▼
┌──────────────────────┐
│    DATABASE_SETUP    │ ── Registry created, Profile & User linked
└────────┬─────────────┘
         │ assertReady() & completeOnboarding()
         ▼
┌─────────────────┐
│      READY      │ ── Fully initialized, ready for production use
└─────────────────┘
```

---

## 4. User Discovery & Selection Architecture

### 4.1 Bounded Candidate Sources
Candidate users are retrieved strictly from authoritative local sources:
1. Control DB `User` records.
2. Existing `InstallationUser` associations for this installation.

### 4.2 Safe Candidate Presentation
Discovery candidates return safe public attributes only (`userId`, `username`, `displayName`, `role`, `isActive`, `associatedWithInstallation`).
**Secrets (`passwordHash`, `tokenVersion`, `PIN`) are never exposed**.

### 4.3 Explicit User Confirmation
- Candidates are never attached automatically.
- The operator must explicitly choose an existing user (`selectExistingUser`) or register a new one (`createBusinessUser`).
- Associations are created in `InstallationUser` using upsert semantics to ensure idempotency.

---

## 5. Database Discovery & Attachment Architecture

### 5.1 Bounded Discovery Scope
Database discovery searches strictly bounded locations:
1. Control DB `DatabaseRegistry` records.
2. Active Profile SQLite databases.
3. Known application data directories (`getDatabasesDir()`).
4. Explicitly provided user paths (via folder or file picker).

*Arbitrary recursive scanning of drives (such as `C:\`) is strictly prohibited.*

### 5.2 Candidate Inspection & Validation
Before attachment, candidates are validated through `databaseValidationService`:
- File existence and non-directory check.
- Canonical path normalization (resolving `..`, symlinks, and trailing separators).
- SQLite header verification (`PRAGMA integrity_check`).
- Diamond ERP schema check (presence of required tables: `Diamond`, `Certificate`, `Transaction`, `_prisma_migrations`).
- Control DB boundary check: **`system.db` cannot be attached as a profile database.**
- Template DB boundary check: **`template.db` cannot be attached as a live database.**

### 5.3 Deterministic Suitability Classification
Candidates are classified into auditable states:
- `VALID`: Structurally valid, supported schema, unattached.
- `REQUIRES_CONFIRMATION`: Valid database, but unattached to this profile/installation.
- `CONFLICT`: Already attached or registered to another profile/installation.
- `UNSUPPORTED`: Schema missing required tables or unrecognized version.
- `CORRUPTED`: SQLite integrity check failed.
- `INVALID`: Not a SQLite database, directory, or zero-byte file.

### 5.4 Explicit Confirmation & Preservation
- Automatic database attachment is strictly prohibited.
- Attachment requires explicit operator confirmation (`AttachDatabaseRequest { confirmAttachment: true }`).
- Physical SQLite files are strictly preserved: no tables dropped, no data truncated, no overwrite.
- Transactional metadata updates: `DatabaseRegistry` is linked to `Profile`, and `UserProfile` is associated with the selected `User`.

---

## 6. New Database Provisioning & Template Invariants

When creating a new database:
1. Destination path is canonicalized in the standard databases directory.
2. The immutable template (`template.db`) is copied directly to destination.
3. If `template.db` is missing: **provisioning fails closed immediately**. The system never falls back to creating an empty 0-byte SQLite file.
4. Schema validation is run on the newly copied file.
5. `Profile` and `DatabaseRegistry` are created and linked in the Control DB.
6. The selected business user is associated via `UserProfile`.

---

## 7. Security Boundaries & Authorization Matrix

During bootstrapping (`lifecycleState !== READY`):
- Endpoints required to advance onboarding (`/status`, `/app-setup`, `/users`, `/databases`, `/complete`) are accessible without standard session tokens.
- Sensitive credentials (`passwordHash`, `pinHash`, tokens) are never returned in any DTO.
- Once `READY` is achieved, normal authenticated session and permission controls govern the API.

---

## 8. Failure Compensation & Concurrency Protection

- **File / Registry Compensation**: If database attachment or creation fails mid-stream, incomplete physical files or pending registry entries are cleaned up, preventing orphaned active records.
- **Mutex Guards**: Critical transitions and provisioning operations are locked to prevent concurrent double-setup from creating duplicate installations, profiles, or users.
- **Restart-Safety**: The active onboarding state is persisted in the Control DB. If the application or server restarts midway through setup, it resumes at the exact persisted step.
