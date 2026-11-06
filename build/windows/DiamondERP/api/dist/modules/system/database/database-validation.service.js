"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseValidationService = exports.DatabaseValidationService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const database_path_util_1 = require("./database-path.util");
const schema_compatibility_service_1 = require("./schema-compatibility.service");
const logging_1 = require("../../../infrastructure/logging");
const paths_1 = require("../../../infrastructure/paths");
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
const REQUIRED_COLUMNS_BY_TABLE = {
    Stock: ['id', 'stockCode', 'name'],
    Ledger: ['id', 'stockId', 'ledgerType', 'name'],
    Party: ['id', 'partyCode', 'name', 'partyType'],
    DiamondItem: ['id', 'itemCode', 'stockId', 'carat'],
    Transaction: ['id', 'transactionNo', 'transactionType', 'status'],
    User: ['id', 'username', 'passwordHash'],
    Profile: ['id', 'code', 'name'],
};
class DatabaseValidationService {
    /**
     * Validate a candidate SQLite database in a strictly READ-ONLY manner.
     *
     * Security Invariant:
     * Validation NEVER modifies, copies, migrates, renames, or deletes the target file.
     */
    async validateDatabase(candidatePath, options) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(candidatePath);
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
        // Guard: Reject Control Database (system.db)
        const controlDbCanonical = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        if (canonicalPath.toLowerCase() === controlDbCanonical) {
            return {
                status: 'INVALID',
                canonicalPath,
                isValid: false,
                tableCount: 0,
                schemaVersion: 0,
                integrityCheck: 'control_db',
                tablesFound: [],
                missingRequiredTables: REQUIRED_ERP_TABLES,
                detectedType: 'CONTROL_DB',
                details: 'The system control database (system.db) cannot be attached as an ERP business database.',
                error: 'DATABASE_IS_CONTROL_DB',
            };
        }
        // Guard: Reject Template Database (template.db) unless validating the template itself
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        if (!options?.allowTemplate && templateDbPath && canonicalPath.toLowerCase() === path_1.default.resolve(templateDbPath).toLowerCase()) {
            return {
                status: 'INVALID',
                canonicalPath,
                isValid: false,
                tableCount: 0,
                schemaVersion: 0,
                integrityCheck: 'template_db',
                tablesFound: [],
                missingRequiredTables: REQUIRED_ERP_TABLES,
                detectedType: 'TEMPLATE_DB',
                details: 'The schema template (template.db) is immutable and cannot be attached as an active business database.',
                error: 'DATABASE_IS_TEMPLATE',
            };
        }
        // 1. File-level validation
        if (!fs_1.default.existsSync(canonicalPath)) {
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
            const stats = fs_1.default.statSync(canonicalPath);
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
            fs_1.default.accessSync(canonicalPath, fs_1.default.constants.R_OK);
        }
        catch (err) {
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
                details: `Permission denied reading file: ${err.message}`,
                error: 'File unavailable',
            };
        }
        // 2. Header-level validation
        try {
            const fd = fs_1.default.openSync(canonicalPath, 'r');
            const headerBuf = Buffer.alloc(16);
            fs_1.default.readSync(fd, headerBuf, 0, 16, 0);
            fs_1.default.closeSync(fd);
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
        }
        catch (err) {
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
                details: `Failed reading database header: ${err.message}`,
                error: 'Read error',
            };
        }
        // 3. SQLite Integrity & ERP Schema validation
        // Connect using read-only connection URI to guarantee zero mutation
        const normalizedUrl = canonicalPath.replace(/\\/g, '/');
        const readOnlyClient = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: `file:${normalizedUrl}`,
                },
            },
        });
        const isBackupPath = canonicalPath.toLowerCase().includes('backup') || canonicalPath.toLowerCase().endsWith('.bak');
        try {
            await readOnlyClient.$connect();
            // Run PRAGMA integrity_check
            const integrityResult = await readOnlyClient.$queryRawUnsafe('PRAGMA integrity_check;');
            const checkMessage = integrityResult?.[0]?.integrity_check || 'ok';
            if (checkMessage !== 'ok') {
                logging_1.logger.warn(`Integrity check failed on ${canonicalPath}: ${checkMessage}`);
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
            // Run PRAGMA foreign_key_check (Section 17)
            const fkResult = await readOnlyClient.$queryRawUnsafe('PRAGMA foreign_key_check;');
            if (fkResult && fkResult.length > 0) {
                logging_1.logger.warn(`Foreign key check failed on ${canonicalPath}: ${fkResult.length} violation(s)`);
                return {
                    status: 'CORRUPTED',
                    canonicalPath,
                    isValid: false,
                    tableCount: 0,
                    schemaVersion: 0,
                    integrityCheck: 'foreign_key_violations',
                    tablesFound: [],
                    missingRequiredTables: REQUIRED_ERP_TABLES,
                    detectedType: 'CORRUPTED',
                    details: `SQLite foreign_key_check detected ${fkResult.length} foreign key violation(s)`,
                    error: 'Foreign key integrity violation',
                };
            }
            // Query tables from sqlite_master
            const tablesMaster = await readOnlyClient.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%';");
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
            const missingRequiredColumns = {};
            let hasColumnDeficiencies = false;
            for (const table of REQUIRED_ERP_TABLES) {
                const tableColumns = await readOnlyClient.$queryRawUnsafe(`PRAGMA table_info("${table}");`);
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
            // Check schema version from Profile table if available, with PRAGMA user_version fallback
            let schemaVersion = 1;
            try {
                const profRecord = await readOnlyClient.$queryRawUnsafe('SELECT schemaVersion FROM "Profile" LIMIT 1;');
                if (profRecord?.[0]?.schemaVersion !== undefined && profRecord[0].schemaVersion !== null) {
                    schemaVersion = Number(profRecord[0].schemaVersion);
                }
                else {
                    const userVer = await readOnlyClient.$queryRawUnsafe('PRAGMA user_version;');
                    if (userVer?.[0]?.user_version) {
                        schemaVersion = Number(userVer[0].user_version);
                    }
                }
            }
            catch {
                try {
                    const userVer = await readOnlyClient.$queryRawUnsafe('PRAGMA user_version;');
                    if (userVer?.[0]?.user_version) {
                        schemaVersion = Number(userVer[0].user_version);
                    }
                }
                catch {
                    // Default to version 1
                }
            }
            // Centralized authoritative schema version compatibility check
            const compat = schema_compatibility_service_1.schemaCompatibilityService.check(schemaVersion);
            if (!compat.isCompatible) {
                return {
                    status: 'UNSUPPORTED',
                    canonicalPath,
                    isValid: false,
                    tableCount: tablesFound.length,
                    schemaVersion,
                    integrityCheck: 'ok',
                    tablesFound,
                    missingRequiredTables: [],
                    detectedType: 'UNSUPPORTED_VERSION',
                    details: compat.details,
                    error: compat.conflictReason === 'UNSUPPORTED_SCHEMA_VERSION_NEWER' ? 'Future schema version' : 'Unsupported schema version',
                };
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
        }
        catch (err) {
            const errMsg = err.message || '';
            const isCorrupted = errMsg.toLowerCase().includes('file is not a database') ||
                errMsg.toLowerCase().includes('malformed') ||
                errMsg.toLowerCase().includes('corrupt') ||
                errMsg.toLowerCase().includes('code: `26`') ||
                errMsg.toLowerCase().includes('code: `11`');
            const status = isCorrupted ? 'CORRUPTED' : 'INVALID';
            logging_1.logger.error(`Error during database validation of ${canonicalPath}: ${errMsg}`);
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
        }
        finally {
            await readOnlyClient.$disconnect().catch(() => { });
        }
    }
}
exports.DatabaseValidationService = DatabaseValidationService;
exports.databaseValidationService = new DatabaseValidationService();
//# sourceMappingURL=database-validation.service.js.map