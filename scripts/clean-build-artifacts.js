/**
 * DiamondERP V3.0 — Production Build Output Cleanup
 *
 * Deterministically removes build output directories before compilation:
 *  - apps/api/dist/
 *  - apps/web/dist/
 *  - packages/contracts/dist/
 *  - packages/shared-utils/dist/
 *  - packages/api-client/dist/
 *  - build/windows/DiamondERP/
 *
 * SAFETY GUARANTEES:
 *  - STRICTLY preserves all .db files (Stavan.db, template.db, etc.)
 *  - STRICTLY preserves all source code and prisma schemas/migrations
 *  - STRICTLY preserves LocalAppData, uploads, backups, and user settings
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_DIRS = [
  path.join(ROOT_DIR, 'apps', 'api', 'dist'),
  path.join(ROOT_DIR, 'apps', 'web', 'dist'),
  path.join(ROOT_DIR, 'packages', 'contracts', 'dist'),
  path.join(ROOT_DIR, 'packages', 'shared-utils', 'dist'),
  path.join(ROOT_DIR, 'packages', 'api-client', 'dist'),
  path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP'),
];

console.log('[Clean] Cleaning build output directories...');

let cleanedCount = 0;
for (const dir of TARGET_DIRS) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      const relPath = path.relative(ROOT_DIR, dir).replace(/\\/g, '/');
      console.log(`  ✔ Removed: ${relPath}`);
      cleanedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Could not remove ${dir}: ${err.message}`);
    }
  }
}

console.log(`[Clean] Completed. (${cleanedCount} build directories cleaned)\n`);
