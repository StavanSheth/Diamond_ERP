import path from 'path';
import fs from 'fs';
import { getDatabasesDir } from '../../../infrastructure/paths';

export interface PathValidationResult {
  valid: boolean;
  canonicalPath: string;
  error?: string;
  isExternal: boolean;
}

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

export function canonicalizeDatabasePath(rawPath: string): PathValidationResult {
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
  const baseName = path.basename(trimmed);
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
  const databasesDir = path.resolve(getDatabasesDir());
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(path.normalize(trimmed))
    : path.resolve(databasesDir, path.normalize(trimmed));

  // Guard 5: Verify whether path points to a directory
  if (fs.existsSync(resolved)) {
    try {
      const stats = fs.statSync(resolved);
      if (stats.isDirectory()) {
        return {
          valid: false,
          canonicalPath: resolved,
          error: 'Specified path points to a directory, not a database file',
          isExternal: !resolved.startsWith(databasesDir),
        };
      }
    } catch (err) {
      return {
        valid: false,
        canonicalPath: resolved,
        error: `Could not access path: ${(err as Error).message}`,
        isExternal: !resolved.startsWith(databasesDir),
      };
    }
  }

  const isExternal = !resolved.startsWith(databasesDir);

  return {
    valid: true,
    canonicalPath: resolved,
    isExternal,
  };
}
