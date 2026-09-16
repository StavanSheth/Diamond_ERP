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
- In production, each company or workspace profile maps to its own SQLite database file located in `%LOCALAPPDATA%\DiamondERP\databases\<profileCode>.db`.
- The active profile's database contains both the system identity records (`Installation`, `Device`, `User`, `Profile`, `UserProfile`, `Session`, `IdempotencyKey`) and the domain business tables (`Stock`, `Ledger`, `Party`, `DiamondItem`, `Transaction`, etc.).
- When bootstrapping or accessing the ERP, `ensureProfileDbFile` clones the clean, immutable `template.db` (which contains 0 rows across all tables) to the profile's dedicated database path.
- `AsyncLocalStorage` and dynamic Prisma client pooling route all tenant operations to the designated database file with full isolation.

---

## 5. Schema Changes & Migrations

### Prisma Schema Updates (`apps/api/prisma/schema.prisma`)
1. **Model `Installation`**:
   - `id`: String (UUID, primary key)
   - `installationId`: String (Unique persistent GUID)
   - `appVersion`: String (Default: "3.0.0")
   - `status`: String (Default: "ACTIVE")
   - `lifecycleState`: String (Default: "NOT_INITIALIZED", strictly progressive)
   - `initializedAt`: DateTime?
   - `devices`: `Device[]` relation

2. **Model `Device`**:
   - `id`: String (UUID, primary key)
   - `installationId`: String (Foreign key to `Installation.id`)
   - `deviceName`: String (Hostname or custom workstation alias)
   - `platform`: String (Default: "WINDOWS")
   - `osVersion`: String?
   - `status`: String (Default: "ACTIVE")
   - `lastSeenAt`: DateTime
   - Relation to `Installation` with `onDelete: Cascade`

3. **Model `User`**:
   - Added `deletedAt DateTime?` for safe soft-deletion.
   - Deactivation sets `isActive = false`, `deletedAt = now()`, and revokes all active sessions.
   - No filesystem unlinking or DB deletion is triggered.

4. **Model `Profile`**:
   - Added `schemaVersion Int @default(1)`
   - Added `status String @default("ACTIVE")` (ACTIVE, INACTIVE, ORPHANED, UNAVAILABLE, INVALID, CORRUPTED, UNSUPPORTED)
   - Added `lastValidatedAt DateTime?`

### Migration SQL (`apps/api/prisma/migrations/20260916120000_add_lifecycle_foundation/migration.sql`)
Executed safely using idempotent table creations and safe `ALTER TABLE ADD COLUMN` queries. Applied to existing control and profile databases without data loss.

---

## 6. Template DB Purity & Maintenance

- Template DB: `apps/api/prisma/template.db`
- Verified schema: 28 tables, identical to production DDL.
- Row count check: **0 rows across all tables**.
- Synchronizer script (`scripts/sync-template-db.js`) cleans WAL, executes `DELETE FROM <table>`, runs `VACUUM`, and verifies zero rows before persisting.

---

## 7. User Deactivation Semantics & Database Preservation

Mandatory lifecycle rule enforced:
$$\text{DELETE USER} \implies \text{Soft-deactivate user} \land \text{Revoke sessions} \land \text{Preserve profile SQLite database file}$$

- `AuthService.deactivateUser(userId)`:
  1. Sets `isActive = false`, `deletedAt = new Date()`.
  2. Revokes all active user sessions in the `Session` table.
  3. Rejects subsequent login attempts with 401 Unauthorized.
  4. Keeps all `UserProfile` records and physical SQLite database files on disk untouched.
- `AuthService.reactivateUser(userId)`:
  1. Sets `isActive = true`, `deletedAt = null`.
  2. Restores user login capabilities immediately.

---

## 8. Multi-Tenant Database Isolation

- Tested via `apps/api/src/tests/lifecycle-foundation.test.ts`.
- Profile A and Profile B point to distinct physical files on disk:
  - `pathA != pathB`
  - `PRAGMA integrity_check` returns `ok` on both databases.
- Records written to Profile A (e.g. `Party` with `partyCode: 'SUP-001'`) are completely invisible to Profile B (`clientB.party.count() == 0`).
- No cross-tenant data leakage occurs.

---

## 9. Phase 3 Readiness & Dependencies

Phase 2 is fully implemented and tested. Phase 3 (Local Device Security & PIN Foundation) can build directly on:
- Stable `Installation` identity and `Device` records.
- Authoritative `LifecycleState` progression (`PIN_SETUP`, `DEVICE_SETUP`).
- Public probe endpoint `GET /api/system/lifecycle` for first-run detection.
- Soft-delete user semantics ensuring data integrity and safety.
