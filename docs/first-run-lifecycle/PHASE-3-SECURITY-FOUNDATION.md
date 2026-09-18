# Diamond ERP V3 — Phase 3: Device Identity & PIN Security Foundation

## 1. Security Architecture Overview
Phase 3 establishes the security layer for local desktop installations of Diamond ERP V3. It provides cryptographic PIN authentication, failed-attempt tracking with automatic lockout, workstation screen lock state, device-bound sessions, and audit trail logging in the Control DB (`system.db`).

```text
┌─────────────────────────────────────────────────────────────┐
│                    CONTROL DB (system.db)                   │
│                                                             │
│  Installation (1) ───< Device (N)                           │
│                          │ (1:1)                            │
│                          ▼                                  │
│                   DeviceSecurity                            │
│                   ├── pinHash (bcryptjs, salt=10)           │
│                   ├── failedAttempts (0..5)                 │
│                   ├── lockedUntil (15 min lockout)          │
│                   ├── isLocked (workstation lock)           │
│                   └── timestamps                            │
│                                                             │
│  Session ─────────────────> deviceId (optional link)        │
│  AuditEvent ──────────────> entityType="DeviceSecurity"     │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ DECOUPLED & ISOLATED
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                PROFILE DATABASES (<name>.db)                │
│                                                             │
│  Transactions, Stocks, Diamonds, Parties, Ledger Entries    │
│  * 100% untouched by PIN changes, locks, or revocations     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Identity Separation
Phase 3 enforces strict separation between all six identity concepts:
1. **Windows User**: Operating system login account.
2. **Application Device**: Stable UUID v4 persisted in `%LOCALAPPDATA%\DiamondERP\config\.device-id`.
3. **Application Installation**: Stable UUID v4 persisted in `%LOCALAPPDATA%\DiamondERP\config\.installation-id`.
4. **Business User**: ERP database user (`User` table in `system.db`) authenticated via username and password.
5. **Application PIN**: 6-digit cryptographic credential stored as a salted bcrypt hash in `DeviceSecurity`.
6. **Business User Password**: Independent password credential for ERP users.

Changing a business user password has zero effect on the device PIN. Changing the device PIN has zero effect on business user passwords.

---

## 3. PIN Security & Cryptographic Model
- **Algorithm**: `bcryptjs` (salt rounds = 10). Generates dynamic salted hashes.
- **PIN Policy**: Exactly 6 numeric digits (`0-9`), strict validation rejecting whitespace, empty input, or non-numeric characters.
- **Weak PIN Protection**: Rejects trivially repeated digits (e.g. `000000`, `777777`), ascending/descending sequences (e.g. `123456`, `654321`), and dictionary entries (`121212`, `112233`).
- **Timing Attack Defense**: Verification uses constant-time comparison (`bcrypt.compare`).
- **Zero Plaintext Storage**: Plaintext PIN is never stored on disk, never logged, and never returned in API payloads.
- **Zero Hash Exposure**: `pinHash` is strictly confined to internal backend verification logic and omitted from all public DTOs.

---

## 4. Failed Attempts & Lockout Policy
- **Threshold**: Maximum 5 consecutive failed verification attempts (`SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS`).
- **Lockout Duration**: 15 minutes (`15 * 60 * 1000` ms).
- **Behavior**:
  - Attempts 1 to 4: Returns remaining attempts (`5 - failedAttempts`).
  - Attempt 5: Sets `isLocked = true` and `lockedUntil = Date.now() + 15 mins`. Records `PIN_LOCKED` audit event.
  - Active Lockout: All PIN verification requests are rejected immediately without comparing hashes.
  - Lockout Expiration: When `lockedUntil <= Date.now()`, the lockout automatically expires upon the next request, resetting `failedAttempts = 0` and `isLocked = false`.
- **Concurrency Safety**: Atomic database updates ensure concurrent verification requests cannot race to corrupt the failed attempt counter.

---

## 5. Device Binding & Revocation State
- **Authoritative Identity**: Uses `%LOCALAPPDATA%\DiamondERP\config\.device-id` managed by `InstallationService`.
- **Binding Rule**: Bound when an active `Device` record exists in `system.db` referencing the installation.
- **REVOKED Device Invariant**: A revoked device is prohibited from configuring a PIN, verifying a PIN, or changing a PIN. Administrative reactivation is required.
- **Reactivation**: Restores device authentication without losing historical security state.

---

## 6. Workstation Application Lock (Screen Shield)
- **State**: `isLocked: boolean` on `DeviceSecurity`.
- **Lock**: `POST /api/system/security/lock` sets `isLocked: true`.
- **Unlock**: `POST /api/system/security/unlock` verifies the PIN and resets `isLocked: false`.
- **Decoupled from Logout**: Locking protects the workstation screen without destroying business transactions or ERP draft states.

---

## 7. Session Invalidation & Integration
- `Session` model in `system.db` includes `deviceId?: string`.
- When PIN is changed via `POST /api/system/security/pin/change`, all active unrevoked sessions bound to the device are revoked (`revokedAt = new Date()`), forcing re-authentication.

---

## 8. Security Audit Logging
Events recorded in `AuditEvent` (`system.db`):
- `PIN_CONFIGURED`
- `PIN_CHANGED`
- `PIN_VERIFICATION_SUCCESS`
- `PIN_VERIFICATION_FAILED`
- `PIN_LOCKED`
- `PIN_UNLOCKED`
- `DEVICE_BOUND`
- `DEVICE_REVOKED`
- `DEVICE_REACTIVATED`
- `SECURITY_STATE_CHANGED`

All audit metadata is sanitized: PINs, hashes, passwords, and tokens are explicitly stripped prior to persistence.

---

## 9. Database Migration & Compatibility
- **Migration**: `20260918120000_add_device_security_foundation`
- **Actions**:
  - Creates table `DeviceSecurity` with foreign key cascade to `Device(deviceId)`.
  - Alters table `Session` to add `deviceId TEXT` with index `Session_deviceId_idx`.
- **Deployability**: Validated with `npx prisma migrate deploy`. Fully idempotent on re-execution.
- **Data Preservation**: 100% preservation of existing `User`, `Profile`, `UserProfile`, `Device`, and physical `.db` profile files.

---

## 10. API Endpoints
| Method | Path | Description | Authorization |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/system/security` | Get device security status | Public / Bootstrap |
| `GET` | `/api/system/security/status` | Get device security status | Public / Bootstrap |
| `POST` | `/api/system/security/pin/setup` | Initial PIN setup | Pre-READY bootstrap or Auth |
| `POST` | `/api/system/security/pin/verify` | Verify 6-digit PIN | Public / Local device |
| `POST` | `/api/system/security/pin/change` | Change PIN with current verification | Public / Local device |
| `POST` | `/api/system/security/lock` | Workstation screen lock | Public / Local device |
| `POST` | `/api/system/security/unlock` | Unlock workstation with PIN | Public / Local device |
| `POST` | `/api/system/device/bind` | Bind device security record | Public / Local device |

