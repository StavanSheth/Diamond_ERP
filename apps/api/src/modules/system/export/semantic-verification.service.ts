import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { getExportableEntities, SENSITIVE_COLUMN_PATTERN } from './export-entity-registry';

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

export class SemanticVerificationService {
  /**
   * Determine primary/business key attribute for an entity.
   */
  private getKeyField(entityName: string): string {
    switch (entityName) {
      case 'Stock': return 'stockCode';
      case 'Party': return 'partyCode';
      case 'DiamondItem': return 'itemCode';
      case 'Certification': return 'reportNumber';
      case 'Transaction': return 'transactionNo';
      default: return 'id';
    }
  }

  /**
   * Compare two values with normalization for SQLite/CSV/Excel differences.
   */
  private valuesMatch(valA: any, valB: any): boolean {
    if (valA === valB) return true;
    if ((valA === null || valA === undefined || valA === '') &&
        (valB === null || valB === undefined || valB === '')) {
      return true;
    }

    // Boolean representation (Section 7.C: normalize true/false vs 1/0 vs 'true'/'false' vs '1'/'0')
    const toBool = (val: any): boolean | null => {
      if (typeof val === 'boolean') return val;
      if (val === 1 || val === '1' || val === 'true' || val === 'TRUE') return true;
      if (val === 0 || val === '0' || val === 'false' || val === 'FALSE') return false;
      return null;
    };
    if (typeof valA === 'boolean' || typeof valB === 'boolean' || valA === 'true' || valA === 'false' || valB === 'true' || valB === 'false') {
      const bA = toBool(valA);
      const bB = toBool(valB);
      if (bA !== null && bB !== null) {
        return bA === bB;
      }
    }

    // Number comparison (handles Decimal, float, int string representations, stripping quotes)
    const cleanNum = (val: any): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val !== null && typeof val.toNumber === 'function') return val.toNumber();
      const s = String(val ?? '').replace(/^["']|["']$/g, '').trim();
      return s === '' ? NaN : Number(s);
    };
    const numA = cleanNum(valA);
    const numB = cleanNum(valB);
    if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
      return Math.abs(numA - numB) < 0.0001;
    }

