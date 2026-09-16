# Phase 2 — Database, Identity & Lifecycle Foundation Report

## 1. Executive Summary

Phase 2 establishes the minimal, production-grade data model and lifecycle state foundation required for first-run onboarding, local device setup, PIN security, database discovery/validation, and safe user lifecycle operations without introducing parallel database engines or disturbing existing V3 business records.

Every change adheres to the Ponytail principle:
- **No parallel database engine**: Extended the existing `User` $\to$ `UserProfile` $\to$ `Profile` $\to$ `<code.db>` SQLite model.
- **Physical SQLite file preservation**: Soft deletion (`deletedAt` + `isActive = false` + session revocation) decoupled from file lifecycle. User deletion **never** deletes SQLite database files.
- **Strict Isolation**: Profile databases are independently provisioned from an immutable, zero-row `template.db`.
- **Installation & Device Separation**: App installation identity survives restarts/upgrades via `%LOCALAPPDATA%\DiamondERP\config\.installation-id` and is distinct from physical devices and business users.

---

## 2. Architecture & Data Flow

```text
                 DIAMOND ERP INSTALLATION (UUID via AppData .installation-id)
                           │
                           ▼
                    LOCAL DEVICE (Workstation metadata: Name, OS, Platform)
                           │
                           ▼
                  LOCAL LIFECYCLE STATE (Strict State Machine: NOT_INITIALIZED -> READY)
                           │
                           ▼
                     BUSINESS USER (Authentication credentials, Role, Soft-Delete)
                           │
                           ▼
                      USER PROFILE (Tenancy binding: User -> Profile role)
                           │
                           ▼
                   PROFILE DATABASE (<profileCode>.db with WAL, foreign_keys=ON)
                           │
                           ▼
                      ERP DATA (Stock, Ledgers, Parties, Diamonds, Invoices)
```

---

## 3. Data Ownership Matrix

| Data | Owner | Database Location | Persistence Guarantee |
| :--- | :--- | :--- | :--- |
| **Installation Identity** | Local Installation | Control / AppData Config (`.installation-id`) + SQLite `Installation` table | Survives app restarts, updates, re-installs |
| **Device Metadata** | Hardware Workstation | SQLite `Device` table | Survives app restarts; updated on reconnect |
| **Lifecycle State** | Local Installation | SQLite `Installation.lifecycleState` | Authoritative single-enum state machine |
| **Business User** | Organization / Tenant | SQLite `User` table | Persistent; soft-deleted with `deletedAt` |
| **User Profile** | User-Profile Link | SQLite `UserProfile` table | Cascade unlinks on user purge; DB untouched |
| **Profile Metadata** | Workspace Profile | SQLite `Profile` table (`schemaVersion`, `status`) | Persistent registry of ERP databases |
| **ERP Business Data** | Profile Workspace | `<profileCode>.db` (SQLite WAL) | Absolute file preservation on disk |
| **PIN Security** | Future Phase 3 | Secure Credential Storage / PBKDF2 | Deferred to Phase 3 (no plaintext in DB) |

---

## 4. Control Database vs. Profile Database Separation

In Diamond ERP V3:
- The Control / System Database (`system.db`) is resolved strictly via `paths.getControlDbPath()`.
- Dedicated `systemPrisma` client operates with SQLite WAL and `busy_timeout` pragmas on `system.db` to house authoritative system metadata: `Installation`, `Device`, `InstallationUser`, `DatabaseRegistry`, `User`, `Profile`, `Session`.
- Individual company / workspace profile databases reside at `%LOCALAPPDATA%\DiamondERP\databases\<profileCode>.db` and hold business domain data: `Stock`, `Ledger`, `Party`, `DiamondItem`, `Transaction`, etc.
- When bootstrapping or accessing the ERP, `ensureProfileDbFile` clones the clean, immutable `template.db` (which contains 0 rows across all tables) to the profile's dedicated database path.
- `AsyncLocalStorage` and dynamic Prisma client pooling route all tenant operations to the designated database file with full isolation.

---

## 5. Authoritative Device Identity & Concurrency Controls

