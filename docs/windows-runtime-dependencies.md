# DiamondERP V3.0 — Windows Runtime Dependency Inventory

## 1. Overview
This document provides an exhaustive inventory and classification of every dependency across all workspaces in the DiamondERP V3.0 monorepo. It defines which packages are required at production runtime, which are required during the build/staging process, and which are strictly development or testing tooling.

---

## 2. Classification Key
- **RUNTIME API**: Required by the Node.js backend when executing `api/dist/index.js` in production.
- **RUNTIME WEB**: Bundled into static JavaScript/CSS assets by Vite during `npm run build`; not required as separate files on the production machine.
- **BUILD ONLY**: Required by CI or developer machine to build TypeScript, generate Prisma clients, or bundle assets.
- **DEVELOPMENT ONLY**: Tooling for local development, hot reloading, formatting, and linting.
- **TEST ONLY**: Unit, integration, or end-to-end testing frameworks.
- **OPTIONAL**: Features that can be enabled or omitted without breaking core ERP business logic.

---

## 3. Dependency Inventory Table

| Package | Workspace | Classification | Required at Runtime? | Required During Build? | Production Packaging Requirement |
|---|---|---|:---:|:---:|---|
| `@prisma/client` | `apps/api` | RUNTIME API | **YES** | **YES** | Must be included in `api/node_modules/@prisma/client` along with the `.prisma/client` folder containing `query_engine-windows.dll.node`. |
| `bcryptjs` | `apps/api` | RUNTIME API | **YES** | NO | Pure JavaScript implementation of bcrypt. Must be packaged in `api/node_modules/bcryptjs`. Zero native C++ compilation required. |
| `cors` | `apps/api` | RUNTIME API | **YES** | NO | Express middleware. Must be packaged in `api/node_modules/cors`. |
| `csv-parse` | `apps/api` | RUNTIME API | **YES** | NO | CSV parser for data imports. Must be packaged in `api/node_modules/csv-parse`. |
| `csv-stringify` | `apps/api` | RUNTIME API | **YES** | NO | CSV generation for transaction/inventory exports. Must be packaged in `api/node_modules/csv-stringify`. |
| `dotenv` | `apps/api` | RUNTIME API | **YES** | NO | Environment variable loader. Must be packaged in `api/node_modules/dotenv`. Note: DiamondERP falls back to safe internal defaults when `.env` is absent. |
| `exceljs` | `apps/api` | RUNTIME API | **YES** | NO | Streaming Excel report generator. Must be packaged in `api/node_modules/exceljs`. |
| `express` | `apps/api` | RUNTIME API | **YES** | NO | Core HTTP server handling API endpoints and static SPA delivery. Must be packaged in `api/node_modules/express`. |
| `express-rate-limit` | `apps/api` | RUNTIME API | **YES** | NO | Brute-force and DoS protection for auth endpoints. Must be packaged in `api/node_modules/express-rate-limit`. |
| `helmet` | `apps/api` | RUNTIME API | **YES** | NO | Security headers and Content Security Policy (CSP). Must be packaged in `api/node_modules/helmet`. |
| `jsonwebtoken` | `apps/api` | RUNTIME API | **YES** | NO | Cryptographic JWT session signing and verification. Must be packaged in `api/node_modules/jsonwebtoken`. |
| `multer` | `apps/api` | RUNTIME API | **YES** | NO | Multipart form-data parser for certificate PDF uploads. Must be packaged in `api/node_modules/multer`. |
| `swagger-jsdoc` | `apps/api` | OPTIONAL | NO | NO | Generates OpenAPI specifications for developers. Safe to omit in production desktop build. |
| `swagger-ui-express` | `apps/api` | OPTIONAL | NO | NO | Serves Swagger UI at `/api-docs`. Safe to omit or gate behind development mode. |
| `uuid` | `apps/api` | RUNTIME API | **YES** | NO | Cryptographic UUID generation for entities and transactions. Must be packaged in `api/node_modules/uuid`. |
| `zod` | `apps/api` | RUNTIME API | **YES** | NO | Schema validation library for API requests. Must be packaged in `api/node_modules/zod`. |
| `@diamond-erp/contracts` | `apps/api`, `apps/web` | BUILD ONLY | NO | **YES** | Monorepo package. Pre-compiled into `dist/` and referenced directly. |
| `@diamond-erp/shared-utils` | `apps/api`, `apps/web` | BUILD ONLY | NO | **YES** | Monorepo package. Pre-compiled into `dist/` and referenced directly. |
| `dexie` | `apps/web` | RUNTIME WEB | Bundled | **YES** | IndexedDB client wrapper for client-side drafts. Bundled into `apps/web/dist/assets/*.js`. |
| `i18next` | `apps/web` | RUNTIME WEB | Bundled | **YES** | Internationalization. Bundled into `apps/web/dist/assets/*.js`. |
| `react` | `apps/web` | RUNTIME WEB | Bundled | **YES** | UI library. Bundled into `apps/web/dist/assets/*.js`. |
| `react-dom` | `apps/web` | RUNTIME WEB | Bundled | **YES** | React DOM renderer. Bundled into `apps/web/dist/assets/*.js`. |
| `react-i18next` | `apps/web` | RUNTIME WEB | Bundled | **YES** | React i18n bindings. Bundled into `apps/web/dist/assets/*.js`. |
| `react-router-dom` | `apps/web` | RUNTIME WEB | Bundled | **YES** | Client-side routing. Bundled into `apps/web/dist/assets/*.js`. |
| `recharts` | `apps/web` | RUNTIME WEB | Bundled | **YES** | Dashboard charts. Bundled into `apps/web/dist/assets/*.js`. |
| `lucide-react` | `apps/web` | RUNTIME WEB | Bundled | **YES** | UI icons. Bundled into `apps/web/dist/assets/*.js`. |
| `prisma` (CLI) | `apps/api` | BUILD ONLY | NO | **YES** | Required on build machine to run `npx prisma generate`. NEVER packaged into customer runtime. |
| `typescript` | All | BUILD ONLY | NO | **YES** | Compiles `.ts` to `.js`. NEVER packaged into customer runtime. |
| `vite` | `apps/web` | BUILD / DEV | NO | **YES** | Builds production React bundle; serves dev proxy. NEVER packaged into customer runtime. |
| `nodemon` | `apps/api` | DEV ONLY | NO | NO | Hot-reloading watcher for development. NEVER packaged into customer runtime. |
| `ts-node` | `apps/api` | DEV ONLY | NO | NO | Transpiler runner for development. NEVER packaged into customer runtime. |
| `eslint` | All | DEV ONLY | NO | NO | Code linter. NEVER packaged into customer runtime. |
| `prettier` | All | DEV ONLY | NO | NO | Code formatter. NEVER packaged into customer runtime. |
| `vitest` | `apps/api`, `apps/web` | TEST ONLY | NO | NO | Automated unit test runner. NEVER packaged into customer runtime. |
| `@playwright/test` | `apps/web` | TEST ONLY | NO | NO | End-to-end browser test framework. NEVER packaged into customer runtime. |
| `supertest` | `apps/api` | TEST ONLY | NO | NO | HTTP integration test framework. NEVER packaged into customer runtime. |

---

## 4. Native Modules & Engines Analysis

### Prisma Query Engine Binary
- **Type**: Pre-compiled native dynamic link library (`query_engine-windows.dll.node`).
- **Location**: `apps/api/node_modules/.prisma/client/query_engine-windows.dll.node`.
- **Packaging Rule**: The production package must retain `.prisma/client/` containing this file. Because Prisma 5.x uses a Node-API DLL rather than a standalone `.exe` subprocess, it operates efficiently in-process without spawning separate child engine processes.

### SQLite Engine
- **Type**: Handled transparently by the Prisma Query Engine via SQLite embedded C library.
- **Packaging Rule**: No external `sqlite3.exe` or native C++ compiler is needed on the customer machine. The Prisma engine statically links the SQLite driver.

### Pure JavaScript Guarantees
- All remaining runtime dependencies (`bcryptjs`, `jsonwebtoken`, `express`, `exceljs`, `uuid`, `zod`, `multer`, `cors`, `helmet`) are pure JavaScript. None require `node-gyp`, Python, or Visual Studio C++ Build Tools on the target machine.
