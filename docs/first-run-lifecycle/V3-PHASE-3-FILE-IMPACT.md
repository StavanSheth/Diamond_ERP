# Diamond ERP V3 — Phase 3 File Impact Map

## Overview
This document tracks all files modified, created, or impacted during the Phase 3 implementation of the Device Identity, PIN Security, and Device Lock foundation.

---

## Changed Files

| File | Current Purpose | Why Changed | Change Type | Risk | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `packages/contracts/src/dto/security.ts` | Shared security DTOs | Created Phase 3 shared types (`PinSetupRequest`, `PinVerifyRequest`, `PinChangeRequest`, `PinVerificationResponse`, `DeviceSecurityDto`, `SecurityStatusDto`, `LockStateDto`) | NEW | Low | Full contract build & typecheck |
| `packages/contracts/src/dto/index.ts` | Contracts DTO barrel | Export security DTOs | MODIFIED | Low | Typecheck |
| `packages/contracts/src/index.ts` | Contracts package root barrel | Export security types | MODIFIED | Low | Typecheck |
| `apps/api/prisma/schema.prisma` | Prisma ORM schema | Added `DeviceSecurity` model, relation to `Device`, and `deviceId` with index to `Session` | MODIFIED | Medium | `phase2-migration.test.ts`, Prisma deploy |
| `apps/api/prisma/migrations/20260918120000_add_device_security_foundation/migration.sql` | Database migration | Creates `DeviceSecurity` table and adds `deviceId` column to `Session` | NEW | Low | `phase2-migration.test.ts` real migration runner |
| `apps/api/src/modules/security/security.constants.ts` | Security configuration | Authoritative PIN length, attempt limits, lockout duration, disallowed PINs, audit events (including `APPLICATION_LOCKED`, `APPLICATION_UNLOCKED`) | NEW | Low | `pin-security.test.ts` |
| `apps/api/src/modules/security/security.types.ts` | Security module types | Re-exports and internal types | NEW | Low | Typecheck |
| `apps/api/src/modules/security/pin.service.ts` | PIN validation & hashing | 6-digit validation, weak combination rules, salted bcrypt hashing, constant-time verification | NEW | Medium | `pin-security.test.ts` |
| `apps/api/src/modules/security/device-security.service.ts` | Device security operations | Atomic PIN setup, concurrency-safe attempt tracking via Prisma atomic increment, 15-min lockout, optimistic concurrency on PIN change, app lock/unlock decoupling, audit logging | MODIFIED | High | `pin-security.test.ts`, `device-security.test.ts`, `security-boundary.test.ts` |
| `apps/api/src/modules/security/security.service.ts` | Security service façade | Links local authoritative device ID with security operations | NEW | Medium | `security-foundation.test.ts` |
| `apps/api/src/modules/security/security.controller.ts` | HTTP Controller | Zod request validation, bootstrap security guards, safe response formatting | NEW | Medium | API integration |
| `apps/api/src/modules/security/security.routes.ts` | Express Router | Endpoints for PIN, security status, lock/unlock, bind + rate limiting on PIN verification/change/setup/unlock | MODIFIED | Low | Root routes mounting |
| `apps/api/src/modules/security/index.ts` | Security module barrel | Barrel export for security module | NEW | Low | Typecheck |
| `apps/api/src/modules/system/system.routes.ts` | System router | Mounted `/security` routes and `/device/bind` | MODIFIED | Low | Regression & routing |
| `apps/api/src/modules/system/installation.service.ts` | Installation service | Authoritative lifecycle invariant enforcement by default on all forward state transitions; added `reason` to `revokeDevice` | MODIFIED | Medium | `lifecycle-foundation.test.ts`, `security-foundation.test.ts`, `security-boundary.test.ts` |
| `apps/api/src/modules/system/lifecycle.controller.ts` | Lifecycle controller | Enforces lifecycle invariants by default; removed client-controlled bypass flag | MODIFIED | Low | Controller tests |
| `apps/api/src/modules/auth/auth.service.ts` | Auth service | Accepted `deviceId` in `meta` and bound to database `Session` row; rejects login if device is `REVOKED` | MODIFIED | Low | `device-security.test.ts`, `security-boundary.test.ts` |
| `apps/api/src/modules/auth/auth.controller.ts` | Auth controller | Extracted `x-device-id` header and passed to `authService.login` | MODIFIED | Low | Auth integration |
| `apps/web/src/services/api/security.api.ts` | Frontend API client | Typed client methods for security endpoints | NEW | Low | Web build & typecheck |
| `apps/web/src/services/security.ts` | Web security barrel | Re-exports `security.api.ts` | NEW | Low | Web build |
| `apps/web/src/services/api.ts` | Web API facade | Attached `security: securityApi` to singleton `api` object | MODIFIED | Low | Web build |
| `apps/api/src/tests/pin-security.test.ts` | Test suite | 22 comprehensive automated tests for PIN validation, hashing, lockout, concurrency | NEW | Low | Verified (22/22 PASS) |
| `apps/api/src/tests/device-security.test.ts` | Test suite | 5 automated tests for device binding, revocation, lock state, session invalidation | NEW | Low | Verified (5/5 PASS) |
| `apps/api/src/tests/security-foundation.test.ts` | Test suite | 5 automated tests for lifecycle invariants, user password independence, profile DB preservation, zero secret leakage | MODIFIED | Low | Verified (5/5 PASS) |
| `apps/api/src/tests/security-boundary.test.ts` | Test suite | Concurrency stress testing (5 concurrent failures, 4 failures + 1 success), lockout expiration decoupling, revoked device rejection, lifecycle boundaries | MODIFIED | Low | Verified (10/10 PASS) |
| `apps/api/src/tests/phase2-migration.test.ts` | Test suite | Updated migration count assertion to `>= 6` and added `DeviceSecurity` table verification | MODIFIED | Low | Verified (3/3 PASS) |
| `docs/first-run-lifecycle/PHASE-3-SECURITY-FOUNDATION.md` | Documentation | Comprehensive architecture document for Phase 3 + zero PIN recovery policy | MODIFIED | Low | Documentation |
| `docs/first-run-lifecycle/V3-PHASE-3-FILE-IMPACT.md` | Documentation | File impact tracking for Phase 3 | MODIFIED | Low | Documentation |
| `docs/first-run-lifecycle/V3-PHASE-3-SECURITY-DECISIONS.md` | Documentation | Security Architecture Decision Records (ADRs) | MODIFIED | Low | Documentation |
| `docs/first-run-lifecycle/PHASE-3-SCORECARD.md` | Documentation | Final verified scorecard: 98.6% across 20 categories | MODIFIED | Low | Documentation |

---

## PIN Recovery & Scope Discipline Note
> **PIN recovery/reset is intentionally NOT part of Phase 3.**
> 
> In accordance with project requirements:
> - Forgotten PIN $\rightarrow$ No Phase 3 recovery/bypass mechanism.
> - There are no master PINs, emergency bypass codes, recovery tokens, security questions, or backdoors.
> - Absence of PIN recovery is an intentional design boundary, not a Phase 3 deficiency.

---

## Deleted Files
None. Zero files were deleted.

---

## Migration Impact
- **Migration Name**: `20260918120000_add_device_security_foundation`
- **Tables Created**: `DeviceSecurity`
- **Columns Added**: `Session.deviceId`
- **Indexes Created**: `DeviceSecurity_deviceId_key`, `DeviceSecurity_deviceId_idx`, `Session_deviceId_idx`
- **Backward Compatibility**: Fully backward compatible with existing V3 data. No tables dropped, no existing columns altered.
