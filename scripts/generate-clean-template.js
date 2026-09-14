#!/usr/bin/env node
/**
 * generate-clean-template.js
 * 
 * Generates a clean, schema-only template.db for new profile provisioning.
 * The resulting database has all tables and indexes from schema.prisma
 * but zero rows in any business table.
 * 
 * Usage: node scripts/generate-clean-template.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRISMA_DIR = path.resolve(__dirname, '..', 'apps', 'api', 'prisma');
const TEMPLATE_PATH = path.join(PRISMA_DIR, 'template.db');
const BACKUP_PATH = path.join(PRISMA_DIR, 'template.db.bak');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');

function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  DiamondERP — Clean Template Database Generator     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  // Verify schema exists
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`❌ schema.prisma not found at: ${SCHEMA_PATH}`);
    process.exit(1);
  }

  // Backup existing template.db
  if (fs.existsSync(TEMPLATE_PATH)) {
    const oldSize = fs.statSync(TEMPLATE_PATH).size;
    console.log(`📦 Backing up existing template.db (${oldSize} bytes) → template.db.bak`);
    fs.copyFileSync(TEMPLATE_PATH, BACKUP_PATH);
  }

  // Remove existing template.db so prisma creates a fresh one
  if (fs.existsSync(TEMPLATE_PATH)) {
    fs.unlinkSync(TEMPLATE_PATH);
  }

  // Also remove WAL/SHM files if present
  for (const ext of ['-wal', '-shm']) {
    const p = TEMPLATE_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('🔨 Generating clean schema-only template.db via Prisma...');
  console.log(`   Schema: ${SCHEMA_PATH}`);
  console.log(`   Target: ${TEMPLATE_PATH}`);
  console.log();

  try {
    // Use prisma db push to create all tables from schema.prisma
    // This creates a fully migrated database with zero data rows
    execSync(
      `npx prisma db push --skip-generate --accept-data-loss --schema="${SCHEMA_PATH}"`,
      {
        cwd: path.resolve(__dirname, '..', 'apps', 'api'),
        env: {
          ...process.env,
          DATABASE_URL: `file:${TEMPLATE_PATH}`,
        },
        stdio: 'pipe',
      }
    );
  } catch (err) {
    console.error('❌ Prisma db push failed:');
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }

  // Verify the new template.db
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error('❌ template.db was not created!');
    process.exit(1);
  }

  const newSize = fs.statSync(TEMPLATE_PATH).size;
  console.log(`✅ Clean template.db created successfully (${newSize} bytes)`);

  // Clean up WAL/SHM files after creation
  for (const ext of ['-wal', '-shm']) {
    const p = TEMPLATE_PATH + ext;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`   Cleaned up ${path.basename(p)}`);
    }
  }

  console.log();
  console.log('✅ Template database is now schema-only (zero data rows).');
  console.log('   New profiles created with this template will start with a blank state.');
}

main();