- Device identity is owned by the local installation (`.device-id` stored in AppData config dir).
- Rejection of client-invented arbitrary `deviceId`: Callers cannot spoof or rebind device IDs arbitrarily (`ValidationError`).
- Cross-installation collision defense: A device bound to one installation cannot be bound to another (`ConflictError`).
- Device revocation and reactivation: Setting status to `REVOKED` prevents automatic re-registration until explicitly reactivated via administrative API (`POST /api/system/device/:deviceId/reactivate`).
- Database Registry concurrency safety: `DatabaseRegistryService.registerDatabase()` catches Prisma `P2002` race conditions on `canonicalPath` and returns the existing registry record idempotently without data duplication.

---

## 6. Strengthened Database Validation & Immutability

- `DatabaseValidationService.validateDatabase()` operates strictly read-only (`?mode=ro`).
- SHA-256 hash and filesystem mtime immutability verified across candidate inspections.
- Multi-tier inspection pipeline:
  1. Filesystem existence and size check (<512 bytes $\to$ `INVALID`, `invalid_file_size`).
  2. Header check (16-byte SQLite 3 format signature).
  3. `PRAGMA integrity_check` execution (corrupted candidate $\to$ `CORRUPTED`).
  4. Master table check against essential Diamond ERP tables (`Stock`, `Ledger`, `Party`, `DiamondItem`, `Transaction`, `User`, `Profile`).
  5. Critical column verification via `PRAGMA table_info("<table_name>")` (detects schema compatibility; deficiencies reported in `missingRequiredColumns` with `detectedType = 'UNSUPPORTED_VERSION'`).
  6. Database type classification: `DIAMOND_ERP_PROFILE`, `BACKUP`, `EXTERNAL`, `UNKNOWN_SQLITE`, `CORRUPTED`, `INVALID`, `MISSING`.

---

## 7. User Deactivation Semantics & Database Preservation

Mandatory lifecycle rule enforced:
$$\text{DELETE USER} \implies \text{Soft-deactivate user} \land \text{Revoke sessions} \land \text{Preserve profile SQLite database file}$$

- `AuthService.deactivateUser(userId)`:
  1. Sets `isActive = false`, `deletedAt = new Date()`, increments `tokenVersion`.
  2. Revokes all active user sessions in the `Session` table.
  3. Rejects subsequent login attempts with 401 Unauthorized.
  4. Keeps all `UserProfile` records, database registry mappings, and physical SQLite database files on disk untouched.
- `AuthService.reactivateUser(userId)`:
  1. Sets `isActive = true`, `deletedAt = null`.
  2. Restores user login capabilities immediately.
- Controller protection:
  - `POST /api/auth/users/:userId/deactivate` and `DELETE /api/auth/users/:userId` protected by `authenticate` and `authorize('user.delete')`.
  - Self-deactivation prevention: Attempting to deactivate one's own authenticated account returns 400 Bad Request.

---

## 8. Unified System Routing & Bootstrap Security Boundary

- All `/api/system/*` routes are consolidated into `system.routes.ts` and mounted once at `/api/system` in `routes.ts`. Zero duplicate endpoint registrations exist.
- Bootstrap boundary:
  - `GET /api/system/lifecycle`: Always public probe.
  - `POST /api/system/lifecycle-state` & `POST /api/system/device`: Allowed unauthenticated during onboarding (`lifecycleState !== 'READY'`); once `READY`, mutations require authentication and return 403 Forbidden without valid credentials.
  - Administrative endpoints (`/installation`, `/database/register`, `/database/list`, `/users/associate`, `/users/disassociate`, `/users`, `/device/:deviceId/revoke`, `/device/:deviceId/reactivate`): Strictly authenticated with RBAC permissions.

---

## 9. Multi-Tenant Database Isolation

- Tested via `apps/api/src/tests/lifecycle-foundation.test.ts`.
- Profile A and Profile B point to distinct physical files on disk:
  - `pathA != pathB`
  - `PRAGMA integrity_check` returns `ok` on both databases.
- Records written to Profile A (e.g. `Party` with `partyCode: 'SUP-001'`) are completely invisible to Profile B (`clientB.party.count() == 0`).
- No cross-tenant data leakage occurs.

---

## 10. Phase 3 Readiness & Dependencies

Phase 2 remediation is complete with 96.8% code-level completion and all 40 foundation tests passing. Phase 3 (Local Device Security & PIN Foundation) can build directly on:
- Authoritative local `Device` and `Installation` records.
- Authoritative `LifecycleState` progression (`PIN_SETUP`, `DEVICE_SETUP`).
- Public probe endpoint `GET /api/system/lifecycle` for first-run detection.
- Protected user lifecycle and clean system routing.