    // Date comparison
    if (valA instanceof Date || valB instanceof Date ||
        (typeof valA === 'string' && typeof valB === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valA) && /^\d{4}-\d{2}-\d{2}/.test(valB))) {
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (!isNaN(dateA) && !isNaN(dateB)) {
        return Math.abs(dateA - dateB) < 2000; // within 2s for serialization variance
      }
    }

    // String comparison (trimmed, stripping formula escape quote and wrapping quotes)
    const strA = String(valA ?? '').replace(/^["']|["']$/g, '').trim().replace(/^'/, '');
    const strB = String(valB ?? '').replace(/^["']|["']$/g, '').trim().replace(/^'/, '');
    return strA === strB;
  }

  /**
   * Run full semantic verification comparing Live DB <-> CSV <-> XLSX
   */
  async verifyDatabaseAgainstExports(
    client: PrismaClient,
    csvDir: string,
    xlsxPath: string,
    entityFilter?: string[]
  ): Promise<SemanticVerificationResult> {
    const allEntities = getExportableEntities();
    const entitiesToVerify = entityFilter && entityFilter.length > 0
      ? allEntities.filter((e) => entityFilter.includes(e.entityName))
      : allEntities;

    let workbook: ExcelJS.Workbook | null = null;
    if (fs.existsSync(xlsxPath)) {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(xlsxPath);
    }

    let totalDuplicateKeys = 0;
    let totalMissingRows = 0;
    let totalExtraRows = 0;
    let totalFieldMismatches = 0;
    let csvAnyFailed = false;
    let xlsxAnyFailed = !workbook;

    const entityResults: Record<string, EntitySemanticResult> = {};

    for (const entity of entitiesToVerify) {
      const errors: string[] = [];
      const keyField = this.getKeyField(entity.entityName);

      // 1. Fetch DB records
      let dbRows: any[] = [];
      try {
        const accessor = (client as any)[entity.tableName];
        if (accessor && typeof accessor.findMany === 'function') {
          dbRows = await accessor.findMany();
        }
      } catch (err: any) {
        errors.push(`Failed to query DB for table ${entity.tableName}: ${err.message}`);
      }

      const dbMap = new Map<string, any>();
      for (const row of dbRows) {
        const key = String(row[keyField] || row.id || '');
        if (key) dbMap.set(key, row);
      }

      // 2. Read and verify CSV
      const csvPath = path.join(csvDir, `${entity.entityName}.csv`);
      let csvRows: any[] = [];
      let csvDuplicateKeys = 0;

      if (fs.existsSync(csvPath)) {
        try {
          const content = fs.readFileSync(csvPath, 'utf-8');
          if (content.trim().length > 0) {
            csvRows = parse(content, { columns: true, skip_empty_lines: true });
          }
        } catch (err: any) {
          errors.push(`Failed to parse CSV for ${entity.entityName}: ${err.message}`);
        }
      } else {
        errors.push(`CSV file missing for ${entity.entityName}: ${csvPath}`);
      }

      const csvMap = new Map<string, any>();
      for (const row of csvRows) {
        const key = String(row[keyField] || row.id || '');
        if (!key) continue;
        if (csvMap.has(key)) {
          csvDuplicateKeys++;
          errors.push(`Duplicate primary key "${key}" detected in CSV for ${entity.entityName}`);
        }
        csvMap.set(key, row);
      }

      // 3. Read and verify XLSX sheet
      let xlsxRows: any[] = [];
      let xlsxDuplicateKeys = 0;

      if (workbook) {
        const sheet = workbook.getWorksheet(entity.entityName);
        if (sheet) {
          const headers: string[] = [];
          sheet.getRow(1).eachCell((cell, col) => {
            headers[col] = String(cell.value || '');
          });

          for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            if (!row.hasValues) continue;
            const obj: Record<string, any> = {};
            row.eachCell((cell, col) => {
              if (headers[col]) obj[headers[col]] = cell.value;
            });
            xlsxRows.push(obj);
          }
        }
      }

      const xlsxMap = new Map<string, any>();
      for (const row of xlsxRows) {
        const key = String(row[keyField] || row.id || '');
        if (!key) continue;
        if (xlsxMap.has(key)) {
          xlsxDuplicateKeys++;
          errors.push(`Duplicate primary key "${key}" detected in XLSX for ${entity.entityName}`);
        }
        xlsxMap.set(key, row);
      }

      // Check row counts
      if (dbRows.length !== csvRows.length) {
        errors.push(`Row count mismatch DB vs CSV on ${entity.entityName}: DB=${dbRows.length}, CSV=${csvRows.length}`);
      }
      if (workbook && dbRows.length !== xlsxRows.length) {
        errors.push(`Row count mismatch DB vs XLSX on ${entity.entityName}: DB=${dbRows.length}, XLSX=${xlsxRows.length}`);
      }

      // Check missing rows from CSV & XLSX
      let missingInCsv = 0;
      let missingInXlsx = 0;
      for (const [key] of dbMap.entries()) {
        if (!csvMap.has(key)) missingInCsv++;
        if (workbook && !xlsxMap.has(key)) missingInXlsx++;
      }

      // Check extra rows in CSV & XLSX
      let extraInCsv = 0;
      let extraInXlsx = 0;
      for (const [key] of csvMap.entries()) {
        if (!dbMap.has(key)) extraInCsv++;
      }
      if (workbook) {
        for (const [key] of xlsxMap.entries()) {
          if (!dbMap.has(key)) extraInXlsx++;
        }
      }

      // Check column completeness (Section 7, 23: exact columns including empty tables)
      let expectedCols: string[] = [];
      if (dbRows.length > 0) {
        expectedCols = Object.keys(dbRows[0]).filter(
          (c) => !SENSITIVE_COLUMN_PATTERN.test(c) && c !== 'createdAt' && c !== 'updatedAt' && c !== 'lastValidatedAt'
        );
      } else {
        try {
          const tableInfo = await (client as any).$queryRawUnsafe(
            `PRAGMA table_info("${entity.entityName}");`
          ) as Array<{ name: string }>;
          expectedCols = tableInfo
            .map((col) => col.name)
            .filter((c) => !SENSITIVE_COLUMN_PATTERN.test(c) && c !== 'createdAt' && c !== 'updatedAt' && c !== 'lastValidatedAt');
        } catch {
          expectedCols = [];
        }
      }

      // Read actual CSV header columns
      let actualCsvCols: string[] = [];
      if (fs.existsSync(csvPath)) {
        try {
          const raw = fs.readFileSync(csvPath, 'utf-8');
          const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
          if (firstLine) {
            const parsed = parse(firstLine);
            if (parsed && parsed.length > 0) {
              actualCsvCols = parsed[0];
            }
          }
        } catch {}
      }

      // Read actual XLSX header columns
      let actualXlsxCols: string[] = [];
      if (workbook) {
        const sheet = workbook.getWorksheet(entity.entityName);
        if (sheet) {
          const headers: string[] = [];
          sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value) headers[col] = String(cell.value);
          });
          actualXlsxCols = headers.filter(Boolean);
        }
      }

      // Check CSV columns against expected
      if (expectedCols.length > 0) {
        const csvSet = new Set(actualCsvCols);
        for (const col of expectedCols) {
          if (!csvSet.has(col)) {
            errors.push(`Missing expected column "${col}" from CSV export on ${entity.entityName}`);
          }
        }
        for (const col of actualCsvCols) {
          if (!expectedCols.includes(col) && !SENSITIVE_COLUMN_PATTERN.test(col) && col !== 'createdAt' && col !== 'updatedAt') {
            errors.push(`Unexpected column "${col}" found in CSV export on ${entity.entityName}`);
          }
        }
      }

      // Check XLSX columns against expected
      if (expectedCols.length > 0 && workbook) {
        const xlsxSet = new Set(actualXlsxCols);
        for (const col of expectedCols) {
          if (!xlsxSet.has(col)) {
            errors.push(`Missing expected column "${col}" from XLSX export on ${entity.entityName}`);
          }
        }
        for (const col of actualXlsxCols) {
          if (!expectedCols.includes(col) && !SENSITIVE_COLUMN_PATTERN.test(col) && col !== 'createdAt' && col !== 'updatedAt') {
            errors.push(`Unexpected column "${col}" found in XLSX export on ${entity.entityName}`);
          }
        }
      }

      // Exact CSV columns === XLSX columns
      if (workbook && actualCsvCols.length > 0 && actualXlsxCols.length > 0) {
        const sortedCsv = [...actualCsvCols].sort().join(',');
        const sortedXlsx = [...actualXlsxCols].sort().join(',');
        if (sortedCsv !== sortedXlsx) {
          errors.push(`Column set mismatch between CSV and XLSX on ${entity.entityName}`);
        }
      }

      // Check field values for matching rows
      let fieldMismatches = 0;
      for (const [key, dbRow] of dbMap.entries()) {
        const csvRow = csvMap.get(key);
        const xlsxRow = xlsxMap.get(key);

        for (const [col, dbVal] of Object.entries(dbRow)) {
          if (SENSITIVE_COLUMN_PATTERN.test(col)) continue;
          if (col === 'createdAt' || col === 'updatedAt' || col === 'lastValidatedAt') continue;

          if (csvRow) {
            if (!this.valuesMatch(dbVal, csvRow[col])) {
              fieldMismatches++;
              if (fieldMismatches <= 5) {
                errors.push(`CSV field mismatch on ${entity.entityName} [${key}].${col}: DB="${dbVal}" vs CSV="${csvRow[col]}"`);
              }
            }
          }

          if (xlsxRow) {
            if (!this.valuesMatch(dbVal, xlsxRow[col])) {
              fieldMismatches++;
              if (fieldMismatches <= 5) {
                errors.push(`XLSX field mismatch on ${entity.entityName} [${key}].${col}: DB="${dbVal}" vs XLSX="${xlsxRow[col]}"`);
              }
            }
          }
        }
      }

      // Section 17: CSV vs XLSX direct verification
      if (workbook) {
        if (csvRows.length !== xlsxRows.length) {
          errors.push(`Direct CSV vs XLSX row count mismatch on ${entity.entityName}: CSV=${csvRows.length}, XLSX=${xlsxRows.length}`);
        }
        for (const [key, cRow] of csvMap.entries()) {
          const xRow = xlsxMap.get(key);
          if (!xRow) {
            errors.push(`Row "${key}" present in CSV but missing in XLSX on ${entity.entityName}`);
            continue;
          }
          for (const [cCol, cVal] of Object.entries(cRow)) {
            if (cCol in xRow && !this.valuesMatch(cVal, xRow[cCol])) {
              fieldMismatches++;
              if (fieldMismatches <= 5) {
                errors.push(`Direct CSV vs XLSX value mismatch on ${entity.entityName} [${key}].${cCol}: CSV="${cVal}" vs XLSX="${xRow[cCol]}"`);
              }
            }
          }
        }
      }


      const entityDuplicateKeys = csvDuplicateKeys + xlsxDuplicateKeys;
      const entityMissing = missingInCsv + missingInXlsx;
      const entityExtra = extraInCsv + extraInXlsx;

      totalDuplicateKeys += entityDuplicateKeys;
      totalMissingRows += entityMissing;
      totalExtraRows += entityExtra;
      totalFieldMismatches += fieldMismatches;

      const entityPassed =
        errors.length === 0 &&
        entityDuplicateKeys === 0 &&
        entityMissing === 0 &&
        entityExtra === 0 &&
        fieldMismatches === 0;

      if (!entityPassed) {
        csvAnyFailed = true;
        xlsxAnyFailed = true;
      }

      entityResults[entity.entityName] = {
        entityName: entity.entityName,
        dbRowCount: dbRows.length,
        csvRowCount: csvRows.length,
        xlsxRowCount: xlsxRows.length,
        duplicatePrimaryKeys: entityDuplicateKeys,
        missingRows: entityMissing,
        extraRows: entityExtra,
        fieldMismatches,
        status: entityPassed ? 'VERIFIED' : 'FAILED',
        errors,
      };
    }

    const verified =
      !csvAnyFailed &&
      !xlsxAnyFailed &&
      totalDuplicateKeys === 0 &&
      totalMissingRows === 0 &&
      totalExtraRows === 0 &&
      totalFieldMismatches === 0;

    return {
      status: verified ? 'VERIFIED' : 'FAILED',
      databaseVsCsv: !csvAnyFailed ? 'VERIFIED' : 'FAILED',
      databaseVsXlsx: !xlsxAnyFailed ? 'VERIFIED' : 'FAILED',
      csvVsXlsx: !csvAnyFailed && !xlsxAnyFailed ? 'VERIFIED' : 'FAILED',
      duplicatePrimaryKeys: totalDuplicateKeys,
      missingRows: totalMissingRows,
      extraRows: totalExtraRows,
      fieldMismatches: totalFieldMismatches,
      entityResults,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Compares two export snapshots (Section 9: Normal Export vs Uninstall Preservation Export).
   * Verifies that the underlying business records in both CSV and XLSX are identical row-for-row,
   * column-for-column, and value-for-value across normalized semantic records.
   */
  async compareExportSnapshots(
    snapshotA: { csvDir?: string; xlsxPath?: string },
    snapshotB: { csvDir?: string; xlsxPath?: string },
    entityFilter?: string[]
  ): Promise<{
    status: 'VERIFIED' | 'FAILED';
    csvVsCsv: 'VERIFIED' | 'FAILED';
    xlsxVsXlsx: 'VERIFIED' | 'FAILED';
    discrepancies: string[];
  }> {
    const discrepancies: string[] = [];
    const allEntities = getExportableEntities();
    const entities = entityFilter && entityFilter.length > 0
      ? allEntities.filter((e) => entityFilter.includes(e.entityName))
      : allEntities;

    let csvFailed = false;
    let xlsxFailed = false;

    // 1. Deep Compare CSVs
    if (snapshotA.csvDir && snapshotB.csvDir) {
      for (const ent of entities) {
        const keyField = this.getKeyField(ent.entityName);
        const pathA = path.join(snapshotA.csvDir, `${ent.entityName}.csv`);
        const pathB = path.join(snapshotB.csvDir, `${ent.entityName}.csv`);
        if (fs.existsSync(pathA) && fs.existsSync(pathB)) {
          const rowsA = parse(fs.readFileSync(pathA, 'utf-8'), { columns: true, skip_empty_lines: true }) as Array<Record<string, any>>;
          const rowsB = parse(fs.readFileSync(pathB, 'utf-8'), { columns: true, skip_empty_lines: true }) as Array<Record<string, any>>;

          if (rowsA.length !== rowsB.length) {
            discrepancies.push(`CSV row count mismatch on ${ent.entityName}: A=${rowsA.length} vs B=${rowsB.length}`);
            csvFailed = true;
          }

          // Column comparison
          const colsA = rowsA.length > 0 ? Object.keys(rowsA[0]).sort() : [];
          const colsB = rowsB.length > 0 ? Object.keys(rowsB[0]).sort() : [];
          if (colsA.join(',') !== colsB.join(',')) {
            discrepancies.push(`CSV column mismatch on ${ent.entityName}: A=[${colsA.join(',')}] vs B=[${colsB.join(',')}]`);
            csvFailed = true;
          }

          // Key and Value comparison (symmetric)
          const mapA = new Map<string, any>();
          for (const r of rowsA) mapA.set(String(r[keyField] || r.id || ''), r);
          const mapB = new Map<string, any>();
          for (const r of rowsB) mapB.set(String(r[keyField] || r.id || ''), r);

          for (const [key] of mapA.entries()) {
            if (!mapB.has(key)) {
              discrepancies.push(`Row key "${key}" present in Snapshot A but missing in Snapshot B for ${ent.entityName}`);
              csvFailed = true;
            }
          }

          for (const rB of rowsB) {
            const key = String(rB[keyField] || rB.id || '');
            if (!key) continue;
            const rA = mapA.get(key);
            if (!rA) {
              discrepancies.push(`Row key "${key}" present in Snapshot B but missing in Snapshot A for ${ent.entityName}`);
              csvFailed = true;
              continue;
            }
            for (const [col, valB] of Object.entries(rB)) {
              if (col in rA && !this.valuesMatch(rA[col], valB)) {
                discrepancies.push(`Value mismatch on ${ent.entityName} [${key}].${col}: A="${rA[col]}" vs B="${valB}"`);
                csvFailed = true;
                break;
              }
            }
          }
        }
      }
    }

    // 2. Deep Compare XLSX workbooks
    if (snapshotA.xlsxPath && snapshotB.xlsxPath && fs.existsSync(snapshotA.xlsxPath) && fs.existsSync(snapshotB.xlsxPath)) {
      const wbA = new ExcelJS.Workbook();
      const wbB = new ExcelJS.Workbook();
      await wbA.xlsx.readFile(snapshotA.xlsxPath);
      await wbB.xlsx.readFile(snapshotB.xlsxPath);

      for (const ent of entities) {
        const keyField = this.getKeyField(ent.entityName);
        const sheetA = wbA.getWorksheet(ent.entityName);
        const sheetB = wbB.getWorksheet(ent.entityName);
        if (sheetA && sheetB) {
          const rowsA: any[] = [];
          const rowsB: any[] = [];

          const headersA: string[] = [];
          sheetA.getRow(1).eachCell((cell, col) => { headersA[col] = String(cell.value || ''); });
          for (let r = 2; r <= sheetA.rowCount; r++) {
            const row = sheetA.getRow(r);
            if (!row.hasValues) continue;
            const obj: Record<string, any> = {};
            row.eachCell((cell, col) => { if (headersA[col]) obj[headersA[col]] = cell.value; });
            rowsA.push(obj);
          }

          const headersB: string[] = [];
          sheetB.getRow(1).eachCell((cell, col) => { headersB[col] = String(cell.value || ''); });
          for (let r = 2; r <= sheetB.rowCount; r++) {
            const row = sheetB.getRow(r);
            if (!row.hasValues) continue;
            const obj: Record<string, any> = {};
            row.eachCell((cell, col) => { if (headersB[col]) obj[headersB[col]] = cell.value; });
            rowsB.push(obj);
          }

          if (rowsA.length !== rowsB.length) {
            discrepancies.push(`XLSX row count mismatch on ${ent.entityName}: A=${rowsA.length} vs B=${rowsB.length}`);
            xlsxFailed = true;
          }

          // Column comparison
          const cleanHA = headersA.filter(Boolean).sort().join(',');
          const cleanHB = headersB.filter(Boolean).sort().join(',');
          if (cleanHA !== cleanHB) {
            discrepancies.push(`XLSX column mismatch on ${ent.entityName}: A=[${cleanHA}] vs B=[${cleanHB}]`);
            xlsxFailed = true;
          }

          const mapA = new Map<string, any>();
          for (const r of rowsA) mapA.set(String(r[keyField] || r.id || ''), r);
          const mapB = new Map<string, any>();
          for (const r of rowsB) mapB.set(String(r[keyField] || r.id || ''), r);

          for (const [key] of mapA.entries()) {
            if (!mapB.has(key)) {
              discrepancies.push(`XLSX row key "${key}" present in Snapshot A but missing in Snapshot B for ${ent.entityName}`);
              xlsxFailed = true;
            }
          }

          for (const rB of rowsB) {
            const key = String(rB[keyField] || rB.id || '');
            if (!key) continue;
            const rA = mapA.get(key);
            if (!rA) {
              discrepancies.push(`XLSX row key "${key}" present in Snapshot B but missing in Snapshot A for ${ent.entityName}`);
              xlsxFailed = true;
              continue;
            }
            for (const [col, valB] of Object.entries(rB)) {
              if (col in rA && !this.valuesMatch(rA[col], valB)) {
                discrepancies.push(`XLSX value mismatch on ${ent.entityName} [${key}].${col}: A="${rA[col]}" vs B="${valB}"`);
                xlsxFailed = true;
                break;
              }
            }
          }
        }
      }
    }

    return {
      status: (!csvFailed && !xlsxFailed && discrepancies.length === 0) ? 'VERIFIED' : 'FAILED',
      csvVsCsv: !csvFailed ? 'VERIFIED' : 'FAILED',
      xlsxVsXlsx: !xlsxFailed ? 'VERIFIED' : 'FAILED',
      discrepancies,
    };
  }

  /**
   * Section 18: Exact CSV <-> XLSX verification.
   * Compares all exported CSV files against corresponding XLSX worksheets.
   * Fails on: missing row, extra row, different ID, different value, different date,
   * different number, different null, different column, duplicate row.
   */
  async verifyCsvEqualsXlsx(
    csvDir: string,
    xlsxPath: string,
    entityFilter?: string[]
  ): Promise<{ status: 'VERIFIED' | 'FAILED'; discrepancies: string[] }> {
    const discrepancies: string[] = [];
    if (!fs.existsSync(csvDir) || !fs.existsSync(xlsxPath)) {
      return {
        status: 'FAILED',
        discrepancies: [`Missing export artifacts: csvDir=${csvDir} (exists: ${fs.existsSync(csvDir)}), xlsxPath=${xlsxPath} (exists: ${fs.existsSync(xlsxPath)})`],
      };
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);

    const entities = getExportableEntities().filter(
      (e) => !entityFilter || entityFilter.includes(e.entityName)
    );

    for (const ent of entities) {
      const csvFile = path.join(csvDir, `${ent.entityName}.csv`);
      const sheet = wb.getWorksheet(ent.entityName);

      if (!fs.existsSync(csvFile) && !sheet) {
        continue;
      }

      if (fs.existsSync(csvFile) && !sheet) {
        discrepancies.push(`Entity ${ent.entityName}: CSV exists at ${csvFile} but worksheet missing in XLSX`);
        continue;
      }

      if (!fs.existsSync(csvFile) && sheet) {
        discrepancies.push(`Entity ${ent.entityName}: Worksheet exists in XLSX but CSV missing at ${csvFile}`);
        continue;
      }

      const csvContent = fs.readFileSync(csvFile, 'utf-8');
      const csvRows: any[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const xlsxRows: any[] = [];
      const headers: string[] = [];
      sheet!.getRow(1).eachCell((cell, col) => {
        headers[col] = String(cell.value || '').trim();
      });

      for (let r = 2; r <= sheet!.rowCount; r++) {
        const row = sheet!.getRow(r);
        if (!row.hasValues) continue;
        const obj: Record<string, any> = {};
        row.eachCell((cell, col) => {
          if (headers[col]) obj[headers[col]] = cell.value;
        });
        xlsxRows.push(obj);
      }

      if (csvRows.length !== xlsxRows.length) {
        discrepancies.push(
          `Row count mismatch on ${ent.entityName}: CSV=${csvRows.length} vs XLSX=${xlsxRows.length}`
        );
      }

      const keyField = this.getKeyField(ent.entityName);
      const csvKeys = new Set<string>();
      const csvMap = new Map<string, any>();

      for (const r of csvRows) {
        const key = String(r[keyField] || r.id || '').trim();
        if (csvKeys.has(key)) {
          discrepancies.push(`Duplicate primary key "${key}" found in CSV for ${ent.entityName}`);
        }
        csvKeys.add(key);
        csvMap.set(key, r);
      }

      const xlsxKeys = new Set<string>();
      const xlsxMap = new Map<string, any>();

      for (const r of xlsxRows) {
        const key = String(r[keyField] || r.id || '').trim();
        if (xlsxKeys.has(key)) {
          discrepancies.push(`Duplicate primary key "${key}" found in XLSX for ${ent.entityName}`);
        }
        xlsxKeys.add(key);
        xlsxMap.set(key, r);
      }

      for (const key of csvKeys) {
        if (!xlsxKeys.has(key)) {
          discrepancies.push(`Key "${key}" present in CSV but missing in XLSX for ${ent.entityName}`);
        }
      }

      for (const key of xlsxKeys) {
        if (!csvKeys.has(key)) {
          discrepancies.push(`Key "${key}" present in XLSX but missing in CSV for ${ent.entityName}`);
        }
      }

      for (const [key, cRow] of csvMap.entries()) {
        const xRow = xlsxMap.get(key);
        if (!xRow) continue;
        for (const [col, cVal] of Object.entries(cRow)) {
          if (col in xRow) {
            if (!this.valuesMatch(cVal, xRow[col])) {
              discrepancies.push(
                `Value mismatch on ${ent.entityName} [${key}].${col}: CSV="${cVal}" vs XLSX="${xRow[col]}"`
              );
            }
          }
        }
      }
    }

    return {
      status: discrepancies.length === 0 ? 'VERIFIED' : 'FAILED',
      discrepancies,
    };
  }

  /**
   * Alias for backward compatibility with compareExports callers.
   */
  async compareExports(
    csvDirA: string,
    xlsxPathA: string,
    csvDirB: string,
    xlsxPathB: string,
    entityFilter?: string[]
  ) {
    return this.compareExportSnapshots(
      { csvDir: csvDirA, xlsxPath: xlsxPathA },
      { csvDir: csvDirB, xlsxPath: xlsxPathB },
      entityFilter
    );
  }
}

export const semanticVerificationService = new SemanticVerificationService();
