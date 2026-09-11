# Baseline Document - Phase 1A

- **Branch**: v3 (copied from security-audit-refactor)
- **Node version**: v22.20.0
- **npm version**: 10.9.3
- **OS**: Windows (x64)
- **Frontend Build Result**: PASS
- **Backend Build Result**: PASS
- **Prisma Generation Result**: PASS (part of standard build/install process)
- **Test Result**: FAIL (7 API concurrency tests failing related to Profile & Tenant Authorization returning 200 instead of 403/404)
- **Database Result**: Initializes cleanly but fails multi-profile authorization checks during testing.
- **Installer Compilation Result**: FAIL (Missing `Microsoft.Web.WebView2.Core.dll` and `Microsoft.Web.WebView2.Wpf.dll` in the `installer` directory)
- **Known Existing Warnings/Errors**:
  - `concurrency.test.ts` fails 7/72 tests on `security-audit-refactor`.
  - `build:installer` fails because `csc.exe` cannot locate the WebView2 metadata files.
  - Vite build logs a warning about chunk size exceeding 500kB.
