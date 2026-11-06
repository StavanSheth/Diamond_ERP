import { PrismaClient } from '@prisma/client';
export interface EntitySemanticResult {
    entityName: string;
    dbRowCount: number;
    csvRowCount: number;
    xlsxRowCount: number;
    duplicatePrimaryKeys: number;
    missingRows: number;
    extraRows: number;
    fieldMismatches: number;
    status: 'VERIFIED' | 'FAILED';
    errors: string[];
}
export interface SemanticVerificationResult {
    status: 'VERIFIED' | 'FAILED';
    databaseVsCsv: 'VERIFIED' | 'FAILED';
    databaseVsXlsx: 'VERIFIED' | 'FAILED';
    csvVsXlsx: 'VERIFIED' | 'FAILED';
    duplicatePrimaryKeys: number;
    missingRows: number;
    extraRows: number;
    fieldMismatches: number;
    entityResults: Record<string, EntitySemanticResult>;
    verifiedAt: string;
}
export declare class SemanticVerificationService {
    /**
     * Determine primary/business key attribute for an entity.
     */
    private getKeyField;
    /**
     * Compare two values with normalization for SQLite/CSV/Excel differences.
     */
    private valuesMatch;
    /**
     * Run full semantic verification comparing Live DB <-> CSV <-> XLSX
     */
    verifyDatabaseAgainstExports(client: PrismaClient, csvDir: string, xlsxPath: string, entityFilter?: string[]): Promise<SemanticVerificationResult>;
    /**
     * Compares two export snapshots (Section 9: Normal Export vs Uninstall Preservation Export).
     * Verifies that the underlying business records in both CSV and XLSX are identical row-for-row,
     * column-for-column, and value-for-value across normalized semantic records.
     */
    compareExportSnapshots(snapshotA: {
        csvDir?: string;
        xlsxPath?: string;
    }, snapshotB: {
        csvDir?: string;
        xlsxPath?: string;
    }, entityFilter?: string[]): Promise<{
        status: 'VERIFIED' | 'FAILED';
        csvVsCsv: 'VERIFIED' | 'FAILED';
        xlsxVsXlsx: 'VERIFIED' | 'FAILED';
        discrepancies: string[];
    }>;
    /**
     * Section 18: Exact CSV <-> XLSX verification.
     * Compares all exported CSV files against corresponding XLSX worksheets.
     * Fails on: missing row, extra row, different ID, different value, different date,
     * different number, different null, different column, duplicate row.
     */
    verifyCsvEqualsXlsx(csvDir: string, xlsxPath: string, entityFilter?: string[]): Promise<{
        status: 'VERIFIED' | 'FAILED';
        discrepancies: string[];
    }>;
    /**
     * Alias for backward compatibility with compareExports callers.
     */
    compareExports(csvDirA: string, xlsxPathA: string, csvDirB: string, xlsxPathB: string, entityFilter?: string[]): Promise<{
        status: "VERIFIED" | "FAILED";
        csvVsCsv: "VERIFIED" | "FAILED";
        xlsxVsXlsx: "VERIFIED" | "FAILED";
        discrepancies: string[];
    }>;
}
export declare const semanticVerificationService: SemanticVerificationService;
//# sourceMappingURL=semantic-verification.service.d.ts.map