# Diamond ERP V3 — Phase 3 Security Boundary & Threat Model

## 1. Security Architecture & Identity Separation
Diamond ERP V3 enforces strict physical and logical boundaries between distinct identity layers:

```text
WINDOWS OS USER
      ≠
APPLICATION INSTALLATION  (UUID v4 in Control DB)
      ≠
APPLICATION DEVICE        (Local persistent hardware/device ID on disk)
      ≠
BUSINESS ERP USER         (Accounts in Control DB: Super Admin, Admin, Manager, etc.)
      ≠
APPLICATION PIN           (6-digit device PIN stored as bcrypt hash in DeviceSecurity)
      ≠
BUSINESS USER PASSWORD    (Multi-character bcrypt user password)
```

---

## 2. API Security Boundary Enforcement Flow

```text
CLIENT REQUEST
     │
     ▼
[Security Controller / Route Boundary]
     │
     ├── 1. Authoritative Device Resolution:
     │      Reads host persistent device ID from disk via InstallationService.
     │      Validates: If req.body.deviceId supplied, must === authoritativeDeviceId.
     │      Mismatch → 400 ValidationError.
     │
     ├── 2. Installation Ownership Check:
     │      Queries Device from Control DB.
     │      Validates: Device.installationId === Installation.id.
     │      Mismatch → 403 AuthorizationError.
     │
     ├── 3. Device Lifecycle Status Check:
     │      Validates: Device.status === 'ACTIVE'.
     │      REVOKED → 403 AuthorizationError.
     │
     ├── 4. Operation-Level Bootstrap Predicates:
     │      - setupPin: Rejects with 409 Conflict if PIN already exists.
     │                  If lifecycle == READY, requires authenticated session.
     │      - changePin: If lifecycle == READY, requires authenticated session.
     │      - bindDevice: If lifecycle == READY, requires authenticated session.
     │
     ▼
[Device Security State Execution]
     │
     ├── 5. Lockout Invariance:
     │      If authenticationLockedUntil > now:
     │      REJECT immediately (blocks correct PIN, wrong PIN, PIN change, unlock).
     │
     ├── 6. Unified Failure Tracking (recordPinFailure):
     │      Failed attempts atomically incremented.
     │      5 consecutive failures → sets 15-minute authenticationLockedUntil.
     │
     └── 7. Session Invalidation:
            PIN change or Device revocation atomically marks active Session rows
            as revokedAt = NOW().
```

---

## 3. Section 48 Attack Test Defense Summary

| Attack | Scenario | Mechanism | Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Attack 1** | Client submits another registered device ID | `resolveAuthoritativeDeviceId()` checks supplied ID vs host ID | `ValidationError` (`400`) | **PASS** |
| **Attack 2** | Client submits device ID from another installation | Cross-installation check in `getOrCreateDeviceSecurity()` | `AuthorizationError` (`403`) | **PASS** |
| **Attack 3** | Client calls PIN change without auth after `READY` | Predicate `canChangePin()` inspects session context | `AuthorizationError` (`403`) | **PASS** |
| **Attack 4** | Client calls lock on another device | `securityService.lock()` enforces authoritative resolution | `ValidationError` (`400`) | **PASS** |
| **Attack 5** | Client calls unlock on another device | `securityService.unlock()` enforces authoritative resolution | `ValidationError` (`400`) | **PASS** |
| **Attack 6** | Revoked device attempts authentication | `verifyPin()` checks `device.status === 'REVOKED'` | `AuthorizationError` (`403`) | **PASS** |
| **Attack 7** | Client uses old session token after PIN change | `changePin()` invalidates device sessions; `auth` checks `revokedAt` | `401 Unauthorized` | **PASS** |
| **Attack 8** | Client uses session token after device revocation | `revokeDevice()` invalidates device sessions atomically | `401 Unauthorized` | **PASS** |
| **Attack 9** | Old revoked session used after device reactivation | `reactivateDevice()` explicitly preserves revoked session state | `401 Unauthorized` | **PASS** |
| **Attack 10** | Correct PIN submitted during active lockout | `verifyPin()` checks `lockedUntil > now` before hash verification | Blocked with lockout response | **PASS** |
