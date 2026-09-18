import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { canonicalizeDatabasePath } from './database-path.util';
import { logger } from '../../../infrastructure/logging';
import type { DatabaseValidationResultDto } from '@diamond-erp/contracts';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0');

// Essential Diamond ERP tables required to consider a database compatible
const REQUIRED_ERP_TABLES = [
  'Stock',
  'Ledger',
  'Party',
  'DiamondItem',
  'Transaction',
  'User',
  'Profile',
];

// Critical columns required per table to guarantee application query compatibility
const REQUIRED_COLUMNS_BY_TABLE: Record<string, string[]> = {
  Stock: ['id', 'stockCode', 'name'],
  Ledger: ['id', 'stockId', 'ledgerType', 'name'],
  Party: ['id', 'partyCode', 'name', 'partyType'],
  DiamondItem: ['id', 'itemCode', 'stockId', 'carat'],
  Transaction: ['id', 'transactionNo', 'transactionType', 'status'],
  User: ['id', 'username', 'passwordHash'],
  Profile: ['id', 'code', 'name'],
};

export class DatabaseValidationService {
  /**
   * Validate a candidate SQLite database in a strictly READ-ONLY manner.
   *
   * Security Invariant:
   * Validation NEVER modifies, copies, migrates, renames, or deletes the target file.
   */
  async validateDatabase(candidatePath: string): Promise<DatabaseValidationResultDto> {
    const pathResult = canonicalizeDatabasePath(candidatePath);
    if (!pathResult.valid) {
      return {
        status: 'INVALID',
        canonicalPath: candidatePath,
        isValid: false,
        tableCount: 0,
        schemaVersion: 0,
        integrityCheck: 'failed',
        tablesFound: [],
        missingRequiredTables: REQUIRED_ERP_TABLES,
        detectedType: 'INVALID',
        details: pathResult.error,
        error: pathResult.error,
      };
    }

    const { canonicalPath } = pathResult;

    // 1. File-level validation
    if (!fs.existsSync(canonicalPath)) {
      return {
        status: 'MISSING',
        canonicalPath,
        isValid: false,
        tableCount: 0,
        schemaVersion: 0,
        integrityCheck: 'file_not_found',
        tablesFound: [],
        missingRequiredTables: REQUIRED_ERP_TABLES,
        detectedType: 'MISSING',
        details: 'Physical database file does not exist on disk',
        error: 'File not found',
      };
    }

    try {
      const stats = fs.statSync(canonicalPath);
      if (!stats.isFile() || stats.size < 512) {
        return {
          status: 'INVALID',
          canonicalPath,
          isValid: false,
          tableCount: 0,
          schemaVersion: 0,
          integrityCheck: 'invalid_file_size',
          tablesFound: [],
          missingRequiredTables: REQUIRED_ERP_TABLES,
          detectedType: 'INVALID',
          details: 'File is not a valid regular file or size is below minimum SQLite page size (512 bytes)',
          error: 'Invalid file format',
        };
      }

      fs.accessSync(canonicalPath, fs.constants.R_OK);
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        canonicalPath,
        isValid: false,
        tableCount: 0,
        schemaVersion: 0,
        integrityCheck: 'access_denied',
        tablesFound: [],
        missingRequiredTables: REQUIRED_ERP_TABLES,
        detectedType: 'UNAVAILABLE',
        details: `Permission denied reading file: ${(err as Error).message}`,
        error: 'File unavailable',
      };
    }

    // 2. Header-level validation
    try {
      const fd = fs.openSync(canonicalPath, 'r');
      const headerBuf = Buffer.alloc(16);
      fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);

