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

    // Number comparison (handles Decimal, float, int string representations)
    if (typeof valA === 'number' || typeof valB === 'number' ||
        (!isNaN(Number(valA)) && !isNaN(Number(valB)) && typeof valA !== 'boolean' && typeof valB !== 'boolean')) {
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return Math.abs(numA - numB) < 0.0001;
      }
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

    // String comparison (trimmed, stripping formula escape quote)
    const strA = String(valA ?? '').trim().replace(/^'/, '');
    const strB = String(valB ?? '').trim().replace(/^'/, '');
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

      // Check field values for matching rows
      let fieldMismatches = 0;
      for (const [key, dbRow] of dbMap.entries()) {
        const csvRow = csvMap.get(key);
        const xlsxRow = xlsxMap.get(key);

        for (const [col, dbVal] of Object.entries(dbRow)) {
          if (SENSITIVE_COLUMN_PATTERN.test(col)) continue;
          if (col === 'createdAt' || col === 'updatedAt' || col === 'lastValidatedAt') continue;

          if (csvRow && col in csvRow) {
            if (!this.valuesMatch(dbVal, csvRow[col])) {
              fieldMismatches++;
              if (fieldMismatches <= 5) {
                errors.push(`CSV field mismatch on ${entity.entityName} [${key}].${col}: DB="${dbVal}" vs CSV="${csvRow[col]}"`);
              }
            }
          }

          if (xlsxRow && col in xlsxRow) {
            if (!this.valuesMatch(dbVal, xlsxRow[col])) {
              fieldMismatches++;
              if (fieldMismatches <= 5) {
                errors.push(`XLSX field mismatch on ${entity.entityName} [${key}].${col}: DB="${dbVal}" vs XLSX="${xlsxRow[col]}"`);
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
      duplicatePrimaryKeys: totalDuplicateKeys,
      missingRows: totalMissingRows,
      extraRows: totalExtraRows,
      fieldMismatches: totalFieldMismatches,
      entityResults,
      verifiedAt: new Date().toISOString(),
    };
  }
}

export const semanticVerificationService = new SemanticVerificationService();
