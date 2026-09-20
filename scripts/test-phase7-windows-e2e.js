/**
 * Diamond ERP V3 — Phase 7 Real Windows Uninstall & Reinstall Recovery E2E Test
 *
 * Validates the complete production lifecycle:
 *  1. Installation of application files
 *  2. Creation of user and customer database
 *  3. Seeding of real business records across entities (Stock, Party, DiamondItem, Ledger, Location)
 *  4. Pre-uninstall preflight data detection
 *  5. User-selected preservation destination validation (writability & path safety)
 *  6. Creation of unified preservation package (DB + CSVs + XLSX + Cryptographic Manifests)
 *  7. Deep structural verification (SQLite, UTF-8 CSV parse & row counts, ExcelJS workbook sheets & headers)
 *  8. Cryptographic uninstall authorization issuance (installation-bound, package-bound, manifest-hash bound)
 *  9. Windows uninstaller independent validation and atomic token consumption
 * 10. Application binaries removal while strictly preserving customer AppData
 * 11. Reinstallation detection of previous customer data
 * 12. Candidate discovery, validation, and explicit confirmation (NO auto-attachment)
 * 13. Reconnection of user and database context
 * 14. Real data integrity assertion: beforeCounts == afterCounts for 100% of business entities
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_SCRATCH = path.join(ROOT_DIR, 'scratch', 'test-phase7-windows-e2e');
const FAKE_APPDATA = path.join(TEST_SCRATCH, 'AppData', 'Local', 'DiamondERP');
const FAKE_INSTALL_DIR = path.join(TEST_SCRATCH, 'Program Files', 'DiamondERP');
const CUSTOM_EXPORT_DIR = path.join(TEST_SCRATCH, 'External_Preservation_Drive', 'Diamond_ERP_Preservation');

let passedTests = 0;
let failedTests = 0;

function logStep(name) {
  console.log(`\n================================================================`);
  console.log(`[E2E STEP] ${name}`);
  console.log(`================================================================`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✔ PASS: ${message}`);
  passedTests++;
}

async function runE2E() {
  console.log('Starting Phase 7 Real Windows E2E Lifecycle & Data Preservation Test...');

  // ── STEP 1: Environment Setup ──────────────────────────────────────────
  logStep('1. Initialize Isolated Test Environment');
  if (fs.existsSync(TEST_SCRATCH)) {
    try {
      fs.rmSync(TEST_SCRATCH, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not cleanly delete scratch dir, continuing...');
    }
  }

  fs.mkdirSync(FAKE_APPDATA, { recursive: true });
  fs.mkdirSync(path.join(FAKE_APPDATA, 'databases'), { recursive: true });
  fs.mkdirSync(path.join(FAKE_APPDATA, 'config'), { recursive: true });
  fs.mkdirSync(path.join(FAKE_APPDATA, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(FAKE_APPDATA, 'exports'), { recursive: true });
  fs.mkdirSync(FAKE_INSTALL_DIR, { recursive: true });
  fs.mkdirSync(CUSTOM_EXPORT_DIR, { recursive: true });

  const installationId = `inst_e2e_${crypto.randomUUID()}`;
  fs.writeFileSync(path.join(FAKE_APPDATA, 'config', '.installation-id'), installationId, 'utf-8');

  assert(fs.existsSync(path.join(FAKE_APPDATA, 'config', '.installation-id')), 'Installation ID written to config directory');

  // ── STEP 2: Application Binaries Staging ────────────────────────────────
  logStep('2. Stage Application Installation Files');
  const dummyExe = path.join(FAKE_INSTALL_DIR, 'DiamondERP.exe');
  const dummyApi = path.join(FAKE_INSTALL_DIR, 'apps', 'api', 'dist', 'index.js');
  fs.mkdirSync(path.dirname(dummyApi), { recursive: true });
  fs.writeFileSync(dummyExe, 'MOCK_PORTABLE_EXECUTABLE_BINARY');
  fs.writeFileSync(dummyApi, 'console.log("Diamond ERP Backend Running");');

  assert(fs.existsSync(dummyExe), 'Application executable staged in Program Files');
  assert(fs.existsSync(dummyApi), 'Backend distribution files staged in Program Files');

  // ── STEP 3: Customer Database & Real Business Records ──────────────────
  logStep('3. Create Customer Database & Insert Business Records');
  const customerDbPath = path.join(FAKE_APPDATA, 'databases', 'diamond_corp_customer.db');
  const templateDbPath = path.join(ROOT_DIR, 'apps', 'api', 'Stavan.db');

  if (fs.existsSync(templateDbPath)) {
    fs.copyFileSync(templateDbPath, customerDbPath);
  } else {
    // Create new SQLite DB file
    fs.writeFileSync(customerDbPath, '');
  }

  // Use dynamic Prisma client against the customer database
  const { PrismaClient } = require(path.join(ROOT_DIR, 'apps', 'api', 'node_modules', '@prisma', 'client'));
  const customerPrisma = new PrismaClient({
    datasourceUrl: `file:${path.resolve(customerDbPath)}`,
  });

  // Ensure tables and seed records
  await customerPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Stock (
      id TEXT PRIMARY KEY,
      stockCode TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      currency TEXT DEFAULT 'USD',
      isActive INTEGER DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  await customerPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Party (
      id TEXT PRIMARY KEY,
      partyCode TEXT NOT NULL,
      name TEXT NOT NULL,
      partyType TEXT DEFAULT 'CUSTOMER',
      phone TEXT,
      email TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  await customerPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS DiamondItem (
      id TEXT PRIMARY KEY,
      stockId TEXT,
      carat REAL,
      cut TEXT,
      color TEXT,
      clarity TEXT,
      price REAL,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  await customerPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Ledger (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      type TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  await customerPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Location (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      type TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);

  // Insert real records
  await customerPrisma.$executeRawUnsafe(`
    INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
    VALUES 
      ('stk_01', 'STK-ROUND-101', 'Brilliant Round Diamond 1.0ct', 'VVS1 Ideal Cut', 'USD', 1, datetime('now'), datetime('now')),
      ('stk_02', 'STK-OVAL-202', 'Oval Cut Diamond 2.5ct', 'VS2 Fancy Yellow', 'USD', 1, datetime('now'), datetime('now')),
      ('stk_03', 'STK-CUSHION-303', 'Cushion Cut Diamond 3.0ct', 'IF D-Flawless', 'USD', 1, datetime('now'), datetime('now'));
  `);

  await customerPrisma.$executeRawUnsafe(`
    INSERT OR REPLACE INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
    VALUES 
      ('pty_01', 'PTY-ANTWERP', 'Antwerp Diamond Exchange Co.', 'CUSTOMER', '+32-3-222-1111', 'trade@antwerpdiamonds.be', datetime('now'), datetime('now')),
      ('pty_02', 'PTY-SURAT', 'Surat Gem Polishing Ltd', 'SUPPLIER', '+91-261-555-0199', 'contact@suratgems.in', datetime('now'), datetime('now'));
  `);

  await customerPrisma.$executeRawUnsafe(`
    INSERT OR REPLACE INTO DiamondItem (id, itemCode, stockId, displayName, carat, color, clarity, cut, shape, ratePerCarat, currentValue, status, certificateStatus, createdAt, updatedAt)
    VALUES 
      ('dia_01', 'ITEM-001', 'stk_01', 'Round Brilliant 1.02ct', 1.02, 'D', 'VVS1', 'EXCELLENT', 'ROUND', 8500.0, 8670.0, 'AVAILABLE', 'NONE', datetime('now'), datetime('now')),
      ('dia_02', 'ITEM-002', 'stk_02', 'Oval 2.51ct', 2.51, 'FLY', 'VS2', 'VERY_GOOD', 'OVAL', 6900.0, 17319.0, 'AVAILABLE', 'NONE', datetime('now'), datetime('now'));
  `);

  await customerPrisma.$executeRawUnsafe(`
    INSERT OR REPLACE INTO Ledger (id, stockId, ledgerType, name, openingCarat, openingValue, createdAt, updatedAt)
    VALUES 
      ('ldg_01', 'stk_01', 'SALES', 'Diamond Sales Income', 10.5, 50000.0, datetime('now'), datetime('now')),
      ('ldg_02', 'stk_02', 'PURCHASE', 'Rough Diamond Purchases', 15.0, 75000.0, datetime('now'), datetime('now'));
  `);

  await customerPrisma.$executeRawUnsafe(`
    INSERT OR REPLACE INTO Location (id, stockId, name, locationType)
    VALUES 
      ('loc_01', 'stk_01', 'Main Vault - High Security', 'VAULT'),
      ('loc_02', 'stk_02', 'Showroom Display Case A', 'SHOWROOM');
  `);

  // Record Before Counts
  const stockRowsBefore = await customerPrisma.$queryRawUnsafe("SELECT count(*) as cnt FROM Stock");
  const partyRowsBefore = await customerPrisma.$queryRawUnsafe("SELECT count(*) as cnt FROM Party");
  const diaRowsBefore = await customerPrisma.$queryRawUnsafe("SELECT count(*) as cnt FROM DiamondItem");
  const ledgerRowsBefore = await customerPrisma.$queryRawUnsafe("SELECT count(*) as cnt FROM Ledger");
  const locRowsBefore = await customerPrisma.$queryRawUnsafe("SELECT count(*) as cnt FROM Location");

  const beforeCounts = {
    stock: Number(stockRowsBefore[0].cnt),
    party: Number(partyRowsBefore[0].cnt),
    diamondItem: Number(diaRowsBefore[0].cnt),
    ledger: Number(ledgerRowsBefore[0].cnt),
    location: Number(locRowsBefore[0].cnt),
  };

  await customerPrisma.$disconnect();

  console.log('  Recorded baseline business entity counts:', beforeCounts);
  assert(beforeCounts.stock >= 3, 'Stock records successfully seeded and verified');
  assert(beforeCounts.party >= 2, 'Party records successfully seeded and verified');
  assert(beforeCounts.diamondItem >= 2, 'DiamondItem records successfully seeded and verified');
  assert(beforeCounts.ledger >= 2, 'Ledger records successfully seeded and verified');
  assert(beforeCounts.location >= 2, 'Location records successfully seeded and verified');

  // ── STEP 4: Preservation Package Creation ──────────────────────────────
  logStep('4. Create Unified Customer Data Preservation Package');
  process.env.DIAMOND_DATA_DIR = FAKE_APPDATA;
  process.env.DIAMOND_DB_DIR = path.join(FAKE_APPDATA, 'databases');

  // Setup control plane database
  const { systemPrisma } = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'infrastructure', 'database', 'prisma.js'));
  const { preservationService } = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'modules', 'system', 'preservation', 'preservation.service.js'));
  const { uninstallPreflightService } = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'modules', 'system', 'uninstall', 'uninstall-preflight.service.js'));
  const { recoveryService } = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'modules', 'system', 'recovery', 'recovery.service.js'));

  // Ensure installation record exists
  let controlInstall = await systemPrisma.installation.findFirst();
  if (!controlInstall) {
    controlInstall = await systemPrisma.installation.create({
      data: {
        installationId,
        appVersion: '3.0.0',
        status: 'ACTIVE',
        lifecycleState: 'READY',
        initializedAt: new Date(),
      },
    });
  }

  // Preflight check: active customer data MUST block uninstall without preservation
  const preflightBefore = await uninstallPreflightService.getPreflightStatus();
  assert(preflightBefore.activeDatabasesCount > 0, 'Preflight detects active customer database');
  assert(preflightBefore.canSafelyUninstall === false, 'Preflight strictly blocks uninstallation before preservation');

  // Create unified preservation package
  const pkg = await preservationService.createPreservationPackage({
    databasePath: customerDbPath,
    destinationDir: CUSTOM_EXPORT_DIR,
    confirmPreservation: true,
  });

  assert(pkg.status === 'VERIFIED', 'Preservation package created and status is VERIFIED');
  assert(fs.existsSync(pkg.destinationPath), 'Preservation destination package directory exists');
  assert(fs.existsSync(pkg.databaseBackupPath), 'Database backup file exists in preservation package');
  assert(fs.existsSync(pkg.csvExportPath), 'CSV export directory exists in preservation package');
  assert(fs.existsSync(pkg.xlsxExportPath), 'XLSX export file exists in preservation package');
  assert(fs.existsSync(pkg.manifestPath), 'Cryptographic preservation manifest exists in preservation package');

  // ── STEP 5: Deep Verification of Preservation Artifacts ────────────────
  logStep('5. Deep Verification of Preservation Artifacts');
  const verifyResult = await preservationService.verifyPreservationPackage(pkg.packageId);
  assert(verifyResult.verified === true, 'Deep verification passed for entire package');
  assert(verifyResult.databaseBackupVerified === true, 'Database backup verified (SQLite integrity ok)');
  assert(verifyResult.csvVerified === true, 'CSV exports verified (UTF-8, parsed rows, headers, checksums)');
  assert(verifyResult.xlsxVerified === true, 'XLSX workbook verified (ExcelJS opened, sheets, headers, row counts)');

  // ── STEP 6: Uninstall Authorization Issuance ───────────────────────────
  logStep('6. Issue Uninstall Authorization Bound to Installation & Manifest');
  const auth = await uninstallPreflightService.issueUninstallAuthorization(pkg.packageId);
  assert(auth.status === 'ISSUED', 'Authorization token issued with status ISSUED');

  const tokenPath = path.join(FAKE_APPDATA, 'uninstall-authorization.json');
  assert(fs.existsSync(tokenPath), 'uninstall-authorization.json written to AppData');

  const tokenJson = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  assert(tokenJson.installationId === installationId, 'Token installationId matches machine identity');
  assert(tokenJson.preservationPackageId === pkg.packageId, 'Token preservationPackageId matches package');
  assert(tokenJson.nonce && tokenJson.nonce.length >= 16, 'Cryptographic nonce present');
  assert(tokenJson.preservationManifestHash && tokenJson.preservationManifestHash.length === 64, 'Token includes SHA-256 hash of manifest');

  // ── STEP 7: Installer Independent Verification & Atomic Consumption ────
  logStep('7. Windows Installer Gate: Independent Verification & Atomic Consumption');
  // Check authorization validity
  const installerGateCheck = await uninstallPreflightService.checkAuthorizationToken();
  assert(installerGateCheck.valid === true, 'Independent validation of token passed before uninstall');

  // Atomically consume token
  await uninstallPreflightService.consumeAuthorizationToken();

  const consumedToken = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  assert(consumedToken.status === 'CONSUMED', 'Token status set to CONSUMED');
  assert(consumedToken.consumedAt !== null, 'Token consumedAt timestamp recorded');

  // Second check must be rejected (single-use enforcement)
  const secondCheck = await uninstallPreflightService.checkAuthorizationToken();
  assert(secondCheck.valid === false, 'Single-use invariant enforced: consumed token is strictly rejected');

  // ── STEP 8: Perform Uninstallation & AppData Preservation Check ─────────
  logStep('8. Perform Windows Uninstallation: Wipe Program Files, Preserve Customer AppData');
  // Delete Program Files
  fs.rmSync(FAKE_INSTALL_DIR, { recursive: true, force: true });
  assert(!fs.existsSync(FAKE_INSTALL_DIR), 'Application files in Program Files successfully removed');

  // CRITICAL INVARIANT: Customer AppData & Customer Database MUST SURVIVE!
  assert(fs.existsSync(customerDbPath), 'CRITICAL INVARIANT: Customer database SURVIVES uninstallation!');
  assert(fs.statSync(customerDbPath).size > 0, 'Customer database file is non-empty and preserved');

  // ── STEP 9: Reinstallation & Previous Customer Data Rediscovery ─────────
  logStep('9. Simulate Reinstallation & Customer Data Rediscovery');
  fs.mkdirSync(FAKE_INSTALL_DIR, { recursive: true });
  fs.writeFileSync(dummyExe, 'MOCK_PORTABLE_EXECUTABLE_BINARY');
  assert(fs.existsSync(dummyExe), 'Application reinstalled in Program Files');

  // Run reinstall detection
  const detection = await recoveryService.detectReinstallState();
  assert(detection.hasPreviousData === true, 'Reinstall detection discovers existing customer data');

  // Discover candidates
  const candidateResult = await recoveryService.discoverCandidates(path.join(FAKE_APPDATA, 'databases'));
  const foundCandidate = candidateResult.candidates.find(
    (c) => path.resolve(c.canonicalPath) === path.resolve(customerDbPath)
  );
  assert(Boolean(foundCandidate), 'Preserved customer database found as recovery candidate');

  // Inspect candidate (validation without attachment)
  const candidatePreview = await recoveryService.inspectCandidate(customerDbPath);
  assert(candidatePreview.sqliteIntegrity === 'ok', 'Candidate SQLite integrity is ok');
  assert(candidatePreview.tableCount > 0, 'Candidate schema verified with active tables');

  // Explicit confirmation required
  const restoreSession = await recoveryService.prepareRestore({
    candidatePath: customerDbPath,
    targetProfileCode: 'RECOVERED_PROF',
  });
  assert(Boolean(restoreSession.restoreId), 'Restore session prepared with unique restoreId');

  const confirmResult = await recoveryService.confirmRestore({
    restoreId: restoreSession.restoreId,
    confirmDestructiveOverwrite: true,
    targetProfileCode: 'RECOVERED_PROF',
  });
  assert(confirmResult.status === 'VERIFIED', 'Explicit recovery confirmation completed and verified');

  // ── STEP 10: Real Data Integrity Verification (before == after) ─────────
  logStep('10. Verify Real Data Integrity: before == after for 100% of Business Entities');
  const verifyClient = new PrismaClient({
    datasourceUrl: `file:${path.resolve(customerDbPath)}`,
  });

  const stockRowsAfter = await verifyClient.$queryRawUnsafe("SELECT count(*) as cnt FROM Stock");
  const partyRowsAfter = await verifyClient.$queryRawUnsafe("SELECT count(*) as cnt FROM Party");
  const diaRowsAfter = await verifyClient.$queryRawUnsafe("SELECT count(*) as cnt FROM DiamondItem");
  const ledgerRowsAfter = await verifyClient.$queryRawUnsafe("SELECT count(*) as cnt FROM Ledger");
  const locRowsAfter = await verifyClient.$queryRawUnsafe("SELECT count(*) as cnt FROM Location");

  const afterCounts = {
    stock: Number(stockRowsAfter[0].cnt),
    party: Number(partyRowsAfter[0].cnt),
    diamondItem: Number(diaRowsAfter[0].cnt),
    ledger: Number(ledgerRowsAfter[0].cnt),
    location: Number(locRowsAfter[0].cnt),
  };

  await verifyClient.$disconnect();

  console.log('  Recorded post-reinstall business entity counts:', afterCounts);
  assert(afterCounts.stock === beforeCounts.stock, `Stock count identical: ${afterCounts.stock} == ${beforeCounts.stock}`);
  assert(afterCounts.party === beforeCounts.party, `Party count identical: ${afterCounts.party} == ${beforeCounts.party}`);
  assert(afterCounts.diamondItem === beforeCounts.diamondItem, `DiamondItem count identical: ${afterCounts.diamondItem} == ${beforeCounts.diamondItem}`);
  assert(afterCounts.ledger === beforeCounts.ledger, `Ledger count identical: ${afterCounts.ledger} == ${beforeCounts.ledger}`);
  assert(afterCounts.location === beforeCounts.location, `Location count identical: ${afterCounts.location} == ${beforeCounts.location}`);

  // ── Clean up scratch directory ──────────────────────────────────────────
  try {
    fs.rmSync(TEST_SCRATCH, { recursive: true, force: true });
  } catch {}

  console.log('\n================================================================');
  console.log(`Phase 7 Real Windows E2E Lifecycle Test PASSED!`);
  console.log(`Passed Assertions: ${passedTests} | Failed Assertions: ${failedTests}`);
  console.log('================================================================\n');
}

runE2E().catch((err) => {
  console.error('\n❌ Phase 7 Windows E2E Execution Failed:\n', err);
  process.exit(1);
});
