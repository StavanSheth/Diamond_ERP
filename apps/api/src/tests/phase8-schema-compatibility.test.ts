import { describe, it, expect } from 'vitest';
import { schemaCompatibilityService } from '../modules/system/database/schema-compatibility.service';

describe('Phase 8 — Centralized Database Schema Compatibility Policy', () => {
  it('correctly validates the current supported schema version (v1)', () => {
    const res = schemaCompatibilityService.check(1);
    expect(res.status).toBe('SUPPORTED');
    expect(res.isCompatible).toBe(true);
    expect(res.canMigrate).toBe(false);
    expect(res.conflictReason).toBeNull();
  });

  it('classifies older schema versions as OLDER_MIGRATABLE', () => {
    const res = schemaCompatibilityService.check(0);
    expect(res.status).toBe('OLDER_MIGRATABLE');
    expect(res.isCompatible).toBe(true);
    expect(res.canMigrate).toBe(true);
    expect(res.conflictReason).toBe('MIGRATABLE_SCHEMA_VERSION_OLDER');
  });

  it('rejects newer schema versions (> 1) as NEWER_UNSUPPORTED', () => {
    const res = schemaCompatibilityService.check(2);
    expect(res.status).toBe('NEWER_UNSUPPORTED');
    expect(res.isCompatible).toBe(false);
    expect(res.canMigrate).toBe(false);
    expect(res.conflictReason).toBe('UNSUPPORTED_SCHEMA_VERSION_NEWER');

    const futureRes = schemaCompatibilityService.check(15);
    expect(futureRes.status).toBe('NEWER_UNSUPPORTED');
    expect(futureRes.isCompatible).toBe(false);
  });

  it('rejects invalid negative schema versions', () => {
    const res = schemaCompatibilityService.check(-1);
    expect(res.status).toBe('INVALID');
    expect(res.isCompatible).toBe(false);
    expect(res.conflictReason).toBe('INVALID_NEGATIVE_SCHEMA_VERSION');
  });

  it('handles null, undefined, or NaN schema versions gracefully as UNKNOWN', () => {
    const resNull = schemaCompatibilityService.check(null);
    expect(resNull.status).toBe('UNKNOWN');
    expect(resNull.isCompatible).toBe(false);

    const resUndefined = schemaCompatibilityService.check(undefined);
    expect(resUndefined.status).toBe('UNKNOWN');
    expect(resUndefined.isCompatible).toBe(false);

    const resNan = schemaCompatibilityService.check(NaN);
    expect(resNan.status).toBe('UNKNOWN');
    expect(resNan.isCompatible).toBe(false);
  });
});
