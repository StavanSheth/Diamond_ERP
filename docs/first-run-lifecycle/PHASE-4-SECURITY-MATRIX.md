# Diamond ERP V3 — Phase 4 Bootstrap Security Matrix & Authorization Policy

## 1. Executive Summary
This document establishes the centralized security and authorization specification for Diamond ERP V3 during first-run onboarding and post-initialization production operation.

It eliminates ad-hoc lifecycle checks, provides strict operation-level role and state enforcement, and guarantees that:
1. **Pre-READY**: Operations are narrowly scoped to the current active lifecycle step; premature access to database or user management is strictly forbidden.
2. **Post-READY**: All mutating onboarding endpoints require an authenticated administrative session.
3. **Revoked Device Enforcement**: A device marked `REVOKED` in the Control DB cannot perform any mutating onboarding action under any lifecycle state.
4. **Zero Special-Case Bypass**: Privilege assumptions based on `user.id === 'default-admin'` are permanently eliminated.

---

## 2. Operation Classification

The system classifies 15 distinct operations governed by the `OnboardingAuthorizationService`:

| Operation Code | Description | Risk Classification |
| :--- | :--- | :--- |
| `READ_ONBOARDING_STATUS` | Read current lifecycle stage, device, and readiness checklist | Public / Read-Only |
| `INITIALIZE_APPLICATION` | Create directories, initialize local installation identity | Bootstrap Mutation |
| `REGISTER_DEVICE` | Register local terminal in Control DB | Bootstrap Mutation |
| `BIND_DEVICE` | Bind security credentials to local terminal | Security Mutation |
| `SETUP_PIN` | Configure device PIN in DeviceSecurity | Security Mutation |
| `VERIFY_PIN` | Verify 6-digit terminal PIN | Security Verification |
| `DISCOVER_USERS` | Retrieve candidate business users from Control DB | Identity Read-Only |
| `SELECT_USER` | Associate existing business user with installation | Identity Mutation |
| `CREATE_USER` | Create new business user with bcrypt password hash | Identity Mutation |
| `DISCOVER_DATABASES` | Search bounded local directories and registries | Storage Read-Only |
| `INSPECT_DATABASE` | Perform read-only SQLite header, integrity, and schema checks | Storage Read-Only |
| `ATTACH_DATABASE` | Link existing SQLite database to Profile & User | High-Impact Storage Mutation |
| `CREATE_DATABASE` | Provision new database from immutable template.db | High-Impact Storage Mutation |
| `RESET_ONBOARDING_STEP` | Roll back to discovery step without destroying physical files | Recovery Mutation |
| `COMPLETE_ONBOARDING` | Authoritative check of all 7 prerequisites and transition to READY | Critical Lifecycle Gate |

---

## 3. Authoritative State-Based Bootstrap Matrix (Pre-READY)

During the bootstrap lifecycle states, mutations are permitted **only** when appropriate for the current state:

| Operation | NOT_INITIALIZED | APP_SETUP | PIN_SETUP | DEVICE_SETUP | USER_DISCOVERY | DATABASE_DISCOVERY | DATABASE_VALIDATION | DATABASE_SETUP |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `READ_ONBOARDING_STATUS` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| `INITIALIZE_APPLICATION` | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `REGISTER_DEVICE` | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `BIND_DEVICE` | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `SETUP_PIN` | FORBIDDEN | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `VERIFY_PIN` | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `DISCOVER_USERS` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** | FORBIDDEN | FORBIDDEN |
| `SELECT_USER` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `CREATE_USER` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `DISCOVER_DATABASES` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** |
| `INSPECT_DATABASE` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** |
| `ATTACH_DATABASE` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** |
| `CREATE_DATABASE` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** |
| `RESET_ONBOARDING_STEP` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| `COMPLETE_ONBOARDING` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | **ALLOW** |

Attempting any `FORBIDDEN` operation throws `AuthorizationError` (HTTP 403 Forbidden) with a message specifying the required lifecycle step.

---

## 4. Production Security Boundary (Post-READY)

Once `lifecycleState === 'READY'`:
1. `READ_ONBOARDING_STATUS` remains accessible anonymously to report system health and readiness.
2. **All mutations strictly require authentication**:
   - Request must provide a valid `Bearer <JWT>` session token.
   - Token must decode to an active, non-deleted user in the Control DB.
   - User role must be `ADMIN`. Users with `VIEWER` or other roles receive HTTP 403 Forbidden.
3. **Revoked Device Enforcement**:
   - If the local device record has `status === 'REVOKED'`, all mutating onboarding operations are blocked immediately with HTTP 403.
4. **Elimination of Default Admin Bypass**:
   - In accordance with Phase 3 & 4 security directives, `user.id === 'default-admin'` provides zero implicit privilege. All identity claims are authenticated against active records in `systemPrisma`.
