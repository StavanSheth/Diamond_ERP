"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const schema_compatibility_service_1 = require("../modules/system/database/schema-compatibility.service");
(0, vitest_1.describe)('Phase 8 — Centralized Database Schema Compatibility Policy', () => {
    (0, vitest_1.it)('correctly validates the current supported schema version (v1)', () => {
        const res = schema_compatibility_service_1.schemaCompatibilityService.check(1);
        (0, vitest_1.expect)(res.status).toBe('SUPPORTED');
        (0, vitest_1.expect)(res.isCompatible).toBe(true);
        (0, vitest_1.expect)(res.canMigrate).toBe(false);
        (0, vitest_1.expect)(res.conflictReason).toBeNull();
    });
    (0, vitest_1.it)('classifies older schema versions as OLDER_MIGRATABLE', () => {
        const res = schema_compatibility_service_1.schemaCompatibilityService.check(0);
        (0, vitest_1.expect)(res.status).toBe('OLDER_MIGRATABLE');
        (0, vitest_1.expect)(res.isCompatible).toBe(true);
        (0, vitest_1.expect)(res.canMigrate).toBe(true);
        (0, vitest_1.expect)(res.conflictReason).toBe('MIGRATABLE_SCHEMA_VERSION_OLDER');
    });
    (0, vitest_1.it)('rejects newer schema versions (> 1) as NEWER_UNSUPPORTED', () => {
        const res = schema_compatibility_service_1.schemaCompatibilityService.check(2);
        (0, vitest_1.expect)(res.status).toBe('NEWER_UNSUPPORTED');
        (0, vitest_1.expect)(res.isCompatible).toBe(false);
        (0, vitest_1.expect)(res.canMigrate).toBe(false);
        (0, vitest_1.expect)(res.conflictReason).toBe('UNSUPPORTED_SCHEMA_VERSION_NEWER');
        const futureRes = schema_compatibility_service_1.schemaCompatibilityService.check(15);
        (0, vitest_1.expect)(futureRes.status).toBe('NEWER_UNSUPPORTED');
        (0, vitest_1.expect)(futureRes.isCompatible).toBe(false);
    });
    (0, vitest_1.it)('rejects invalid negative schema versions', () => {
        const res = schema_compatibility_service_1.schemaCompatibilityService.check(-1);
        (0, vitest_1.expect)(res.status).toBe('INVALID');
        (0, vitest_1.expect)(res.isCompatible).toBe(false);
        (0, vitest_1.expect)(res.conflictReason).toBe('INVALID_NEGATIVE_SCHEMA_VERSION');
    });
    (0, vitest_1.it)('handles null, undefined, or NaN schema versions gracefully as UNKNOWN', () => {
        const resNull = schema_compatibility_service_1.schemaCompatibilityService.check(null);
        (0, vitest_1.expect)(resNull.status).toBe('UNKNOWN');
        (0, vitest_1.expect)(resNull.isCompatible).toBe(false);
        const resUndefined = schema_compatibility_service_1.schemaCompatibilityService.check(undefined);
        (0, vitest_1.expect)(resUndefined.status).toBe('UNKNOWN');
        (0, vitest_1.expect)(resUndefined.isCompatible).toBe(false);
        const resNan = schema_compatibility_service_1.schemaCompatibilityService.check(NaN);
        (0, vitest_1.expect)(resNan.status).toBe('UNKNOWN');
        (0, vitest_1.expect)(resNan.isCompatible).toBe(false);
    });
});
//# sourceMappingURL=phase8-schema-compatibility.test.js.map