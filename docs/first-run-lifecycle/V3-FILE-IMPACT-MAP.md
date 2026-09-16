# Diamond ERP V3.0 — File Impact Map (Phases 2–8)

> **Phase 1 Audit Artifact — Authoritative Implementation Matrix**  
> **Repository:** `https://github.com/StavanSheth/Diamond_ERP`  
> **Branch:** `v3`  
> **Authority:** Actual V3 Source Code  
> **Status:** Remediated Phase 1 Architecture Audit (Confidence $\ge 90\%$)  
> **Standard:** `NO CHANGE` | `EXTEND` | `REFACTOR` | `NEW FILE`

---

## 1. Frontend Architecture File Classification

### 1.1 Frontend Files to REUSE (Call As-Is)
- [`apps/web/src/services/deviceAuth.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/deviceAuth.ts): Reused for WebAuthn platform authenticator registration, verification, and client-side PBKDF2 PIN hashing.
- [`apps/web/src/services/draftDb.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/draftDb.ts): Reused for IndexedDB offline auto-save and sync queue management.
- [`apps/web/src/components/layout/Sidebar.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/layout/Sidebar.tsx): Reused as the primary ERP navigation sidebar.
- [`apps/web/src/components/layout/TopBar.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/layout/TopBar.tsx): Reused for active user display and profile indicator.
- [`apps/web/src/index.css`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/index.css): Reused for the complete CSS design token system and liquid glass styles.

