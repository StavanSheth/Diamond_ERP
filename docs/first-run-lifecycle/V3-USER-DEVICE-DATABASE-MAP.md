# Diamond ERP V3.0 — User, Device & Database Mapping (Current vs Proposed)

> **Phase 1 Audit Artifact — Code-Level Architecture Mapping**  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Branch:** `v3`  
> **Authority:** Actual V3 Source Code (`apps/api/src/`, `apps/api/prisma/schema.prisma`, `apps/web/src/`, `installer/`)  
> **Status:** Remediated Phase 1 Architecture Audit (Confidence $\ge 90\%$)  
> **Notice:** Proposed models in Section 3 are **CONCEPTUAL PROPOSALS FOR PHASES 2–8 ONLY — NOT IMPLEMENTED IN PHASE 1**.

---

## 1. Current Implementation in V3

### 1.1 Complete User-Like Models & Entities in V3 Code

| Model / Entity | Exact Source File | Architectural Purpose | Persistent? | Relevant to New Lifecycle Feature? |
|---|---|---|---|---|
| `User` | [`apps/api/prisma/schema.prisma:14-30`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L14-L30) | Enterprise employee/operator identity (`username`, `passwordHash`, `role`, `tokenVersion`, `lastLoginAt`). | Yes (`User` table in SQLite) | **High**: Existing login identity; will be linked to local installation credentials. |
| `Profile` | [`apps/api/prisma/schema.prisma:32-43`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L32-L43) | Multi-tenant company/workspace database partition (`code`, `name`, `dbPath`, `isActive`). | Yes (`Profile` table in SQLite) | **High**: Directly represents the SQLite database file code (e.g. `stavan.db`). |
| `UserProfile` | [`apps/api/prisma/schema.prisma:45-60`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L45-L60) | Join table mapping `User` to `Profile` with specific role (`role`, `isActive`, `onDelete: Cascade`). | Yes (`UserProfile` table) | **High**: Bridges users to databases; precursor to `UserDatabase`. |
| `Session` | [`apps/api/prisma/schema.prisma:62-76`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L62-L76) | Server-side active JWT session tracking (`tokenHash`, `expiresAt`, `revokedAt`, `ipAddress`, `userAgent`). | Yes (`Session` table) | **Medium**: Tracks active desktop login sessions; revocable on password/PIN change. |
| `IdempotencyKey` | [`apps/api/prisma/schema.prisma:78-98`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L78-L98) | Scoped mutation idempotency (`userId`, `profileId`, `key`, `requestHash`, `status`). | Yes (`IdempotencyKey` table) | **Low**: Mutation deduplication; references `userId` and `profileId`. |
| `Party` | [`apps/api/prisma/schema.prisma:139-158`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L139-L158) | External commercial entity (Supplier, Customer, Broker, Cutting/Polishing Workshop, Lab). | Yes (`Party` table) | **None**: Business counterparty; NOT an application user or terminal operator. |
| `DocumentDraft` | [`apps/api/prisma/schema.prisma:551-577`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L551-L577) | Uncommitted transaction/inventory draft (`createdBy`, `updatedBy`, `status`). | Yes (`DocumentDraft` table) | **Low**: User attribution for draft state. |
| `DraftRevision` | [`apps/api/prisma/schema.prisma:580-601`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L580-L601) | Point-in-time draft revision snapshot (`createdBy`, `deviceId?`, `sessionId?`). | Yes (`DraftRevision` table) | **Medium**: Pre-existing optional `deviceId` column; indicates device awareness. |
| `RecordVersion` | [`apps/api/prisma/schema.prisma:606-645`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L606-L645) | Immutable audit version history (`createdBy`, `deviceId?`, `sessionId?`, `source`). | Yes (`RecordVersion` table) | **Medium**: Pre-existing optional `deviceId` column; indicates audit awareness. |
| `AuditEvent` | [`apps/api/prisma/schema.prisma:663-690`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L663-L690) | System-level audit trail (`performedBy`, `deviceId?`, `sessionId?`, `ipAddress`). | Yes (`AuditEvent` table) | **Medium**: Pre-existing optional `deviceId` column. |

---

### 1.2 Current User Lifecycle (Code-Level Audit)

