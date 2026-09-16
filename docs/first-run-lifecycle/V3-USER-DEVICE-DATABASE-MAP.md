# Diamond ERP V3.0 — User, Device & Database Mapping (Current vs Proposed)

> **Phase 1 Audit Artifact**  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Branch:** `v3`  
> **Status:** Architecture Audit & Conceptual Schema Mapping  
> **Notice:** The proposed models in this document are **PROPOSED — NOT IMPLEMENTED IN PHASE 1**.

---

## 1. Current Implementation in V3

### Existing Database Entities in [`apps/api/prisma/schema.prisma`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L14-L77):

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      User       │       │   UserProfile   │       │     Profile     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (UUID)       │◄──────│ userId          │       │ id (UUID)       │
│ username        │       │ profileId       │──────►│ code            │
│ passwordHash    │       │ role            │       │ name            │
│ displayName     │       │ isActive        │       │ dbPath          │
│ role            │       └─────────────────┘       │ isActive        │
│ isActive        │                                 └─────────────────┘
│ tokenVersion    │
│ lastLoginAt     │       ┌─────────────────┐
│ createdAt       │       │     Session     │
│ updatedAt       │       ├─────────────────┤
└─────────────────┘       │ id (UUID)       │
         │                │ userId          │
         └───────────────►│ tokenHash       │
                          │ expiresAt       │
                          │ revokedAt       │
                          └─────────────────┘
```

### Key Characteristics of Current V3 Design:
1. **User Identity:**
   - Identity is enterprise username + bcrypt password hash.
   - Stored in the primary system database (`systemPrisma`, which defaults to `%LOCALAPPDATA%\DiamondERP\databases\Stavan.db`).
   - Also duplicated across every individual tenant SQLite file because Prisma shares a single unified schema.
2. **Profile / Tenancy:**
   - Profiles are identified by lowercase alphanumeric codes (`code: string`, e.g. `'stavan'`).
   - Profile records are mapped via `UserProfile` join table.
   - `prisma.ts` maps profile code to file path `%LOCALAPPDATA%\DiamondERP\databases\<code\>.db`.
3. **Device / Machine Identity:**
   - **DOES NOT EXIST.** V3 has zero concept of device ID, hardware fingerprint, machine GUID, or trusted device binding.
4. **Local PIN Authentication:**
   - **DOES NOT EXIST.** V3 authentication requires standard passwords or auto-authenticated default user in development.
5. **Deletion Semantics:**
   - Deleting a `User` cascades to `UserProfile` and `Session` in SQL schema (`onDelete: Cascade`).
   - Deleting a `User` **DOES NOT delete the SQLite database file on disk**.
   - However, V3 lacks any explicit data protection policies or audit logging if an administrator attempts to prune a profile.

---

## 2. Architectural Comparison Matrix

| Dimension | Current V3 Implementation | Recommended Future Model | Architectural Rationale |
|---|---|---|---|
| **Local Machine Identity** | None; all machines treated identically | Hardware-bound `Device` linked to `Installation` | Guarantees local PC activation and offline authorization integrity |
| **First-Run Identity** | Hardcoded `stavan` default user in client & API | Interactive First-Run Onboarding Wizard creating initial local User | Prevents accidental cross-contamination of developer/test credentials |
| **Quick Desktop Access** | None (or localStorage token persistence) | Secure 4–8 digit PIN hashed via `bcryptjs` + salt | Optimized for physical point-of-sale and diamond workshop desktop terminals |
| **Database Discovery** | Blindly discovers all `*.db` files in directory | Cryptographic & Schema Header Validation before attachment | Prevents attaching corrupted or incompatible SQLite databases |
| **Database Provisioning** | Auto-creates `<code>.db` on arbitrary header | Explicit user confirmation & clean `template.db` cloning | Eliminates orphaned or rogue database files |
| **User Deletion Impact** | Deletes user row; DB file remains on disk | Decoupled: Deleting user/name **MUST NEVER** delete the database file | Satisfies **Invariant 6**: Business data survives user lifecycle changes |

---

## 3. PROPOSED FUTURE MODEL — NOT IMPLEMENTED IN PHASE 1

```
┌─────────────────────────────────────────────────────────────┐
│                        Installation                         │
│  - installationId: UUID                                     │
│  - machineGuid: string                                      │
│  - installedAt: DateTime                                    │
│  - appVersion: string                                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                           Device                            │
│  - deviceId: UUID                                           │
│  - installationId: UUID                                     │
│  - hardwareFingerprintHash: string (SHA-256)                │
│  - deviceName: string                                       │
│  - isTrusted: boolean                                       │
│  - lastActiveAt: DateTime                                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                            User                             │
│  - userId: UUID                                             │
│  - username: string                                         │
│  - displayName: string                                      │
│  - pinHash: string? (Salted bcrypt hash, NEVER plaintext)   │
│  - passwordHash: string                                     │
│  - role: Role                                               │
│  - isActive: boolean                                        │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        UserDatabase                         │
│  - id: UUID                                                 │
│  - userId: UUID                                             │
│  - databaseId: UUID                                         │
│  - accessRole: OWNER | MEMBER | READONLY                    │
│  - isDefault: boolean                                       │
│  - attachedAt: DateTime                                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ N:1
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                          Database                           │
│  - databaseId: UUID                                         │
│  - databaseCode: string (Alphanumeric identifier)           │
│  - displayName: string                                      │
│  - filePath: string (Relative to %LOCALAPPDATA%\databases)   │
│  - schemaVersion: int                                       │
│  - integrityCheckHash: string                               │
│  - status: ACTIVE | DETACHED | ARCHIVED                     │
│  - createdAt: DateTime                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Relationship Semantics & Lifecycle Rules

### 1. `Installation → Device` (1 to Many)
- An installation represents a physical installation of Diamond ERP on a Windows OS.
- A device represents the recognized hardware instance. Usually 1:1, but accommodates virtual machine rebuilds or Windows hardware configuration changes under the same install directory.

### 2. `Device → User` (Many to Many)
- Multiple local users can log in on the same trusted physical device.
- A user may authenticate on multiple authorized desktop devices within the local network.

### 3. `User → UserDatabase → Database` (Many to Many)
- **User → Multiple Databases:** A diamond merchant or accountant may own or operate multiple companies/ledgers (e.g. `Trading_Co.db`, `Manufacturing_Co.db`).
- **Database → Multiple Users:** Multiple authorized workshop managers, sales clerks, or accountants can share access to a single company database.
- **Ownership Invariant:** Every database has at least one user with `accessRole = OWNER`.

### 4. Absolute Deletion Rule (Mandatory Invariant 6):
```
Action: DELETE USER (or REMOVE USER PROFILE)
Result:
  1. User row marked isActive = false (or deleted from User / UserProfile table).
  2. Active sessions revoked.
  3. Database SQLite file (<code.db>, <code.db-wal>, <code.db-shm>) on filesystem is STRICTLY PRESERVED.
  4. Database status transitioned to DETACHED or unassigned if no active owners remain.
  5. ZERO file deletion calls (fs.unlinkSync / rmSync) are EVER executed against databases during user deletion.
```
