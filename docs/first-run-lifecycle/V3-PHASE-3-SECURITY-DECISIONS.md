# Diamond ERP V3 — Phase 3 Security Decision Records (ADR)

This document records the architectural and cryptographic decisions made during Phase 3 implementation, explaining the rationale and alternatives considered.

---

## 1. PIN Hashing Algorithm: `bcryptjs` (Salt Rounds = 10)
- **Decision**: Use `bcryptjs` with salt work factor of 10.
- **Why**: Diamond ERP V3 is an offline Windows desktop application packaged as an installer with bundled Node.js and WebView2. `bcryptjs` is already installed and proven in the codebase. It does not require native C++ build tools (`node-gyp`, Visual Studio C++ Build Tools, Python) on target deployment systems, preventing distribution failures while providing salted key stretching with constant-time verification.
- **Alternatives Considered**:
  - *Argon2id*: Considered per prompt preference. However, `argon2` requires native compiled binary addons which introduce severe compilation fragility across diverse Windows desktop targets and WebView2 packaging. Since `bcryptjs` already powers user authentication in V3, standardizing on bcrypt ensures reliable, zero-native-compilation packaging.
  - *SHA-256 (Raw/Deterministic)*: Rejected. Vulnerable to pre-computation and rainbow tables.

---

## 2. PIN Length & Strict Policy
- **Decision**: Exactly 6 numeric digits (`0-9`).
- **Why**: 6 digits provides 1,000,000 combinations, which with a 5-attempt lockout threshold renders online brute force mathematically infeasible (probability $\le 0.0005\%$). 6 digits is the standard for Windows PINs, mobile banking apps, and POS hardware.
- **Policy Enforcement**:
  - Reject non-numeric input, whitespace, empty values, or malformed payloads.
  - Reject trivially repeated digits (`000000`, `111111`, etc.).
  - Reject sequential runs (`123456`, `654321`, `012345`, `543210`).
  - Reject dictionary patterns (`121212`, `112233`).

---

## 3. Failed Attempts Limit (5) & Lockout Duration (15 Minutes)
- **Decision**: 5 consecutive failed attempts trigger an automatic 15-minute lockout.
- **Why**: Prevents brute-force attacks at the physical workstation. When lockout expires, the system gracefully resets attempt counters upon the next verification request, avoiding permanent lockout while providing strong rate limiting.
- **Atomic Concurrency**: State updates use database transactions to eliminate race conditions when concurrent requests fail simultaneously.

---

## 4. Authoritative Device Identity vs Hardware Signals
- **Decision**: Authoritative device identity is the UUID v4 persisted in `%LOCALAPPDATA%\DiamondERP\config\.device-id` (established in Phase 2).
- **Why**: Hardware attributes (MAC address, BIOS UUID, motherboard serial, CPU serial) fluctuate on Windows due to docking stations, virtual network adapters (Hyper-V/VPN), driver updates, or motherboard replacement. An application-controlled UUID guarantees persistent identity across reboots and network reconfigurations. Hardware signals remain optional secondary telemetry.

---

## 5. Strict Decoupling: Device PIN vs Business User Password
- **Decision**: Device PIN belongs strictly to `DeviceSecurity` in the Control DB (`system.db`). Business user passwords belong to `User` in `system.db`.
- **Why**:
  - A single workstation device may be used by multiple business users (e.g. Sales, Manager, Accountant).
  - Business users may log into multiple devices.
  - Resetting or changing a business user's password must never invalidate the physical workstation's PIN, and changing the device PIN must never alter business user credentials.

---

## 6. Control DB Placement vs Profile ERP Databases
- **Decision**: Store all security metadata (`DeviceSecurity`, `Session`, `AuditEvent`) in `system.db`, completely outside profile databases (`<profile>.db`).
- **Why**: Profile databases store ERP financial records, diamond stock, and ledger transactions. If a user backs up or exports a profile database, it must never contain device security hashes, PINs, or device tokens. Furthermore, verifying local workstation access must never trigger dynamic SQLite profile DB provisioning.

---

## 7. Session Association & Invalidation
- **Decision**: Associate `deviceId` with `Session` in `system.db`. Revoke device sessions on PIN change.
- **Why**: When a device's PIN is changed, existing business sessions active on that device are revoked (`revokedAt = new Date()`), preventing stale or compromised sessions from continuing without re-authentication.

---

## 8. Workstation Lock vs Business User Logout
- **Decision**: Implement `isLocked` as an explicit workstation security shield.
- **Why**: Locking protects the screen when an employee steps away from their desk without terminating the active business session, closing open forms, or discarding in-progress inventory drafts. Unlocking requires entering the 6-digit device PIN.

---

## 9. PIN Recovery Policy: Intentionally NOT Part of Phase 3 (Explicitly Out of Scope)
- **Decision**: PIN recovery, forgot PIN, master PIN, emergency PIN, hardcoded bypass PIN, secret recovery code, email/SMS recovery, security-question recovery, and recovery tokens are **explicitly NOT part of Phase 3 scope**.
- **Why**: There must be NO alternate authentication path around the application PIN. If the user forgets the PIN, Phase 3 provides no recovery or bypass mechanism. Any future administrative recovery workflow may be designed independently in a later phase, but is strictly out of scope for Phase 3. There is no backdoor, no master PIN, and no bypass.

---

## 10. Audit Logging without Secret Leakage
- **Decision**: Log all security events in `AuditEvent` (`system.db`) while strictly stripping sensitive fields (`pin`, `pinHash`, `password`, `token`) from descriptions and JSON metadata.
- **Why**: Audit trails must track authentication success, failure, lockouts, and revocations for compliance without creating a secondary leak vector for credentials.
