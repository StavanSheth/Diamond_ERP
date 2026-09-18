# Diamond ERP V3 — Phase 3 WebAuthn Architectural Decision

## 1. Decision Status: Option A (Enforced)
In Phase 3, Diamond ERP V3 adopts **Option A**:
* **The Backend `DeviceSecurity` Foundation is the Authoritative Authority**.
* **Frontend WebAuthn and PBKDF2 screen-shield helpers in `deviceAuth.ts` are UI Workstation Screen-Shields Only**.
* **No browser-side credential or boolean assertion can bypass backend security**.

---

## 2. Rationale
WebAuthn (`PublicKeyCredential`, Windows Hello, Touch ID, Face ID, Android Biometrics) operates locally in the browser/client. Complete cryptographic server-side authentication requires a server-generated challenge, RP ID validation, authenticator data parsing, public key signature verification, and counter validation.

In Diamond ERP V3:
1. The workstation desktop application operates primarily as an offline-first, local-first enterprise desktop system with SQLite databases.
2. The authoritative security foundation is defined in the Control Database via the `DeviceSecurity` model, which enforces 6-digit PIN complexity, salted bcrypt hashing, atomic consecutive failure tracking, 15-minute brute-force lockout windows, and atomic session invalidation.
3. Allowing a browser-side WebAuthn assertion without full cryptographic challenge-response verification on the server would introduce an untrusted client boolean into the core security boundary.
4. Therefore, WebAuthn is clearly scoped as a **client-side workstation screen shield / idle lock** mechanism within `AppLockContext`, while the backend PIN/device security model remains authoritative for all system access.

---

## 3. Legacy SHA-256 Fallback Disposition
* The legacy unsalted SHA-256 path in `apps/web/src/services/deviceAuth.ts` has been isolated into an explicitly marked `@deprecated` internal function: `verifyLegacyUnsaltedSha256()`.
* New credentials configured in `AppLockContext` strictly use PBKDF2 (100,000 iterations, SHA-256, 16-byte random salt).
* Warnings are logged in non-production environments whenever legacy unsalted credentials are read.
