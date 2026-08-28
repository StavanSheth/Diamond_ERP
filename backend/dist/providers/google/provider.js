"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetProvider = exports.RowNotFoundError = exports.ConflictError = void 0;
const uuid_1 = require("uuid");
const stock_item_1 = require("../../models/stock-item");
const client_1 = require("./client");
const retry_1 = require("./retry");
const calculations_1 = require("../../utils/calculations");
const logger_1 = require("../../logger");
/**
 * Custom error for optimistic locking conflicts (HTTP 409).
 */
class ConflictError extends Error {
    constructor(rowId, clientVersion, currentVersion) {
        super(`Conflict: Row "${rowId}" has been modified. ` +
            `Client version: ${clientVersion}, current version: ${currentVersion}. ` +
            `Refresh and try again.`);
        this.statusCode = 409;
        this.name = 'ConflictError';
        this.currentVersion = currentVersion;
        this.clientVersion = clientVersion;
    }
}
exports.ConflictError = ConflictError;
/**
 * Custom error for rows not found (HTTP 404).
 */
class RowNotFoundError extends Error {
    constructor(rowId) {
        super(`Stock item with ID "${rowId}" not found.`);
        this.statusCode = 404;
        this.name = 'RowNotFoundError';
    }
}
exports.RowNotFoundError = RowNotFoundError;
/**
 * GoogleSheetProvider — implements IDataProvider using the google-spreadsheet library.
 *
 * Uses the Stock_Master worksheet to store diamond stock data.
 */
