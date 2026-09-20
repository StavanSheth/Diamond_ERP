import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  EXPORT_ENTITY_REGISTRY,
  getExportableEntities,
  buildExportQueries,
  SENSITIVE_COLUMN_PATTERN,
} from '../modules/system/export/export-entity-registry';
import { ExportService } from '../modules/system/export/export.service';
import prisma, { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 7 — Export Completeness & Registry Integrity', () => {
  const exportService = new ExportService();
  const testDir = path.resolve('apps/api/test-scratch-export-completeness');
  const testDbPath = path.join(testDir, 'export_test.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.copyFileSync(templateDb, testDbPath);

    // Ensure installation exists in control plane
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_export_completeness',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('P7-EXP-1: Export entity registry contains all 16 business models and marks them exportable', () => {
    const exportable = getExportableEntities();
    expect(exportable.length).toBe(16);

    const names = exportable.map((e) => e.entityName);
    const expected = [
      'Stock',
      'Ledger',
      'Party',
      'DiamondItem',
      'Certification',
      'Repair',
      'Transaction',
      'TransactionItem',
      'Location',
      'ItemEvent',
      'InventoryMovement',
      'FinancialEntry',
      'ItemTransformation',
      'TransformationProvenance',
      'DocumentDraft',
      'DraftRevision',
    ];

    for (const exp of expected) {
      expect(names).toContain(exp);
    }
  });

  it('P7-EXP-2: Internal and sensitive system models are marked non-exportable', () => {
    const systemEntities = EXPORT_ENTITY_REGISTRY.filter((e) => e.category === 'SYSTEM');
    expect(systemEntities.length).toBeGreaterThanOrEqual(6);

    const systemNames = systemEntities.map((e) => e.entityName);
    expect(systemNames).toContain('Setting');
    expect(systemNames).toContain('RecordVersion');
    expect(systemNames).toContain('VersionChange');
    expect(systemNames).toContain('AuditEvent');
    expect(systemNames).toContain('Sequence');
    expect(systemNames).toContain('IdempotencyKey');

    for (const ent of systemEntities) {
      expect(ent.exportable).toBe(false);
    }
  });

  it('P7-EXP-3: SENSITIVE_COLUMN_PATTERN accurately flags credentials and secret tokens', () => {
    expect(SENSITIVE_COLUMN_PATTERN.test('password')).toBe(true);
    expect(SENSITIVE_COLUMN_PATTERN.test('passwordHash')).toBe(true);
    expect(SENSITIVE_COLUMN_PATTERN.test('pin')).toBe(true);
    expect(SENSITIVE_COLUMN_PATTERN.test('secretToken')).toBe(true);
    expect(SENSITIVE_COLUMN_PATTERN.test('refreshToken')).toBe(true);

    // Business fields must NOT be flagged
    expect(SENSITIVE_COLUMN_PATTERN.test('itemName')).toBe(false);
    expect(SENSITIVE_COLUMN_PATTERN.test('amount')).toBe(false);
    expect(SENSITIVE_COLUMN_PATTERN.test('caratWeight')).toBe(false);
    expect(SENSITIVE_COLUMN_PATTERN.test('certificateNumber')).toBe(false);
  });

  it('P7-EXP-4: buildExportQueries builds queries for all 16 exportable entities on client', () => {
    const queries = buildExportQueries(prisma);
    expect(queries.length).toBe(16);

    const queryNames = queries.map((q) => q.name);
    expect(queryNames).toContain('Stock');
    expect(queryNames).toContain('ItemEvent');
    expect(queryNames).toContain('InventoryMovement');
    expect(queryNames).toContain('FinancialEntry');
    expect(queryNames).toContain('ItemTransformation');
    expect(queryNames).toContain('TransformationProvenance');
    expect(queryNames).toContain('DocumentDraft');
    expect(queryNames).toContain('DraftRevision');
  });

  it('P7-EXP-5: ExportService executes complete multi-table export generating manifest and checksums', async () => {
    const result = await exportService.exportBusinessData(
      {
        databasePath: testDbPath,
        format: 'CSV',
      },
      'test_operator'
    );

    expect(result.success).toBe(true);
    expect(result.exportId).toBeDefined();
    expect(result.manifest.tables.length).toBe(16);
    expect(fs.existsSync(result.filePath)).toBe(true);

    const manifestPath = path.join(result.filePath, 'export-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.tables.length).toBe(16);
    expect(manifest.tables[0].sha256).toBeDefined();

    // Clean up bundle
    try {
      fs.rmSync(result.filePath, { recursive: true, force: true });
    } catch {}
  });
});
