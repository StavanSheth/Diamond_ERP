# 💎 DiamondERP V3.0

Diamond inventory, transactions, repair, certification, and accounting management system with SQLite & Prisma.

## Architecture

```
TestV3.0/
├── apps/
│   ├── api/                    # Express + TypeScript + Prisma REST API (Port 3002)
│   │   ├── prisma/             # SQLite schema and migrations
│   │   └── src/
│   │       ├── modules/        # Domain modules (stocks, ledger, parties, repairs, certs, reports, settings)
│   │       ├── middleware/     # CORS, performance, request-id, error-handler
│   │       └── index.ts        # Server bootstrap
│   │
│   └── web/                    # Vite + React 19 + TypeScript + Tailwind (Port 5175)
│       └── src/
│           ├── domains/        # Domain components and modals
│           ├── hooks/          # Shared hooks (useReferenceData, useStocks, useDrafts)
│           ├── pages/          # Dashboard, Inventory, Ledger, Certificates, Parties, Repairs, Reports, Settings
│           └── services/       # Typed API client
│
├── packages/
│   ├── contracts/              # Single Source of Truth for Enums, DTOs, 4Cs Constants
│   └── shared-utils/           # Pure domain math, Indian currency formatters (₹), query filter builders
│
├── package.json                # Root npm workspace orchestrator
└── README.md
```

## Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- No external cloud dependencies required (runs locally on SQLite)

---

## Quick Start (Monorepo Workspaces)

### 1. Install All Dependencies

From the root directory:
```powershell
npm install
```

### 2. Build Shared Packages

```powershell
npm run build:contracts
npm run build:utils
```

### 3. Run Development Servers

**Option A: Separate Terminals**

Terminal 1 (Backend API on http://localhost:3002):
```powershell
npm run dev:api
```

Terminal 2 (Frontend Web on http://localhost:5175):
```powershell
npm run dev:web
```

**Option B: Full Workspace Build & Test**

```powershell
npm run build    # Builds contracts, shared-utils, api, and web
npm run test     # Runs test suites across all workspaces
```

---

## Port Configuration

| Service | Port | Config Location | Proxy Target |
|---|---|---|---|
| Backend API | `3002` | `apps/api/.env` → `PORT=3002` | — |
| Frontend Dev | `5175` | `apps/web/vite.config.ts` | `/api/*` & `/health` → `http://localhost:3002` |