class GoogleSheetProvider {
    constructor() {
        this.lastSyncTime = null;
    }
    /**
     * Initialize the Google Sheets connection and ensure headers exist.
     */
    async initialize() {
        await (0, client_1.initializeGoogleClient)();
        await this.ensureHeaders();
        logger_1.logger.info('GoogleSheetProvider initialized successfully.');
    }
    /**
     * Ensure the header row exists with the correct column names.
     */
    async ensureHeaders() {
        const sheet = (0, client_1.getSheet)();
        try {
            await sheet.loadHeaderRow();
            const headers = sheet.headerValues;
            const expectedHeaders = stock_item_1.SHEET_HEADER_DISPLAY;
            const headersMatch = expectedHeaders.every((h, i) => headers[i] === h);
            if (!headersMatch) {
                logger_1.logger.warn(`Header mismatch. Expected: [${expectedHeaders.join(', ')}], ` +
                    `Got: [${headers.join(', ')}]. Setting correct headers.`);
                await sheet.setHeaderRow(expectedHeaders);
            }
        }
        catch {
            // Headers don't exist yet — set them up
            logger_1.logger.info('No header row found. Creating headers...');
            await sheet.setHeaderRow(stock_item_1.SHEET_HEADER_DISPLAY);
        }
        logger_1.logger.info(`Headers verified: [${stock_item_1.SHEET_HEADER_DISPLAY.join(', ')}]`);
        // Define and verify auxiliary sheets
        const doc = (0, client_1.getDoc)();
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
                logger_1.logger.info(`Worksheet "${aux.title}" not found. Creating...`);
                auxSheet = await doc.addSheet({
                    title: aux.title,
                    headerValues: aux.headers
                });
                logger_1.logger.info(`Created worksheet: "${aux.title}"`);
            }
            else {
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
                }
                catch {
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
    async getAllRows(requestId) {
        logger_1.logger.info('GET stocks | Google Sync Started', requestId);
        const sheet = (0, client_1.getSheet)();
        const rows = await (0, retry_1.withRetry)(() => sheet.getRows(), requestId, 'getAllRows');
        const mapped = rows.map((row) => this.mapRowToStockItem(row));
        this.lastSyncTime = new Date().toISOString();
        logger_1.logger.info(`GET stocks | Google Sync Finished | ${mapped.length} items returned`, requestId);
        return mapped;
    }
    /**
     * Add a new stock item to the Google Sheet.
     * Generates ID, computes TotalValue, sets Version=1, Status=ACTIVE.
     * Returns ALL rows after the write.
     */
    async addRow(data, requestId) {
        logger_1.logger.info(`POST stock | Name=${data.stockName}`, requestId);
        const doc = (0, client_1.getDoc)();
        const masterSheet = (0, client_1.getSheet)(); // Stock_Master
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
        const totalValue = (0, calculations_1.calculateTotalValue)(data.caratWeight, data.caratRate);
        // 1. Insert to Stock_Master
        await (0, retry_1.withRetry)(() => masterSheet.addRow({
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
            UUID: (0, uuid_1.v4)(),
            Version: '1',
            Created_At: now,
            Created_By: 'system',
            Updated_At: now,
            Updated_By: 'system',
            Is_Deleted: 'FALSE',
            Deleted_At: '',
            Deleted_By: '',
        }), requestId, 'addRow:master');
        // 2. Insert to Stock_Item_Master
        await (0, retry_1.withRetry)(() => itemMasterSheet.addRow({
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
            UUID: (0, uuid_1.v4)(),
            Version: '1',
            Created_At: now,
            Created_By: 'system',
            Updated_At: now,
            Updated_By: 'system',
            Is_Deleted: 'FALSE',
            Deleted_At: '',
            Deleted_By: '',
        }), requestId, 'addRow:item');
        // 3. Insert to Transaction_Master (Opening Balance)
        await (0, retry_1.withRetry)(() => txnMasterSheet.addRow({
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
            UUID: (0, uuid_1.v4)(),
            Status: 'ACTIVE',
            Version: '1',
            Created_At: now,
            Created_By: 'system',
            Updated_At: now,
            Updated_By: 'system',
            Is_Deleted: 'FALSE',
            Deleted_At: '',
            Deleted_By: '',
        }), requestId, 'addRow:txn');
        // 4. Insert to Stock_Ledger (Opening Balance)
        await (0, retry_1.withRetry)(() => ledgerSheet.addRow({
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
            UUID: (0, uuid_1.v4)(),
            Status: 'ACTIVE',
            Version: '1',
            Created_At: now,
            Created_By: 'system',
            Updated_At: now,
            Updated_By: 'system',
            Is_Deleted: 'FALSE',
            Deleted_At: '',
            Deleted_By: '',
        }), requestId, 'addRow:ledger');
        logger_1.logger.info(`POST stock | Created ID=${stockId} | TotalValue=${totalValue}`, requestId);
        // Re-read all rows after write — never assume success
        return this.getAllRows(requestId);
    }
    /**
     * Update an existing stock item by ID.
     * Enforces optimistic locking via version check.
     * Returns ALL rows after the write.
     */
    async updateRow(id, data, requestId) {
        logger_1.logger.info(`PUT stock | ID=${id}, Name=${data.stockName}, ClientVersion=${data.version}`, requestId);
        const sheet = (0, client_1.getSheet)();
        const rows = await (0, retry_1.withRetry)(() => sheet.getRows(), requestId, 'updateRow:getRows');
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
        const totalValue = (0, calculations_1.calculateTotalValue)(data.caratWeight, data.caratRate);
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
        await (0, retry_1.withRetry)(() => targetRow.save(), requestId, 'updateRow:save');
        logger_1.logger.info(`PUT stock | Updated ID=${id} | Version ${currentVersion}→${newVersion} | TotalValue=${totalValue}`, requestId);
        // Re-read all rows after write
        return this.getAllRows(requestId);
    }
    /**
     * Delete a stock item by ID.
     * Returns ALL rows after the delete.
     */
    async deleteRow(id, requestId) {
        logger_1.logger.info(`DELETE stock | ID=${id}`, requestId);
        const sheet = (0, client_1.getSheet)();
        const rows = await (0, retry_1.withRetry)(() => sheet.getRows(), requestId, 'deleteRow:getRows');
        const targetRow = rows.find((row) => row.get('ID') === id && row.get('Is_Deleted') !== 'TRUE');
        if (!targetRow) {
            throw new RowNotFoundError(id);
        }
        await (0, retry_1.withRetry)(() => targetRow.delete(), requestId, 'deleteRow:delete');
        logger_1.logger.info(`DELETE stock | Deleted ID=${id}`, requestId);
        // Re-read all rows after delete
        return this.getAllRows(requestId);
    }
    /**
     * Check if Google Sheets is reachable.
     */
    async healthCheck() {
        const start = performance.now();
        try {
            const sheet = (0, client_1.getSheet)();
            await sheet.getRows({ limit: 1 });
            const latencyMs = Math.round(performance.now() - start);
            return { connected: true, reachable: true, latencyMs };
        }
        catch {
            const latencyMs = Math.round(performance.now() - start);
            return { connected: false, reachable: false, latencyMs };
        }
    }
    /**
     * Get the last sync timestamp.
     */
    getLastSyncTime() {
        return this.lastSyncTime;
    }
    /**
     * Parse a string to a number, stripping currency symbols and commas.
     */
    parseNumber(val) {
        if (typeof val === 'number')
            return val;
        if (!val)
            return 0;
        const str = String(val).replace(/[^0-9.-]+/g, '');
        return Number(str) || 0;
    }
    /**
     * Map a google-spreadsheet row object to our StockItem model.
     */
    mapRowToStockItem(row) {
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
exports.GoogleSheetProvider = GoogleSheetProvider;
//# sourceMappingURL=provider.js.map