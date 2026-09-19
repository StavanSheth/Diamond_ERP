# Diamond ERP V3 — Phase 5 Security Matrix

## 1. Authorization & Endpoint Security Matrix

| Operation | Route | Pre-READY State | Post-READY State | Authorization Required | Destructive Confirmation |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Discover Recovery Candidates** | `GET /api/system/recovery/candidates` | Allowed (Restricted bootstrap) | Authenticated | `SUPER_ADMIN` / System Admin | No |
| **Inspect Recovery Candidate** | `POST /api/system/recovery/inspect` | Allowed (Restricted bootstrap) | Authenticated | `SUPER_ADMIN` / System Admin | No |
| **Restore Prepare** | `POST /api/system/recovery/prepare` | Authorized | Authorized | `SUPER_ADMIN` | No |
| **Restore Confirm** | `POST /api/system/recovery/confirm` | Authorized | Authorized | `SUPER_ADMIN` | **Yes** (Bound to `restoreId`, SHA-256, target DB) |
| **Execute Backup** | `POST /api/system/backup` | Authorized | Authorized | `SUPER_ADMIN` / `ADMIN` | No |
| **Export Data** | `POST /api/system/export` | Authorized | Authorized | `SUPER_ADMIN` / `ADMIN` | No |
| **Detect Reinstall State** | `GET /api/system/recovery/reinstall-state` | Allowed (Restricted bootstrap) | Authenticated | `SUPER_ADMIN` / System Admin | No |
| **Continue Installation** | `POST /api/system/recovery/continue-installation` | Explicit candidate selection | Authorized | `SUPER_ADMIN` | **Yes** (Explicit candidate selection) |
| **Start Fresh Installation** | `POST /api/system/recovery/start-fresh` | Explicit confirmation | Authorized | `SUPER_ADMIN` | **Yes** (Explicit user confirmation) |
| **Uninstall Preflight** | `GET /api/system/uninstall/preflight` | Restricted bootstrap | Authorized | `SUPER_ADMIN` | No |
| **Uninstall Backup** | `POST /api/system/uninstall/backup` | Authorized | Authorized | `SUPER_ADMIN` | No |

---

## 2. Security Controls & Protections

### 2.1. Anti-Spoofing & Path Traversal Defense
- **System DB Protection**: Rejects all operations targeting `system.db` or `template.db`.
- **Path Canonicalization**: All file paths are resolved through canonical paths within `%LOCALAPPDATA%\DiamondERP\`. Absolute paths outside allowed directories or containing path traversals (`..`) are rejected.

### 2.2. Secret Exclusion & Sanitization
- **Backup & Export Manifests**: Strictly exclude passwords, password hashes, PIN hashes, session tokens, JWTs, and encryption secrets.
- **Audit Logs**: Redacts credentials and security secrets before writing to logger or event streams.

### 2.3. Confirmation Binding & Replay Protection
- Confirmation tokens for restore operations are cryptographically or deterministically bound to the specific `restoreId`, candidate file path, candidate SHA-256 hash, and target database ID. Replay against differing candidates or targets is rejected with `400 Bad Request`.

### 2.4. Zero Unauthenticated Fallback
- No hardcoded `"admin"` fallback in authentication or authorization middleware.
- Bootstrap operations are explicitly tracked and logged as bootstrap operations rather than impersonating a user identity.
