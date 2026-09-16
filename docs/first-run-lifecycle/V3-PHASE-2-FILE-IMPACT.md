# Phase 2 — File Impact Report

## Overview
This document records every file modified or created during Phase 2 (Database, Identity & Lifecycle Foundation) and its remediation in Diamond ERP V3.

## File Impact Table

| File | Action | Reason | Risk |
| :--- | :--- | :--- | :--- |
| `apps/api/prisma/schema.prisma` | MODIFY | Added `Installation`, `Device`, `InstallationUser`, `DatabaseRegistry` models; added `deletedAt` to `User`; added `schemaVersion`, `status`, `lastValidatedAt` to `Profile`. | HIGH |
| `apps/api/prisma/migrations/20260916120000_add_lifecycle_foundation/migration.sql` | NEW | DDL migration script for lifecycle tables and user/profile enhancements. | HIGH |
| `apps/api/prisma/template.db` | MODIFY | Rebuilt schema template to 0 rows, guaranteeing pure blueprint for fresh profile database provisioning. | MEDIUM |
| `packages/contracts/src/dto/lifecycle.ts` | MODIFY | Added TypeScript DTOs and interfaces for `LifecycleState`, `InstallationDto`, `DeviceDto`, `DatabaseValidationResultDto` (`missingRequiredColumns`, `detectedType`). | LOW |
| `packages/contracts/src/dto/index.ts` | MODIFY | Exported lifecycle DTO types. | LOW |
| `apps/api/src/infrastructure/paths.ts` | MODIFY | Strict resolution of Control Database to `system.db` via `getControlDbPath()`. | MEDIUM |
| `apps/api/src/modules/system/installation.service.ts` | MODIFY | Authoritative local device identity, rejection of spoofed deviceId, cross-installation collision check, revocation/reactivation, InstallationUser association/disassociation. | MEDIUM |
| `apps/api/src/modules/system/lifecycle.controller.ts` | MODIFY | Express controller enforcing bootstrap boundary (pre-READY vs post-READY), user association & device revocation endpoints. | MEDIUM |
| `apps/api/src/modules/system/system.routes.ts` | MODIFY | Unified all system routes under single authoritative registration; separated public bootstrap and protected admin stack. | LOW |
| `apps/api/src/routes.ts` | MODIFY | Removed duplicate `/api/system/*` routes; mounted consolidated `systemRoutes` once. | LOW |
| `apps/api/src/modules/system/database/database-validation.service.ts` | MODIFY | Read-only candidate inspection with column-level verification via `PRAGMA table_info` and database type classification. | MEDIUM |
| `apps/api/src/modules/system/database/database-registry.service.ts` | MODIFY | Concurrency safe database registration handling `P2002` race conditions; live status sync for `MISSING` files. | MEDIUM |
| `apps/api/src/modules/auth/auth.service.ts` | MODIFY | Added safe user deactivation (`deactivateUser`) and reactivation (`reactivateUser`) with zero filesystem DB unlinking, session revocation, and `tokenVersion` bump. | MEDIUM |
| `apps/api/src/modules/auth/auth.controller.ts` | MODIFY | Added protected `deactivateUser` and `reactivateUser` endpoints with self-deactivation prevention. | MEDIUM |
| `apps/api/src/modules/auth/auth.routes.ts` | MODIFY | Mounted protected user deactivation/reactivation routes with `authorize('user.delete')` and `authorize('user.update')`. | LOW |
| `apps/api/src/tests/lifecycle-foundation.test.ts` | MODIFY | Comprehensive 40-test suite verifying installation, device, progression, validation, deactivation, isolation, concurrency, and routing. | LOW |
| `scripts/sync-template-db.js` | MODIFY | Enhanced template synchronization to purge seed rows and vacuum so `template.db` remains 0 rows. | LOW |
| `scripts/test-phase1-first-run-audit.js` | MODIFY | Updated verification harness to validate `Installation` and `Device` models in schema. | LOW |
| `docs/first-run-lifecycle/PHASE-2-DATABASE-FOUNDATION.md` | MODIFY | Architectural report documenting Phase 2 foundation, relationships, and remediation invariants. | LOW |
| `docs/first-run-lifecycle/PHASE-2-SCORECARD.md` | MODIFY | 10-area weighted remediation scorecard achieving 96.8% code-level completion. | LOW |
| `docs/first-run-lifecycle/V3-PHASE-2-FILE-IMPACT.md` | MODIFY | File impact report for Phase 2 remediation. | LOW |
| `installer/Launcher.cs` | NO CHANGE | Desktop launcher kept stable and untouched. | LOW |
| `installer/Installer.cs` | NO CHANGE | Windows installer kept stable and untouched. | LOW |
| `apps/web/src/services/deviceAuth.ts` | NO CHANGE | Preserved existing client-side WebAuthn/PIN utility for Phase 3 integration. | LOW |

