import { v4 as uuidv4 } from 'uuid';
import { GoogleSpreadsheetRow } from 'google-spreadsheet';

import { IDataProvider, ProviderHealth } from '../../interfaces/data-provider';
import { StockItem, SHEET_HEADER_DISPLAY } from '../../models/stock-item';
import { CreateStockDTO } from '../../dto/create-stock.dto';
import { UpdateStockDTO } from '../../dto/update-stock.dto';
import { initializeGoogleClient, getSheet, getDoc } from './client';
import { withRetry } from './retry';
import { calculateTotalValue } from '../../utils/calculations';
import { logger } from '../../logger';

/**
 * Custom error for optimistic locking conflicts (HTTP 409).
 */
export class ConflictError extends Error {
  public readonly statusCode = 409;
  public readonly currentVersion: number;
  public readonly clientVersion: number;

  constructor(rowId: string, clientVersion: number, currentVersion: number) {
    super(
      `Conflict: Row "${rowId}" has been modified. ` +
        `Client version: ${clientVersion}, current version: ${currentVersion}. ` +
        `Refresh and try again.`,
    );
    this.name = 'ConflictError';
    this.currentVersion = currentVersion;
    this.clientVersion = clientVersion;
  }
}

/**
 * Custom error for rows not found (HTTP 404).
 */
export class RowNotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(rowId: string) {
    super(`Stock item with ID "${rowId}" not found.`);
    this.name = 'RowNotFoundError';
  }
}

/**
 * Type alias for the row data shape used with google-spreadsheet's generic API.
 */
interface SheetRowData {
  ID: string;
  Stock_Name: string;
  Report_Group: string;
  Location: string;
  Status: string;
  Item_Count: string;
  Current_Carat: string;
  Current_Value: string;
  Average_Rate: string;
  Transaction_Count: string;
  Remarks: string;
  UUID: string;
  Version: string;
  Created_At: string;
  Created_By: string;
  Updated_At: string;
  Updated_By: string;
  Is_Deleted: string;
  Deleted_At: string;
  Deleted_By: string;
}

/**
 * GoogleSheetProvider — implements IDataProvider using the google-spreadsheet library.
 *
 * Uses the Stock_Master worksheet to store diamond stock data.
 */
export class GoogleSheetProvider implements IDataProvider {
  private lastSyncTime: string | null = null;

  /**
   * Initialize the Google Sheets connection and ensure headers exist.
   */
  async initialize(): Promise<void> {
    await initializeGoogleClient();
    await this.ensureHeaders();
    logger.info('GoogleSheetProvider initialized successfully.');
  }

