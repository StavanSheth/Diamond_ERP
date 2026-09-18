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
| `apps/api/src/modules/security/security.constants.ts` | Security configuration | Authoritative PIN length, attempt limits, lockout duration, disallowed PINs, audit events | NEW | Low | `pin-security.test.ts` |
| `apps/api/src/modules/security/security.types.ts` | Security module types | Re-exports and internal types | NEW | Low | Typecheck |
| `apps/api/src/modules/security/pin.service.ts` | PIN validation & hashing | 6-digit validation, weak combination rules, salted bcrypt hashing, constant-time verification | NEW | Medium | `pin-security.test.ts` |
| `apps/api/src/modules/security/device-security.service.ts` | Device security operations | Atomic PIN setup, attempt tracking, 15-min lockout, change PIN, app lock/unlock, audit logging | NEW | High | `pin-security.test.ts`, `device-security.test.ts` |
| `apps/api/src/modules/security/security.service.ts` | Security service façade | Links local authoritative device ID with security operations | NEW | Medium | `security-foundation.test.ts` |
| `apps/api/src/modules/security/security.controller.ts` | HTTP Controller | Zod request validation, bootstrap security guards, safe response formatting | NEW | Medium | API integration |
| `apps/api/src/modules/security/security.routes.ts` | Express Router | Endpoints for PIN, security status, lock/unlock, bind | NEW | Low | Root routes mounting |
| `apps/api/src/modules/security/index.ts` | Security module barrel | Barrel export for security module | NEW | Low | Typecheck |
| `apps/api/src/modules/system/system.routes.ts` | System router | Mounted `/security` routes and `/device/bind` | MODIFIED | Low | Regression & routing |
| `apps/api/src/modules/system/installation.service.ts` | Installation service | Enforced Lifecycle Invariants 1 & 2 in `updateLifecycleState`; added `reason` to `revokeDevice` | MODIFIED | Medium | `lifecycle-foundation.test.ts`, `security-foundation.test.ts` |
| `apps/api/src/modules/system/lifecycle.controller.ts` | Lifecycle controller | Added `enforceInvariants` flag in `updateStateSchema` | MODIFIED | Low | Controller tests |
| `apps/api/src/modules/auth/auth.service.ts` | Auth service | Accepted `deviceId` in `meta` and bound to database `Session` row | MODIFIED | Low | `device-security.test.ts` |
| `apps/api/src/modules/auth/auth.controller.ts` | Auth controller | Extracted `x-device-id` header and passed to `authService.login` | MODIFIED | Low | Auth integration |
| `apps/web/src/services/api/security.api.ts` | Frontend API client | Typed client methods for security endpoints | NEW | Low | Web build & typecheck |
| `apps/web/src/services/security.ts` | Web security barrel | Re-exports `security.api.ts` | NEW | Low | Web build |
| `apps/web/src/services/api.ts` | Web API facade | Attached `security: securityApi` to singleton `api` object | MODIFIED | Low | Web build |
| `apps/api/src/tests/pin-security.test.ts` | Test suite | 22 comprehensive automated tests for PIN validation, hashing, lockout, concurrency | NEW | Low | Verified (22/22 PASS) |
| `apps/api/src/tests/device-security.test.ts` | Test suite | 5 automated tests for device binding, revocation, lock state, session invalidation | NEW | Low | Verified (5/5 PASS) |
| `apps/api/src/tests/security-foundation.test.ts` | Test suite | 5 automated tests for lifecycle invariants, user password independence, profile DB preservation, zero secret leakage | NEW | Low | Verified (5/5 PASS) |
| `apps/api/src/tests/phase2-migration.test.ts` | Test suite | Updated migration count assertion to `>= 6` and added `DeviceSecurity` table verification | MODIFIED | Low | Verified (3/3 PASS) |
| `docs/first-run-lifecycle/PHASE-3-SECURITY-FOUNDATION.md` | Documentation | Comprehensive architecture document for Phase 3 | NEW | Low | Documentation |
| `docs/first-run-lifecycle/V3-PHASE-3-FILE-IMPACT.md` | Documentation | File impact tracking for Phase 3 | NEW | Low | Documentation |
| `docs/first-run-lifecycle/V3-PHASE-3-SECURITY-DECISIONS.md` | Documentation | Security Architecture Decision Records (ADRs) | NEW | Low | Documentation |

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
