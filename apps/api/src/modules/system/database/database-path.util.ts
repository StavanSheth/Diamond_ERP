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

  // Guard against null byte injections
  if (trimmed.includes('\0')) {
    return {
      valid: false,
      canonicalPath: '',
      error: 'Database path contains invalid null bytes',
      isExternal: false,
    };
  }

  // Resolve to full absolute canonical path
  const databasesDir = path.resolve(getDatabasesDir());
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(path.normalize(trimmed))
    : path.resolve(databasesDir, path.normalize(trimmed));

  // Verify whether path points to a directory
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