  /**
   * Ensure the header row exists with the correct column names.
   */
  private async ensureHeaders(): Promise<void> {
    const sheet = getSheet();

    try {
      await sheet.loadHeaderRow();
      const headers = sheet.headerValues;

      const expectedHeaders = SHEET_HEADER_DISPLAY;
      const headersMatch = expectedHeaders.every((h, i) => headers[i] === h);

    if (!headersMatch) {
        logger.warn(
          `Header mismatch. Expected: [${expectedHeaders.join(', ')}], ` +
            `Got: [${headers.join(', ')}]. Setting correct headers.`,
        );
        await sheet.setHeaderRow(expectedHeaders);
      }
    } catch {
      // Headers don't exist yet — set them up
      logger.info('No header row found. Creating headers...');
      await sheet.setHeaderRow(SHEET_HEADER_DISPLAY);
    }

    logger.info(`Headers verified: [${SHEET_HEADER_DISPLAY.join(', ')}]`);

    // Define and verify auxiliary sheets
    const doc = getDoc();
    const auxiliarySheets = [
      {
        title: 'Party_Master',
        headers: ['ID', 'Party_Name', 'Type', 'Outstanding_Balance', 'Last_Tx_Date', 'Remarks', 'Status', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'Repair_Master',
        headers: ['ID', 'Stock_Item_ID', 'Status', 'Repair_Type', 'Vendor', 'Est_Cost', 'Final_Cost', 'Due_Date', 'Completed_On', 'Restores_To', 'Remarks', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'Stock_Item_Master',
        headers: ['ID', 'Stock_ID', 'Type', 'Shape', 'Cut', 'Clarity', 'Color_Grade', 'Fluorescence', 'No_Of_Pieces', 'Current_Carat', 'Current_Value', 'Average_Rate', 'Status', 'Certificate_Status', 'Status_Before_Repair', 'Repair_Flag', 'Brokerage_Rate', 'Remarks', 'UUID', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'Transaction_Master',
        headers: ['ID', 'Stock_ID', 'Stock_Item_ID', 'Transaction_Type', 'Transaction_Date', 'Party_ID', 'Broker_ID', 'Carat', 'Rate', 'Value', 'Payment_Type', 'Original_Transaction_Reference', 'Remarks', 'UUID', 'Status', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'Stock_Ledger',
        headers: ['ID', 'Transaction_ID', 'Stock_ID', 'Stock_Item_ID', 'Transaction_Date', 'Transaction_Type', 'Party_ID', 'Broker_ID', 'Carat_In', 'Carat_Out', 'Value_In', 'Value_Out', 'Item_Balance_Carat', 'Item_Balance_Value', 'Stock_Balance_Carat', 'Stock_Balance_Value', 'Remarks', 'UUID', 'Status', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'Certificate_Master',
        headers: ['ID', 'Stock_Item_ID', 'Lab_Type', 'Certificate_Status', 'Report_Number', 'Cost', 'Measurements', 'Polish', 'Symmetry', 'Fluorescence', 'Proportion_Diagram_Path', 'Inclusion_Plot_Path', 'Laser_Inscription', 'Natural_Or_Lab_Grown', 'PDF_Path', 'UUID', 'Status', 'Remarks', 'Version', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By', 'Is_Deleted', 'Deleted_At', 'Deleted_By']
      },
      {
        title: 'System_Settings',
        headers: ['Setting_Key', 'Setting_Value', 'Updated_At']
      }
    ];

    for (const aux of auxiliarySheets) {
      let auxSheet = doc.sheetsByTitle[aux.title];
      if (!auxSheet) {
        logger.info(`Worksheet "${aux.title}" not found. Creating...`);
        auxSheet = await doc.addSheet({
          title: aux.title,
          headerValues: aux.headers
        });
        logger.info(`Created worksheet: "${aux.title}"`);
      } else {
        try {
          await auxSheet.loadHeaderRow();
          const existingHeaders = auxSheet.headerValues;
          const match = aux.headers.every((h, i) => existingHeaders[i] === h);
          if (!match) {
            if (auxSheet.columnCount < aux.headers.length) {
              await auxSheet.resize({ rowCount: auxSheet.rowCount, columnCount: aux.headers.length });
            }
            await auxSheet.setHeaderRow(aux.headers);
          }
        } catch {
          if (auxSheet.columnCount < aux.headers.length) {
            await auxSheet.resize({ rowCount: auxSheet.rowCount, columnCount: aux.headers.length });
          }
          await auxSheet.setHeaderRow(aux.headers);
        }
      }
    }
  }

  /**
   * Retrieve all stock items from the Google Sheet.
   */
  async getAllRows(requestId: string): Promise<StockItem[]> {
    logger.info('GET stocks | Google Sync Started', requestId);

    const sheet = getSheet();
    const rows = await withRetry(
      () => sheet.getRows<SheetRowData>(),
      requestId,
      'getAllRows',
    );

    const mapped = rows.map((row) => this.mapRowToStockItem(row));
    this.lastSyncTime = new Date().toISOString();

    logger.info(`GET stocks | Google Sync Finished | ${mapped.length} items returned`, requestId);
    return mapped;
  }

  /**
   * Add a new stock item to the Google Sheet.
   * Generates ID, computes TotalValue, sets Version=1, Status=ACTIVE.
   * Returns ALL rows after the write.
   */
  async addRow(data: CreateStockDTO, requestId: string): Promise<StockItem[]> {
    logger.info(`POST stock | Name=${data.stockName}`, requestId);

    const doc = getDoc();
    const masterSheet = getSheet(); // Stock_Master
    const itemMasterSheet = doc.sheetsByTitle['Stock_Item_Master'];
    const txnMasterSheet = doc.sheetsByTitle['Transaction_Master'];
    const ledgerSheet = doc.sheetsByTitle['Stock_Ledger'];

    if (!itemMasterSheet || !txnMasterSheet || !ledgerSheet) {
      throw new Error('Required sheets for creating a stock parcel are missing.');
    }

    const stockId = `STK-${Date.now().toString().slice(-6)}`;
    const itemId = `ITM-${Date.now().toString().slice(-6)}`;
    const txnId = `TXN-${Date.now().toString().slice(-6)}`;
    const ledgerId = `LED-${Date.now().toString().slice(-6)}`;
    
    const now = new Date().toISOString();
    const totalValue = calculateTotalValue(data.caratWeight, data.caratRate);

    // 1. Insert to Stock_Master
    await withRetry(
      () =>
        masterSheet.addRow({
          ID: stockId,
          Stock_Name: data.stockName,
          Report_Group: data.reportGroup || '',
          Location: data.location || 'Mumbai - Main Office',
          Status: 'ACTIVE',
          Item_Count: String(data.itemCount || 1),
          Current_Carat: String(data.caratWeight || 0),
          Current_Value: String(totalValue),
          Average_Rate: String(data.caratRate || 0),
          Transaction_Count: '1',
          Remarks: data.remarks || '',
          UUID: uuidv4(),
          Version: '1',
          Created_At: now,
          Created_By: 'system',
          Updated_At: now,
          Updated_By: 'system',
          Is_Deleted: 'FALSE',
          Deleted_At: '',
          Deleted_By: '',
        }),
      requestId,
      'addRow:master'
    );

    // 2. Insert to Stock_Item_Master
    await withRetry(
      () =>
        itemMasterSheet.addRow({
          ID: itemId,
          Stock_ID: stockId,
          Type: data.itemType || 'Rough',
          Shape: data.shape || '',
          Cut: data.cut || '',
          Clarity: data.clarity || '',
          Color_Grade: data.color || '',
          Fluorescence: '',
          No_Of_Pieces: String(data.itemCount || 1),
          Current_Carat: String(data.caratWeight || 0),
          Current_Value: String(totalValue),
          Average_Rate: String(data.caratRate || 0),
          Status: 'ACTIVE',
          Certificate_Status: 'Pending',
          Status_Before_Repair: '',
          Repair_Flag: 'FALSE',
          Brokerage_Rate: '0',
          Remarks: data.remarks || '',
          UUID: uuidv4(),
          Version: '1',
          Created_At: now,
          Created_By: 'system',
          Updated_At: now,
          Updated_By: 'system',
          Is_Deleted: 'FALSE',
          Deleted_At: '',
          Deleted_By: '',
        }),
      requestId,
      'addRow:item'
    );

    // 3. Insert to Transaction_Master (Opening Balance)
    await withRetry(
      () =>
        txnMasterSheet.addRow({
          ID: txnId,
          Stock_ID: stockId,
          Stock_Item_ID: itemId,
          Transaction_Type: 'Opening Balance',
          Transaction_Date: now,
          Party_ID: 'system',
          Broker_ID: '',
          Carat: String(data.caratWeight || 0),
          Rate: String(data.caratRate || 0),
          Value: String(totalValue),
          Payment_Type: 'N/A',
          Original_Transaction_Reference: '',
          Remarks: 'Initial Opening Balance',
          UUID: uuidv4(),
          Status: 'ACTIVE',
          Version: '1',
          Created_At: now,
          Created_By: 'system',
          Updated_At: now,
          Updated_By: 'system',
          Is_Deleted: 'FALSE',
          Deleted_At: '',
          Deleted_By: '',
        }),
      requestId,
      'addRow:txn'
    );

    // 4. Insert to Stock_Ledger (Opening Balance)
    await withRetry(
      () =>
        ledgerSheet.addRow({
          ID: ledgerId,
          Transaction_ID: txnId,
          Stock_ID: stockId,
          Stock_Item_ID: itemId,
          Transaction_Date: now,
          Transaction_Type: 'Opening Balance',
          Party_ID: 'system',
          Broker_ID: '',
          Carat_In: String(data.caratWeight || 0),
          Carat_Out: '0',
          Value_In: String(totalValue),
          Value_Out: '0',
          Item_Balance_Carat: String(data.caratWeight || 0),
          Item_Balance_Value: String(totalValue),
          Stock_Balance_Carat: String(data.caratWeight || 0),
          Stock_Balance_Value: String(totalValue),
          Remarks: 'Initial Opening Balance',
          UUID: uuidv4(),
          Status: 'ACTIVE',
          Version: '1',
          Created_At: now,
          Created_By: 'system',
          Updated_At: now,
          Updated_By: 'system',
          Is_Deleted: 'FALSE',
          Deleted_At: '',
          Deleted_By: '',
        }),
      requestId,
      'addRow:ledger'
    );
    logger.info(`POST stock | Created ID=${stockId} | TotalValue=${totalValue}`, requestId);

    // Re-read all rows after write — never assume success
    return this.getAllRows(requestId);
  }

  /**
   * Update an existing stock item by ID.
   * Enforces optimistic locking via version check.
   * Returns ALL rows after the write.
   */
  async updateRow(id: string, data: UpdateStockDTO, requestId: string): Promise<StockItem[]> {
    logger.info(`PUT stock | ID=${id}, Name=${data.stockName}, ClientVersion=${data.version}`, requestId);

    const sheet = getSheet();

    const rows = await withRetry(
      () => sheet.getRows<SheetRowData>(),
      requestId,
      'updateRow:getRows',
    );

    const targetRow = rows.find((row) => row.get('ID') === id && row.get('Is_Deleted') !== 'TRUE');

    if (!targetRow) {
      throw new RowNotFoundError(id);
    }

    // Optimistic locking check
    const currentVersion = Number(targetRow.get('Version')) || 1;
    if (currentVersion !== data.version) {
      throw new ConflictError(id, data.version, currentVersion);
    }

    // Recalculate computed fields — never trust frontend calculations
    const totalValue = calculateTotalValue(data.caratWeight, data.caratRate);
    const now = new Date().toISOString();
    const newVersion = currentVersion + 1;

    targetRow.set('Stock_Name', data.stockName);
    targetRow.set('Report_Group', data.reportGroup || '');
    targetRow.set('Location', data.location || '');
    targetRow.set('Status', data.status || 'ACTIVE');
    targetRow.set('Item_Count', String(data.itemCount || 1));
    targetRow.set('Current_Carat', String(data.caratWeight || 0));
    targetRow.set('Current_Value', String(totalValue));
    targetRow.set('Average_Rate', String(data.caratRate || 0));
    targetRow.set('Remarks', data.remarks || '');
    targetRow.set('Version', String(newVersion));
    targetRow.set('Updated_At', now);
    targetRow.set('Updated_By', 'system');

    await withRetry(() => targetRow.save(), requestId, 'updateRow:save');

    logger.info(
      `PUT stock | Updated ID=${id} | Version ${currentVersion}→${newVersion} | TotalValue=${totalValue}`,
      requestId,
    );

    // Re-read all rows after write
    return this.getAllRows(requestId);
  }

  /**
   * Delete a stock item by ID.
   * Returns ALL rows after the delete.
   */
  async deleteRow(id: string, requestId: string): Promise<StockItem[]> {
    logger.info(`DELETE stock | ID=${id}`, requestId);

    const sheet = getSheet();

    const rows = await withRetry(
      () => sheet.getRows<SheetRowData>(),
      requestId,
      'deleteRow:getRows',
    );

    const targetRow = rows.find((row) => row.get('ID') === id && row.get('Is_Deleted') !== 'TRUE');

    if (!targetRow) {
      throw new RowNotFoundError(id);
    }

    await withRetry(() => targetRow.delete(), requestId, 'deleteRow:delete');

    logger.info(`DELETE stock | Deleted ID=${id}`, requestId);

    // Re-read all rows after delete
    return this.getAllRows(requestId);
  }

  /**
   * Check if Google Sheets is reachable.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const start = performance.now();
    try {
      const sheet = getSheet();
      await sheet.getRows({ limit: 1 });
      const latencyMs = Math.round(performance.now() - start);
      return { connected: true, reachable: true, latencyMs };
    } catch {
      const latencyMs = Math.round(performance.now() - start);
      return { connected: false, reachable: false, latencyMs };
    }
  }

  /**
   * Get the last sync timestamp.
   */
  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  /**
   * Parse a string to a number, stripping currency symbols and commas.
   */
  private parseNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/[^0-9.-]+/g, '');
    return Number(str) || 0;
  }

  /**
   * Map a google-spreadsheet row object to our StockItem model.
   */
  private mapRowToStockItem(row: GoogleSpreadsheetRow<SheetRowData>): StockItem {
    return {
      id: row.get('ID') || '',
      stockName: row.get('Stock_Name') || '',
      reportGroup: row.get('Report_Group') || '',
      location: row.get('Location') || '',
      status: row.get('Status') || 'ACTIVE',
      itemCount: this.parseNumber(row.get('Item_Count')) || 1,
      caratWeight: this.parseNumber(row.get('Current_Carat')),
      totalValue: this.parseNumber(row.get('Current_Value')),
      caratRate: this.parseNumber(row.get('Average_Rate')),
      transactionCount: this.parseNumber(row.get('Transaction_Count')),
      remarks: row.get('Remarks') || '',
      uuid: row.get('UUID') || '',
      version: this.parseNumber(row.get('Version')) || 1,
      createdAt: row.get('Created_At') || '',
      createdBy: row.get('Created_By') || 'system',
      updatedAt: row.get('Updated_At') || '',
      updatedBy: row.get('Updated_By') || 'system',
      isDeleted: row.get('Is_Deleted') === 'TRUE',
      deletedAt: row.get('Deleted_At') || '',
      deletedBy: row.get('Deleted_By') || '',
    };
  }
}
