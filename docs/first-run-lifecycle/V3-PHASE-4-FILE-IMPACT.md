# Diamond ERP V3 — Phase 4 File Impact Map

## Overview
This document tracks all files modified, created, or impacted during the Phase 4 implementation of First-Run Onboarding, User Discovery, and Database Discovery/Attachment.

---

## Changed Files

| File | Current Purpose | Why Changed | Change Type | Risk | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `packages/contracts/src/dto/onboarding.ts` | Shared onboarding DTOs & schemas | Created Phase 4 shared DTOs (`OnboardingStatusDto`, `UserDiscoveryCandidateDto`, `UserDiscoveryResponseDto`, `DatabaseDiscoveryCandidateDto`, `DatabaseDiscoveryResponseDto`, `DatabaseAttachmentPreviewDto`, `AttachDatabaseRequest`, `CreateDatabaseRequest`, `CreateOnboardingUserRequest`, `SelectUserRequest`, `OnboardingOperationResponse`) | NEW | Low | Contract build & typecheck |
| `packages/contracts/src/dto/index.ts` | Contracts DTO barrel | Export onboarding DTOs | MODIFIED | Low | Typecheck |
| `packages/contracts/src/index.ts` | Contracts root barrel | Export onboarding types | MODIFIED | Low | Typecheck |
| `apps/api/src/infrastructure/database/prisma.ts` | Prisma client factory & profile DB resolution | Hardened `ensureProfileDbFile` to fail closed when `template.db` is missing instead of creating a 0-byte SQLite stub | MODIFIED | Medium | `phase4-onboarding.test.ts` Group 10 |
| `apps/api/src/infrastructure/paths.ts` | Centralized filesystem path resolution | Added strict `process.env.DIAMOND_TEMPLATE_DB` precedence; eliminated fallback to live business databases (`test.db`, `Stavan.db`) | MODIFIED | Medium | `phase4-onboarding.test.ts` Group 10, paths tests |
| `apps/api/src/modules/system/onboarding/onboarding.types.ts` | Onboarding module types | Internal interfaces and classification enums for candidate scoring | NEW | Low | Typecheck |
| `apps/api/src/modules/system/onboarding/onboarding.service.ts` | Authoritative onboarding service | Core business engine for onboarding status, app setup, bounded user discovery, user creation/association, bounded DB discovery, DB inspection & validation, explicit DB attachment, new DB provisioning, failure compensation, restart-safety, and `assertReady()` checklist | NEW | High | `phase4-onboarding.test.ts` (Groups 1-19) |
| `apps/api/src/modules/system/onboarding/onboarding.controller.ts` | HTTP Controller | Zod request validation, bootstrap security guards (authorization matrix), and sanitized response formatting (zero secret leakage) | NEW | Medium | API integration |
| `apps/api/src/modules/system/onboarding/onboarding.routes.ts` | Express Router | Endpoints for `/status`, `/app-setup`, `/users`, `/users/select`, `/users/create`, `/databases`, `/databases/inspect`, `/databases/attach`, `/databases/create`, `/complete`, `/reset` | NEW | Low | Route mounting |
| `apps/api/src/modules/system/onboarding/index.ts` | Onboarding module barrel | Barrel export for onboarding module | NEW | Low | Typecheck |
| `apps/api/src/modules/system/system.routes.ts` | System router | Mounted `/onboarding` router under `/system` | MODIFIED | Low | API regression & routing |
| `apps/web/src/services/api/onboarding.api.ts` | Frontend API client | Typed client methods for all onboarding endpoints | NEW | Low | Web build & typecheck |
| `apps/web/src/services/onboarding.ts` | Web onboarding barrel | Re-exports `onboarding.api.ts` | NEW | Low | Web build |
| `apps/web/src/services/api.ts` | Web API facade | Attached `onboarding: onboardingApi` to singleton `api` object | MODIFIED | Low | Web build |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | Onboarding React UI | Comprehensive, responsive 8-step first-run wizard supporting App Setup, PIN Setup, Device Setup, User Discovery/Creation, Database Discovery, Validation, Attachment Confirmation, and Completion | NEW | Medium | `OnboardingWizard.spec.tsx` |
| `apps/web/src/App.tsx` | Main application shell | Mounted `OnboardingWizard` when `lifecycleState !== 'READY'` to guide fresh installations deterministically into ready state | MODIFIED | Low | Web unit & E2E |
| `apps/web/src/tests/unit/OnboardingWizard.spec.tsx` | Frontend unit tests | 4 tests verifying wizard rendering, step transitions, and user flow | NEW | Low | Vitest (4/4 PASS) |
| `apps/api/src/tests/phase4-onboarding.test.ts` | Automated test suite | 20 comprehensive tests covering all 19 Phase 4 requirement groups (Fresh Install, App Setup, User Discovery, User Creation, User Association, DB Discovery, Path Security, DB Attachment, New DB Provisioning, Missing Template Failure, Control/Template DB Protection, Unrelated DB Protection, Concurrency, Failure Compensation, Restart Recovery, Security Leakage Check, Profile Isolation, Deletion Invariants, Ready Gate) | NEW | Low | Verified (20/20 PASS) |

---

## Invariants & Design Boundaries

1. **Zero PIN Recovery / Zero Bypass**:
   PIN management remains strictly owned by Phase 3's `PinService` and `DeviceSecurityService`. No PIN recovery, secret question, master PIN, or bypass was added.
2. **Zero Destructive Deletion**:
   Physical SQLite databases are never deleted on user disassociation, profile deletion, onboarding reset, or cancellation.
3. **Template Invariant**:
   If `template.db` is missing, provisioning fails closed immediately. Never generates a 0-byte or corrupted database.
4. **Bounded Filesystem Discovery**:
   Database discovery searches only registered registry records, configured data directories, and user-specified paths. No recursive whole-drive scanning of `C:\`.
5. **Mandatory Explicit Attachment Confirmation**:
   Even if a valid candidate database is discovered, it is never attached automatically. The user must review metadata and explicitly confirm attachment.

---

## Deleted Files
None. Zero files were deleted.

---

## Migration Impact
No new Prisma migrations were required for Phase 4. The existing `system.db` schema (with `Installation`, `Device`, `DeviceSecurity`, `InstallationUser`, `User`, `UserProfile`, `Profile`, and `DatabaseRegistry`) fully supports the complete Phase 4 relational identity model.
