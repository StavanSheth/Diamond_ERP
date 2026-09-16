# Phase 2 — File Impact Report

## Overview
This document records every file modified or created during Phase 2 (Database, Identity & Lifecycle Foundation) in Diamond ERP V3.

## File Impact Table

| File | Action | Reason | Risk |
| :--- | :--- | :--- | :--- |
| `apps/api/prisma/schema.prisma` | MODIFY | Added `Installation`, `Device` models; added `deletedAt` to `User`; added `schemaVersion`, `status`, `lastValidatedAt` to `Profile`. | HIGH |
| `apps/api/prisma/migrations/20260916120000_add_lifecycle_foundation/migration.sql` | NEW | DDL migration script for lifecycle tables and user/profile enhancements. | HIGH |
| `apps/api/prisma/template.db` | MODIFY | Rebuilt schema template to 0 rows, guaranteeing pure blueprint for fresh profile database provisioning. | MEDIUM |
| `packages/contracts/src/dto/lifecycle.ts` | NEW | Added TypeScript DTOs and interfaces for `LifecycleState`, `InstallationDto`, `DeviceDto`, and responses. | LOW |
| `packages/contracts/src/dto/index.ts` | MODIFY | Exported lifecycle DTO types. | LOW |
| `apps/api/src/modules/system/installation.service.ts` | NEW | Core service managing installation identity, device registration, and progressive lifecycle state machine. | MEDIUM |
| `apps/api/src/modules/system/lifecycle.controller.ts` | NEW | Express controller handling public lifecycle probes and authenticated installation/device endpoints. | MEDIUM |
| `apps/api/src/modules/system/system.routes.ts` | MODIFY | Mounted system lifecycle routes (`/api/system/lifecycle`, `/api/system/installation`, etc.). | LOW |
| `apps/api/src/routes.ts` | MODIFY | Registered `/api/system` routes in the main Express router. | LOW |
| `apps/api/src/modules/auth/auth.service.ts` | MODIFY | Added safe user deactivation (`deactivateUser`) and reactivation (`reactivateUser`) with zero filesystem DB unlinking. | MEDIUM |
| `apps/api/src/tests/lifecycle-foundation.test.ts` | NEW | Comprehensive test suite verifying installation, device registration, state transitions, user soft-deactivation, DB preservation, and isolation. | LOW |
| `scripts/sync-template-db.js` | MODIFY | Enhanced template synchronization to purge seed rows and vacuum so `template.db` remains 0 rows. | LOW |
| `scripts/test-phase1-first-run-audit.js` | MODIFY | Updated verification harness to validate `Installation` and `Device` models in schema. | LOW |
| `docs/first-run-lifecycle/PHASE-2-DATABASE-FOUNDATION.md` | NEW | Architectural report documenting Phase 2 foundation, relationships, and migration. | LOW |
| `docs/first-run-lifecycle/V3-PHASE-2-FILE-IMPACT.md` | NEW | File impact report for Phase 2. | LOW |
| `installer/Launcher.cs` | NO CHANGE | Desktop launcher kept stable and untouched. | LOW |
| `installer/Installer.cs` | NO CHANGE | Windows installer kept stable and untouched. | LOW |
| `apps/web/src/services/deviceAuth.ts` | NO CHANGE | Preserved existing client-side WebAuthn/PIN utility for Phase 3 integration. | LOW |
