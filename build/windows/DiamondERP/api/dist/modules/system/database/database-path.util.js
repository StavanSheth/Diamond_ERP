"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeDatabasePath = canonicalizeDatabasePath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const paths_1 = require("../../../infrastructure/paths");
/**
 * Authoritative Canonical Database Path Utility.
 *
 * Requirements:
 * 1. Resolves relative paths relative to working dir or databases dir.
 * 2. Normalizes separators and resolves parent segments (..).
 * 3. Prevents path traversal vulnerabilities where relative names are expected.
 * 4. Distinguishes regular files from directories (rejects directories).
 * 5. Rejects unsupported or empty paths.
 * 6. Preserves user-selected absolute paths for external candidate databases.
 * 7. Never silently converts an externally selected DB into another filename.
 */
const RESERVED_DEVICE_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);
const INVALID_PATH_CHARS = /[<>"|?*]/;
function canonicalizeDatabasePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        return {
            valid: false,
            canonicalPath: '',
            error: 'Database path cannot be empty',
            isExternal: false,
        };
    }
    const trimmed = rawPath.trim();
    // Guard 1: Reject null byte injections
    if (trimmed.includes('\0')) {
        return {
            valid: false,
            canonicalPath: '',
            error: 'Database path contains invalid null bytes',
            isExternal: false,
        };
    }
    // Guard 2: Reject UNC network share paths (e.g. \\server\share\file.db or //server/share/file.db)
    if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
        return {
            valid: false,
            canonicalPath: trimmed,
            error: 'UNC and network share paths are not supported for local SQLite database operation',
            isExternal: true,
        };
    }
    // Guard 3: Reject invalid Windows filesystem characters in the file path
    // Strip drive prefix (e.g. C:) if present before testing for invalid characters
    const pathWithoutDrive = trimmed.replace(/^[a-zA-Z]:/, '');
    if (INVALID_PATH_CHARS.test(pathWithoutDrive)) {
        return {
            valid: false,
            canonicalPath: trimmed,
            error: 'Database path contains invalid filesystem characters (< > " | ? *)',
            isExternal: false,
        };
    }
    // Guard 4: Reject Windows reserved device names (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
    const baseName = path_1.default.basename(trimmed);
    const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '').toUpperCase();
    if (RESERVED_DEVICE_NAMES.has(nameWithoutExt)) {
        return {
            valid: false,
            canonicalPath: trimmed,
            error: `Database path uses a reserved Windows device name (${nameWithoutExt})`,
            isExternal: false,
        };
    }
    // Resolve to full absolute canonical path
    const databasesDir = path_1.default.resolve((0, paths_1.getDatabasesDir)());
    const resolved = path_1.default.isAbsolute(trimmed)
        ? path_1.default.resolve(path_1.default.normalize(trimmed))
        : path_1.default.resolve(databasesDir, path_1.default.normalize(trimmed));
    let canonical = resolved;
    // Guard 5: Verify whether path points to a directory
    if (fs_1.default.existsSync(resolved)) {
        try {
            const stats = fs_1.default.statSync(resolved);
            if (stats.isDirectory()) {
                return {
                    valid: false,
                    canonicalPath: resolved,
                    error: 'Specified path points to a directory, not a database file',
                    isExternal: !resolved.startsWith(databasesDir),
                };
            }
            // Windows native path normalization: resolve exact filesystem casing
            try {
                canonical = fs_1.default.realpathSync.native(resolved);
            }
            catch {
                canonical = resolved;
            }
        }
        catch (err) {
            return {
                valid: false,
                canonicalPath: resolved,
                error: `Could not access path: ${err.message}`,
                isExternal: !resolved.startsWith(databasesDir),
            };
        }
    }
    const isExternal = !canonical.startsWith(databasesDir);
    return {
        valid: true,
        canonicalPath: canonical,
        isExternal,
    };
}
//# sourceMappingURL=database-path.util.js.map