      if (!headerBuf.equals(SQLITE_HEADER)) {
        return {
          status: 'INVALID',
          canonicalPath,
          isValid: false,
          tableCount: 0,
          schemaVersion: 0,
          integrityCheck: 'not_sqlite',
          tablesFound: [],
          missingRequiredTables: REQUIRED_ERP_TABLES,
          detectedType: 'INVALID',
          details: 'File header does not match SQLite 3 signature',
          error: 'Not a SQLite database',
        };
      }
    } catch (err) {
      return {
        status: 'INVALID',
        canonicalPath,
        isValid: false,
        tableCount: 0,
        schemaVersion: 0,
        integrityCheck: 'read_error',
        tablesFound: [],
        missingRequiredTables: REQUIRED_ERP_TABLES,
        detectedType: 'INVALID',
        details: `Failed reading database header: ${(err as Error).message}`,
        error: 'Read error',
      };
    }

    // 3. SQLite Integrity & ERP Schema validation
    // Connect using read-only connection URI to guarantee zero mutation
    const normalizedUrl = canonicalPath.replace(/\\/g, '/');
    const readOnlyClient = new PrismaClient({
      datasources: {
        db: {
          url: `file:${normalizedUrl}?mode=ro`,
        },
      },
    });

    const isBackupPath = canonicalPath.toLowerCase().includes('backup') || canonicalPath.toLowerCase().endsWith('.bak');

    try {
      await readOnlyClient.$connect();

      // Run PRAGMA integrity_check
      const integrityResult = await readOnlyClient.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      const checkMessage = integrityResult?.[0]?.integrity_check || 'ok';
      if (checkMessage !== 'ok') {
        logger.warn(`Integrity check failed on ${canonicalPath}: ${checkMessage}`);
        return {
          status: 'CORRUPTED',
          canonicalPath,
          isValid: false,
          tableCount: 0,
          schemaVersion: 0,
          integrityCheck: checkMessage,
          tablesFound: [],
          missingRequiredTables: REQUIRED_ERP_TABLES,
          detectedType: 'CORRUPTED',
          details: `SQLite integrity_check returned: ${checkMessage}`,
          error: 'Database corrupted',
        };
      }

      // Query tables from sqlite_master
      const tablesMaster = await readOnlyClient.$queryRawUnsafe<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%';"
      );
      const tablesFound = tablesMaster.map((t) => t.name);

      const missingRequiredTables = REQUIRED_ERP_TABLES.filter((t) => !tablesFound.includes(t));
      if (missingRequiredTables.length > 0) {
        return {
          status: 'UNSUPPORTED',
          canonicalPath,
          isValid: false,
          tableCount: tablesFound.length,
          schemaVersion: 0,
          integrityCheck: 'ok',
          tablesFound,
          missingRequiredTables,
          detectedType: isBackupPath ? 'UNSUPPORTED_BACKUP' : 'UNKNOWN_SQLITE',
          details: `Missing required Diamond ERP tables: ${missingRequiredTables.join(', ')}`,
          error: 'Unsupported schema',
        };
      }

      // Check required columns per required table
      const missingRequiredColumns: Record<string, string[]> = {};
      let hasColumnDeficiencies = false;

      for (const table of REQUIRED_ERP_TABLES) {
        const tableColumns = await readOnlyClient.$queryRawUnsafe<{ name: string }[]>(
          `PRAGMA table_info("${table}");`
        );
        const colNames = new Set(tableColumns.map((c) => c.name));
        const expectedCols = REQUIRED_COLUMNS_BY_TABLE[table] || [];
        const missingCols = expectedCols.filter((col) => !colNames.has(col));
        if (missingCols.length > 0) {
          missingRequiredColumns[table] = missingCols;
          hasColumnDeficiencies = true;
        }
      }

      if (hasColumnDeficiencies) {
        return {
          status: 'UNSUPPORTED',
          canonicalPath,
          isValid: false,
          tableCount: tablesFound.length,
          schemaVersion: 0,
          integrityCheck: 'ok',
          tablesFound,
          missingRequiredTables: [],
          missingRequiredColumns,
          detectedType: 'UNSUPPORTED_VERSION',
          details: `Required tables are missing critical columns: ${JSON.stringify(missingRequiredColumns)}`,
          error: 'Schema columns incompatible',
        };
      }

      // Check schema version from Profile table if available
      let schemaVersion = 1;
      try {
        const profRecord = await readOnlyClient.$queryRawUnsafe<any[]>('SELECT schemaVersion FROM "Profile" LIMIT 1;');
        if (profRecord?.[0]?.schemaVersion) {
          schemaVersion = Number(profRecord[0].schemaVersion);
        }
      } catch {
        // Default to version 1
      }

      const detectedType = isBackupPath
        ? 'BACKUP'
        : canonicalPath.toLowerCase().includes('profiles')
        ? 'DIAMOND_ERP_PROFILE'
        : 'EXTERNAL';

      return {
        status: 'ACTIVE',
        canonicalPath,
        isValid: true,
        tableCount: tablesFound.length,
        schemaVersion,
        integrityCheck: 'ok',
        tablesFound,
        missingRequiredTables: [],
        missingRequiredColumns: {},
        detectedType,
        details: 'Valid Diamond ERP production database',
      };
    } catch (err) {
      const errMsg = (err as Error).message || '';
      const isCorrupted =
        errMsg.toLowerCase().includes('file is not a database') ||
        errMsg.toLowerCase().includes('malformed') ||
        errMsg.toLowerCase().includes('corrupt') ||
        errMsg.toLowerCase().includes('code: `26`') ||
        errMsg.toLowerCase().includes('code: `11`');

      const status = isCorrupted ? 'CORRUPTED' : 'INVALID';

      logger.error(`Error during database validation of ${canonicalPath}: ${errMsg}`);
      return {
        status,
        canonicalPath,
        isValid: false,
        tableCount: 0,
        schemaVersion: 0,
        integrityCheck: isCorrupted ? 'database_corrupted' : 'connection_failed',
        tablesFound: [],
        missingRequiredTables: REQUIRED_ERP_TABLES,
        detectedType: status,
        details: errMsg,
        error: isCorrupted ? 'Database corrupted' : 'Failed to inspect database',
      };
    } finally {
      await readOnlyClient.$disconnect().catch(() => {});
    }
  }
}

export const databaseValidationService = new DatabaseValidationService();
