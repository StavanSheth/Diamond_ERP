"use strict";
/**
 * Authoritative Centralized Database Schema Compatibility Policy
 * Defines supported, older/migratable, and newer/unsupported version bounds
 * shared by DatabaseValidationService, RecoveryService, and Onboarding.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemaCompatibilityService = exports.SchemaCompatibilityService = void 0;
class SchemaCompatibilityService {
    /**
     * Evaluates a database schema version against authoritative application support bounds.
     */
    check(candidateVersion) {
        const currentVersion = SchemaCompatibilityService.CURRENT_SCHEMA_VERSION;
        const minSupported = SchemaCompatibilityService.MIN_SUPPORTED_VERSION;
        const maxSupported = SchemaCompatibilityService.MAX_SUPPORTED_VERSION;
        if (candidateVersion === null || candidateVersion === undefined || isNaN(candidateVersion)) {
            return {
                status: 'UNKNOWN',
                candidateVersion: 0,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: false,
                canMigrate: false,
                conflictReason: 'UNKNOWN_SCHEMA_VERSION',
                details: 'Candidate schema version is undefined or unrecognized.',
            };
        }
        const version = Number(candidateVersion);
        if (version < 0) {
            return {
                status: 'INVALID',
                candidateVersion: version,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: false,
                canMigrate: false,
                conflictReason: 'INVALID_NEGATIVE_SCHEMA_VERSION',
                details: `Invalid negative database schema version: ${version}.`,
            };
        }
        if (version === currentVersion) {
            return {
                status: 'SUPPORTED',
                candidateVersion: version,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: true,
                canMigrate: false,
                conflictReason: null,
                details: `Schema version ${version} matches current application schema version.`,
            };
        }
        if (version > maxSupported) {
            return {
                status: 'NEWER_UNSUPPORTED',
                candidateVersion: version,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: false,
                canMigrate: false,
                conflictReason: 'UNSUPPORTED_SCHEMA_VERSION_NEWER',
                details: `Database schema version (${version}) is newer than maximum supported (${maxSupported}) by this application.`,
            };
        }
        if (version > currentVersion && version <= maxSupported) {
            // Future within known range, but newer than current running engine
            return {
                status: 'NEWER_UNSUPPORTED',
                candidateVersion: version,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: false,
                canMigrate: false,
                conflictReason: 'UNSUPPORTED_SCHEMA_VERSION_NEWER',
                details: `Database schema version (${version}) is newer than current application version (${currentVersion}).`,
            };
        }
        if (version < minSupported) {
            // Version 0 or older migratable schema
            return {
                status: 'OLDER_MIGRATABLE',
                candidateVersion: version,
                currentVersion,
                minSupportedVersion: minSupported,
                maxSupportedVersion: maxSupported,
                isCompatible: true,
                canMigrate: true,
                conflictReason: 'MIGRATABLE_SCHEMA_VERSION_OLDER',
                details: `Database schema version (${version}) is older than current (${currentVersion}) and requires migration.`,
            };
        }
        return {
            status: 'SUPPORTED',
            candidateVersion: version,
            currentVersion,
            minSupportedVersion: minSupported,
            maxSupportedVersion: maxSupported,
            isCompatible: true,
            canMigrate: false,
            conflictReason: null,
            details: `Schema version ${version} is supported.`,
        };
    }
    isCompatible(candidateVersion) {
        const res = this.check(candidateVersion);
        return res.isCompatible;
    }
    canMigrate(candidateVersion) {
        const res = this.check(candidateVersion);
        return res.canMigrate;
    }
}
exports.SchemaCompatibilityService = SchemaCompatibilityService;
SchemaCompatibilityService.CURRENT_SCHEMA_VERSION = 1;
SchemaCompatibilityService.MIN_SUPPORTED_VERSION = 1;
SchemaCompatibilityService.MAX_SUPPORTED_VERSION = 10;
exports.schemaCompatibilityService = new SchemaCompatibilityService();
//# sourceMappingURL=schema-compatibility.service.js.map