#### 1. How is a user created?
There are three distinct code paths for user creation in V3:
1. **Admin Creation via API:**
   - **Route:** `POST /api/auth/users` in [`apps/api/src/modules/auth/auth.routes.ts:37`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.routes.ts#L37).
   - **Authorization:** Requires valid JWT + `authorize('user.create')` permission.
   - **Service Method:** `authService.createUser(username, password, displayName, role, profileCodes)` in [`apps/api/src/modules/auth/auth.service.ts:300-373`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts#L300-L373).
   - **Mechanism:** Hashes password with `bcryptjs` (12 rounds). Executes inside `systemPrisma.$transaction`: creates `User` row and links to requested profiles via `UserProfile` records.
2. **First-Run Bootstrap via Secret Header:**
   - **Route:** `POST /api/auth/bootstrap` in [`apps/api/src/modules/auth/auth.routes.ts:29`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.routes.ts#L29).
   - **Controller:** [`apps/api/src/modules/auth/auth.controller.ts:188-308`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.controller.ts#L188-L308).
   - **Mechanism:** Requires `X-Bootstrap-Secret` matching `process.env.BOOTSTRAP_SECRET` via `crypto.timingSafeEqual`. Runs atomic `$transaction`: verifies `system.bootstrapped` is not `'true'` and user count is 0, creates `SUPER_ADMIN` user, default `Profile`, join `UserProfile`, and permanently marks `system.bootstrapped = 'true'`.
3. **Auto-Seeding on Server Launch:**
   - **Method:** `authService.seedDefaultAdmin()` in [`apps/api/src/modules/auth/auth.service.ts:446-478`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts#L446-L478).
   - **Trigger:** Invoked at backend startup in [`apps/api/src/index.ts:167`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/index.ts#L167).
   - **Mechanism:** If `systemPrisma.user.count() === 0`, creates user `'stavan'` with password from `DEFAULT_ADMIN_PASSWORD` (or `'Stavan@123'` in dev, `'Admin@123456'` in test).

#### 2. How is a user identified?
- Primary Key: UUIDv4 (`id: String @id @default(uuid())`).
- Unique Business Key: `username: String @unique` (normalized to lowercase and trimmed).
- Runtime Identity: Encoded into signed JWT payload:
  ```typescript
  export interface AuthTokenPayload {
    userId: string;
    username: string;
    role: string;
    tokenVersion: number;
    sessionId?: string;
  }
  ```

#### 3. How is a user retrieved?
- **By ID:** `systemPrisma.user.findUnique({ where: { id: userId } })` (used in `auth.controller.ts:760`, `auth.service.ts:379`).
- **By Username:** `systemPrisma.user.findUnique({ where: { username: normalizedUsername } })` (used during login in `auth.service.ts:212`).
- **Active User Context:** Extracted in `middleware/auth.ts:67` from JWT `userId`, verified against database for `isActive: true` and `tokenVersion` match.

#### 4. How is a user updated?
- **Password Change:** `authService.changePassword(userId, currentPassword, newPassword)` in [`apps/api/src/modules/auth/auth.service.ts:378-412`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts#L378-L412). Verifies current password, hashes new password, increments `tokenVersion`, and sets `revokedAt = new Date()` on all active sessions.
- **Last Login Tracking:** `systemPrisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } })` on every successful login.

#### 5. How is a user deleted? (Critical Audit Finding)
- **API Endpoint:** **DOES NOT EXIST.** There is no `DELETE /api/auth/users/:id` route in V3.
- **Repository / Service:** No `deleteUser()` method exists in `auth.service.ts`.
- **Test Code:** User deletion only occurs in test suites (`apps/api/src/tests/concurrency.test.ts:182`: `systemPrisma.user.deleteMany()`).
- **Prisma Cascade Behavior:** In [`schema.prisma:54,73`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma#L54), `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`. If a `User` record were deleted:
  - `Session` records for that user are deleted.
  - `UserProfile` join records are deleted.
  - **The `Profile` record is NOT deleted.**
  - **The SQLite database file (`<code.db>`) on disk is NEVER deleted.**

#### 6. Can multiple users exist?
- **YES.** The `User` table supports arbitrary numbers of users, each linked to one or more `Profile` records via `UserProfile`.

#### 7. What identifies the active user?
- The HTTP header `Authorization: Bearer <jwt_token>`.
- `middleware/auth.ts` parses the token, queries `systemPrisma.session` to confirm the session has not been revoked, and populates `(req as AuthenticatedRequest).user`.

#### 8. Is authentication mandatory?
- **YES.** In [`apps/api/src/routes.ts:55`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/routes.ts#L55), all `/api/*` business routes are protected by `protectedStack = [authenticate, profileMiddleware, idempotencyMiddleware]`.
- Public routes: `/health`, `/health/liveness`, `/health/readiness`, `/api/auth/login`, `/api/auth/bootstrap`.
- *Note:* In non-production environments without an `Authorization` header, `middleware/auth.ts:127-148` provides an automated dev fallback to `'stavan'`.

#### 9. Is login local or remote?
- **Strictly Local.** The backend listens on `127.0.0.1:3002` (loopback only). Credentials are authenticated against local SQLite (`systemPrisma`) with zero external network calls.

#### 10. Is there a session?
- **YES.** `Session` model in Prisma. Every successful login generates a cryptographic session ID persisted in `systemPrisma.session` with SHA-256 token hash, client IP, User-Agent, and expiration.

---

### 1.3 User Deletion Trace (UI $\to$ API $\to$ Service $\to$ Prisma $\to$ SQLite)

```
[UI Layer]
   │  (No user deletion button or menu item currently exists in web UI)
   ▼
[API Route]
   │  (No DELETE /api/auth/users route registered in auth.routes.ts)
   ▼
[Service Layer]
   │  (No deleteUser() method exists in auth.service.ts)
   ▼
[Prisma ORM Execution (Hypothetical / Test)]
   │  systemPrisma.user.delete({ where: { id } })
   ├───► Deletes User row from Stavan.db / system DB
   ├───► CASCADES: Deletes User.sessions rows (foreign key onDelete: Cascade)
   ├───► CASCADES: Deletes User.userProfiles join rows (onDelete: Cascade)
   ├───► Profile table record REMAINS INTACT
   ▼
[Filesystem / SQLite]
   └───► %LOCALAPPDATA%\DiamondERP\databases\<code.db> REMAINS 100% INTACT ON DISK
```

**Core Invariant Confirmed:**
$$\text{DELETE USER} \ne \text{DELETE DATABASE}$$
No application code path in V3 touches, truncates, or deletes SQLite `.db` files when user entities are modified or removed.

---

### 1.4 Crucial Architectural Distinction: ERP User vs Local Terminal Owner

| Attribute | Existing V3 `User` | Future Local Terminal Owner |
|---|---|---|
| **Domain** | Diamond ERP Business Domain | Physical Desktop Workstation / Operating System |
| **Examples** | Diamond Grader, Accountant, Sales Clerk, Workshop Manager | The PC owner or diamond merchant sitting at the terminal |
| **Authentication** | Username + Password (bcrypt, 12 rounds) + JWT | Quick 4–8 digit PIN / Windows Hello biometric (`deviceAuth.ts`) |
| **Storage** | SQLite table inside active database file | Local system config / Windows credential store / System DB |
| **Roles** | `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `SALES`, etc. | `TERMINAL_OWNER`, `AUTHORIZED_DEVICE` |
| **Multi-Tenancy** | Associated to profiles via `UserProfile` join table | Associated to the physical machine and allowed local databases |

> [!WARNING]
> Future Phase 2 implementation must **NOT** reuse the business `User` model blindly to represent the local terminal owner. The local owner binds the physical workstation to the software, while `User` records represent employees operating inside business ledgers.

---

## 2. Device Identity Architecture Audit (Code-Level Audit)

### 2.1 Codebase Search for Device & Machine Identifiers

A thorough search across the entire repository for `device`, `machine`, `hardware`, `UUID`, `registry`, and `AppData` revealed:
- **`schema.prisma`:** `deviceId String?` exists as an optional column on `DraftRevision`, `RecordVersion`, and `AuditEvent`. However, **no `Device` model or table exists in Prisma**.
- **`apps/web/src/services/deviceAuth.ts`:** Implements client-side WebAuthn / Windows Hello platform authenticator integration (`isPlatformAuthenticatorAvailable()`, `registerDeviceCredential()`, `verifyDeviceCredential()`) and PBKDF2 PIN hashing (100,000 iterations, SHA-256) stored in `localStorage` under `diamond_erp_device_auth` and `diamond_erp_pin_auth`.
- **`apps/api/src/`:** Contains zero device fingerprinting or machine binding services.

### 2.2 Audit of Existing Installation Identity Mechanisms

| Mechanism | Code Location | Nature of Identity | Classification |
|---|---|---|---|
| `AppDomain.CurrentDomain.BaseDirectory` | [`installer/Launcher.cs:438`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L438) | `C:\Program Files\DiamondERP` | **Application Binary Location** |
| `%LOCALAPPDATA%\DiamondERP` | [`installer/Launcher.cs:464`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L464), [`paths.ts:35`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/paths.ts#L35) | User data directory | **Installation Data Scope** |
| `Global\DiamondERP_SingleInstance_Mutex` | [`installer/Launcher.cs:164`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L164) | Win32 Named Mutex | **Process Identity (Single-Instance)** |
| `Global\DiamondERP_Shutdown_Event` | [`installer/Launcher.cs:490`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs#L490), [`Installer.cs:1608`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1608) | Win32 Named Event | **Process IPC Identity** |
| `HKLM\SOFTWARE\...\Uninstall\DiamondERP` | [`installer/Installer.cs:1726`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs#L1726) | Windows Registry Key | **OS Installation Registration** |

> [!IMPORTANT]
> **Audit Finding:** None of the above mechanisms represent a true cryptographic **Device Identity**. They identify running processes, filesystem paths, or OS installation records. True hardware binding does not yet exist in V3.

### 2.3 Windows Environment Information Currently Read by V3

From inspection of [`installer/Launcher.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs) and [`installer/Installer.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs):
- `Environment.SpecialFolder.LocalApplicationData`
- `Environment.SpecialFolder.ProgramFiles`
- `Environment.SpecialFolder.Windows`
- `Environment.SpecialFolder.DesktopDirectory`
- `Environment.SpecialFolder.UserProfile`
- `Environment.SpecialFolder.Programs`
- `Environment.Is64BitOperatingSystem`
- `RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, ...)`
- `CoreWebView2Environment.GetAvailableBrowserVersionString()`

**What V3 currently does NOT read:**
- `Environment.MachineName` (Computer name)
- `Environment.UserName` (Windows user name)
- `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` (Windows installation GUID)
- Motherboard serial / CPU serial / NIC MAC addresses

### 2.4 Device Identity Status Matrix

| Component | Status in Current V3 | Recommended Future Location |
|---|---|---|
| Hardware Device Fingerprint | **DOES NOT EXIST** | `apps/api/src/modules/system/device.service.ts` |
| Device Database Model | **DOES NOT EXIST** | `apps/api/prisma/schema.prisma` (`model Device`) |
| Platform Authenticator / Biometric | **CLIENT PROTOTYPE** (`deviceAuth.ts`) | Extend to backend verification API |
| Machine GUID Extraction | **DOES NOT EXIST** | `installer/Launcher.cs` / `device.service.ts` |
| Local PIN Storage | **LOCALSTORAGE ONLY** (`deviceAuth.ts`) | Salted bcrypt hash in System DB (`User.pinHash`) |

### 2.5 Security Assessment of Hardware Identifiers for Future Implementation

| Hardware Identifier | Security / Stability Risks | Recommended Strategy |
|---|---|---|
| **MAC Address** | High risk: Changes when user switches Wi-Fi/Ethernet adapters, toggles VPNs, or uses MAC randomization. | **DO NOT USE** as primary identifier. |
| **CPU Serial Number** | Unreliable: Requires elevated WMI queries; often disabled by hypervisors or BIOS. | **DO NOT USE** in desktop software. |
| **Disk Drive Serial** | Brittle: Changes upon drive replacement or partition cloning; fails in virtualized environments. | **DO NOT USE** alone. |
| **Windows SID** | User-specific: Tied to the active Windows user profile; invalid if domain changes. | Secondary factor only. |
| **Windows `MachineGuid`** (`HKLM\SOFTWARE\Microsoft\Cryptography`) | **Stable & Standard:** Unique per Windows OS installation; accessible without administrator elevation; stable across reboots. | **RECOMMENDED**: Primary hardware-bound anchor. |
| **SHA-256 Composite Hash** | Combines `MachineGuid` + CPU Architecture + OS Version into a deterministic hash. | **RECOMMENDED**: Generates a tamper-evident `hardwareFingerprintHash`. |

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

### Future Relationship Rules:
1. **`Installation → Device` (1:N):** Accommodates hardware configuration updates or VM restores under the same installation.
2. **`Device → User` (1:N):** Allows multiple authorized operators (e.g. Day Shift / Night Shift clerks) on one desktop terminal.
3. **`User → UserDatabase → Database` (N:M):** A single user can own or access multiple company ledgers (e.g. `Trading.db`, `Manufacturing.db`); multiple clerks can share access to a single ledger.
4. **Absolute Deletion Rule (Invariant 5):** Deleting a user never deletes the associated SQLite file.
