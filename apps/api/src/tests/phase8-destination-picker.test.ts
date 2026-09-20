import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { getDatabasesDir, getControlDbPath } from '../infrastructure/paths';

describe('Phase 8 — Dedicated Preservation Destination Picker (P1)', () => {
  const scratchDir = path.resolve('apps/api/test-scratch-dest-picker');
  const validDestDir = path.join(scratchDir, 'custom_preservation_dir');

  beforeAll(() => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(scratchDir)) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('rejects empty or whitespace-only destination paths', async () => {
    const res = await uninstallPreflightService.validateDestination('');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/cannot be blank/i);

    const res2 = await uninstallPreflightService.validateDestination('   ');
    expect(res2.valid).toBe(false);
  });

  it('rejects destination paths pointing to active databases directory or database file', async () => {
    const dbsDir = getDatabasesDir();
    const res = await uninstallPreflightService.validateDestination(dbsDir);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/active databases directory/i);

    const resDbFile = await uninstallPreflightService.validateDestination(path.join(dbsDir, 'any_database.db'));
    expect(resDbFile.valid).toBe(false);
    expect(resDbFile.error).toMatch(/must be a folder/i);
  });

  it('rejects destination pointing to the system control database', async () => {
    const controlDb = getControlDbPath();
    const res = await uninstallPreflightService.validateDestination(controlDb);

    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/control database/i);
  });

  it('successfully validates and tests write capability on a valid destination directory', async () => {
    const res = await uninstallPreflightService.validateDestination(validDestDir);

    expect(res.valid).toBe(true);
    expect(res.exists).toBe(true);
    expect(res.writable).toBe(true);
    expect(res.canonicalPath).toBe(path.resolve(validDestDir));
    expect(fs.existsSync(validDestDir)).toBe(true);
  });

  it('browseDestination returns suggested destination directories and structured result', async () => {
    const res = await uninstallPreflightService.browseDestination();

    expect(res).toBeDefined();
    expect(typeof res.canceled).toBe('boolean');
    expect(Array.isArray(res.suggestedPaths)).toBe(true);
    expect(res.suggestedPaths!.length).toBeGreaterThan(0);
  });
});