### 1.2 Frontend Files to EXTEND
- [`apps/web/src/App.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/App.tsx): Extend router to conditionally render `OnboardingWizard` when first-run lifecycle state is detected.
- [`apps/web/src/contexts/AuthContext.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AuthContext.tsx): Refactor out hardcoded `DEFAULT_USER` fallback; connect to dynamic user state and PIN authentication.
- [`apps/web/src/contexts/AppLockContext.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AppLockContext.tsx): Extend idle lock timer to verify PIN against backend API.
- [`apps/web/src/services/api/client.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/api/client.ts): Extend with lifecycle and database discovery API calls; attach `X-Device-Id` header.
- [`apps/web/src/components/security/FirstRunActivationOverlay.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/components/security/FirstRunActivationOverlay.tsx): Extend post-activation transition to hand off to the Onboarding Wizard.

### 1.3 Frontend Files to NOT TOUCH (Zero Changes)
- `apps/web/src/domains/inventory/*` (Inventory views, diamond grids, parcel details)
- `apps/web/src/domains/ledger/*` (Financial transactions, ledger records)
- `apps/web/src/domains/parties/*` (Party directories, customer & supplier views)
- `apps/web/src/domains/repairs/*` (Repair workflows, carat loss tracking)
- `apps/web/src/domains/reports/*` (Financial reporting tables, analytics)
- `apps/web/src/domains/transactions/*` (Transaction forms and authorization)
- `apps/web/src/pages/InventoryPage.tsx`
- `apps/web/src/pages/LedgerPage.tsx`
- `apps/web/src/pages/PartiesPage.tsx`
- `apps/web/src/pages/RepairsPage.tsx`
- `apps/web/src/pages/ReportsPage.tsx`

---

## 2. Phase 2 Files: Lifecycle Data Model & Schema

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| [`apps/api/prisma/schema.prisma`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/prisma/schema.prisma) | **EXTEND** | Add `Installation`, `Device`, `UserDatabase` models; add `pinHash String?` to `model User`. | **Medium**: Altering schema requires updating `template.db`. | Phase 1 baseline |
| [`packages/contracts/src/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/packages/contracts/src/index.ts) | **EXTEND** | Add TypeScript contracts for `Device`, `Installation`, and `UserDatabase` entities. | **Low**: Pure type definitions. | `schema.prisma` |
| [`scripts/sync-template-db.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/sync-template-db.js) | **EXTEND** | Ensure template DB checkpoint captures newly added tables with 0 rows. | **Low**: Dev script. | `schema.prisma` |
| `apps/api/src/tests/schema.test.ts` | **NEW FILE** | Validate schema migration, relational integrity, and blank template state. | **Low**: Test-only. | Vitest |

---

## 3. Phase 3 Files: Device Setup & PIN Authentication

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| [`apps/api/src/modules/auth/auth.service.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts) | **EXTEND** | Add salted PIN hashing (`hashPin`, `verifyPin`) using `bcryptjs` and PIN lockout logic. | **Medium**: PIN must never be logged or exposed in plaintext. | Phase 2 schema |
| [`apps/api/src/modules/auth/auth.controller.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.controller.ts) | **EXTEND** | Add `pinLogin` and `setupPin` controller actions with rate limiting. | **Low**: Thin HTTP wrapper. | `auth.service.ts` |
| [`apps/api/src/modules/auth/auth.routes.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.routes.ts) | **EXTEND** | Register `/api/auth/pin-login` and `/api/auth/setup-pin` routes. | **Low**: Route definitions. | `auth.controller.ts` |
| `apps/api/src/modules/system/device.service.ts` | **NEW FILE** | Compute hardware fingerprint from Windows `MachineGuid`, bind device to installation. | **Medium**: Must handle virtual machines and hardware upgrades gracefully. | Phase 2 schema |
| `apps/api/src/modules/system/device.controller.ts` | **NEW FILE** | Expose device registration and validation endpoints. | **Low**: Controller. | `device.service.ts` |
| [`apps/web/src/services/deviceAuth.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/services/deviceAuth.ts) | **EXTEND** | Bridge client-side WebAuthn credentials with backend device verification. | **Low**: WebAuthn wrapper. | Browser WebAuthn API |

---

## 4. Phase 4 Files: First-Run Onboarding Flow

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | **NEW FILE** | Interactive multi-step UI wizard: Device Setup $\to$ User Detection $\to$ DB Discovery $\to$ Provisioning. | **Medium**: Complex UI state; must adhere to liquid glass design. | Phase 3 auth APIs |
| [`apps/web/src/App.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/App.tsx) | **EXTEND** | Intercept routing to render `OnboardingWizard` when system is uninitialized. | **Medium**: Router modification; must avoid infinite redirect loops. | `OnboardingWizard.tsx` |
| [`apps/web/src/contexts/AuthContext.tsx`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/web/src/contexts/AuthContext.tsx) | **REFACTOR** | Replace hardcoded `'stavan'` fallback with real first-run / unauthenticated state. | **Medium**: Affects initial user identity in React tree. | API client |
| [`apps/api/src/middleware/profile.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/middleware/profile.ts) | **EXTEND** | Exempt onboarding and lifecycle routes from requiring existing profile context. | **Low**: Route whitelist check. | Express middleware |

---

## 5. Phase 5 Files: Database Discovery, Validation & Attachment

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| `apps/api/src/modules/system/database-validation.service.ts` | **NEW FILE** | Validate SQLite file header, execute `PRAGMA integrity_check`, verify schema version. | **High**: Must reject corrupted or malicious SQLite files before opening. | `paths.ts` |
| `apps/api/src/modules/system/database-discovery.service.ts` | **NEW FILE** | Scan `%LOCALAPPDATA%\DiamondERP\databases` for existing valid `.db` files. | **Medium**: Must enforce path traversal restrictions. | `paths.ts` |
| `apps/api/src/modules/system/database-lifecycle.controller.ts` | **NEW FILE** | HTTP controller for discovery, validation, and attachment confirmation. | **Low**: Controller. | Discovery & validation services |
| [`apps/api/src/modules/system/system.routes.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/system/system.routes.ts) | **EXTEND** | Mount database discovery and validation endpoints. | **Low**: Route definitions. | Controller |

---

## 6. Phase 6 Files: New User & Blank DB Provisioning

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| [`apps/api/src/infrastructure/database/prisma.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/infrastructure/database/prisma.ts) | **REFACTOR** | Decouple hardcoded `'Stavan'` default profile; dynamically provision blank DB from `template.db`. | **High**: Core DB routing layer. Must preserve LRU caching and mutexes. | Phase 2, 5 |
| [`apps/api/src/config/index.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/config/index.ts) | **REFACTOR** | Update `databaseUrl` fallback to point to dynamic system database rather than `'Stavan.db'`. | **Low**: Config fallback. | `paths.ts` |
| [`apps/api/src/modules/auth/auth.service.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/auth/auth.service.ts) | **EXTEND** | Support atomic creation of user + blank database provisioning in a single workflow. | **Medium**: Enforce Invariant 1 (New user $\to$ new blank database). | `prisma.ts` |

---

## 7. Phase 7 Files: Backup, Export & Uninstall Recovery

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| [`apps/api/src/modules/settings/settings.controller.ts`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/apps/api/src/modules/settings/settings.controller.ts) | **EXTEND** | Enhance `backupDatabase` with multi-tenant backup, ZIP packaging, and structured CSV/Excel export. | **Medium**: Must not block event loop during large database backups. | `exceljs`, `csv-stringify` |
| [`installer/Installer.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Installer.cs) | **EXTEND** | Add pre-uninstall backup hook prompt; preserve customer AppData directory. | **Medium**: C# installer code. Must handle cancellation cleanly. | Win32 / .NET 4.0 |
| [`installer/Launcher.cs`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/installer/Launcher.cs) | **EXTEND** | Pass hardware identifier / machine GUID to child node process via environment variables. | **Low**: Process startup. | Win32 / .NET 4.0 |
| `apps/api/src/modules/settings/export.service.ts` | **NEW FILE** | Sanitize and export database tables to Excel and CSV while omitting passwords and PINs. | **Medium**: Enforce Invariant 12 (No PIN/password export). | `exceljs`, `csv-stringify` |

---

## 8. Phase 8 Files: Release Packaging & Verification

| Existing / New File | Action | Why | Risk | Dependencies |
|---|---|---|---|---|
| [`scripts/stage-windows-build.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/stage-windows-build.js) | **EXTEND** | Ensure updated `template.db` and all required production assets are staged. | **Low**: Packaging script. | Node fs |
| [`scripts/package-windows-release.js`](file:///c:/Projects/ERP%20-%20Copy/Test/TestV3.0/scripts/package-windows-release.js) | **NO CHANGE** | Assembler pipeline is already robust. | **None** | CSC compiler |
| `scripts/test-phase8-lifecycle-e2e.js` | **NEW FILE** | End-to-end automated test verifying fresh install, onboarding, discovery, backup, and recovery. | **Low**: Test suite. | Puppeteer / Node |

---

## 9. Protected Business Modules — Strictly NOT TO TOUCH

The following functional business modules and core infrastructure components must remain completely unchanged:
- `apps/api/src/modules/stocks/*` (Stock parcels, inventory movements)
- `apps/api/src/modules/ledger/*` (Financial ledgers, payments, statements)
- `apps/api/src/modules/parties/*` (Parties, customers, suppliers)
- `apps/api/src/modules/repairs/*` (Repair workflows, carat loss)
- `apps/api/src/modules/certificates/*` (Lab grading, certificate files)
- `apps/api/src/modules/transactions/*` (Transaction state machines)
- `apps/api/src/modules/diamonds/*` (Diamond item tracking)
- `apps/web/src/domains/*` (All domain UI components)
- `installer/Launcher.manifest` (DPI and OS compatibility)
- `installer/Installer.manifest` (UAC administrator level)