---

## 11. Test Coverage
1. `apps/api/src/tests/pin-security.test.ts` (22 tests):
   - PIN policy validation (short, long, non-numeric, repeated, sequential, whitespace).
   - Salted bcrypt hashing and constant-time verification.
   - Initial PIN setup and concurrent setup race conditions.
   - Failed attempts tracking, 15-min lockout at 5 failures, lockout expiration.
   - PIN change lifecycle and rejection of incorrect current PIN.
2. `apps/api/src/tests/device-security.test.ts` (5 tests):
   - Device binding and clean non-secret status response.
   - Revocation blocking authentication and administrative reactivation.
   - Application lock / unlock cycle.
   - Business session association and invalidation on PIN change.
3. `apps/api/src/tests/security-foundation.test.ts` (5 tests):
   - Lifecycle Invariant 1 (PIN_SETUP completion requires PIN).
   - Lifecycle Invariant 2 (DEVICE_SETUP completion requires active device).
   - Business password vs device PIN independence.
   - Profile database preservation (SHA-256 binary hash invariance).
   - Zero plaintext and zero hash leakage in DB and audit tables.
4. Regression Suites:
   - `phase2-migration.test.ts` (3 tests): 100% PASS.
   - `lifecycle-foundation.test.ts` (57 tests): 100% PASS.
   - `scripts/test-phase1-first-run-audit.js` (93 checks): 100% PASS.

---

## 12. Phase 4 Readiness & Handoff Contract
Phase 4 (First-Run Onboarding State Machine & UI) can directly consume:
- `securityApi.getStatus()` / `securityService.getStatus()`
- `securityApi.setupPin(pin)` / `securityService.setupPin(pin)`
- `securityApi.verifyPin(pin)` / `securityService.verifyPin(pin)`
- `securityApi.lock()` / `securityApi.unlock(pin)`
- `installationService.updateLifecycleState(targetState, { enforceInvariants: true })`
All backend services, persistence models, and DTO contracts are fully operational.
