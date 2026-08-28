import { IDataProvider, ProviderHealth } from '../../interfaces/data-provider';
import { StockItem } from '../../models/stock-item';
import { CreateStockDTO } from '../../dto/create-stock.dto';
import { UpdateStockDTO } from '../../dto/update-stock.dto';
/**
 * Custom error for optimistic locking conflicts (HTTP 409).
 */
export declare class ConflictError extends Error {
    readonly statusCode = 409;
    readonly currentVersion: number;
    readonly clientVersion: number;
    constructor(rowId: string, clientVersion: number, currentVersion: number);
}
/**
 * Custom error for rows not found (HTTP 404).
 */
export declare class RowNotFoundError extends Error {
    readonly statusCode = 404;
    constructor(rowId: string);
}
/**
 * GoogleSheetProvider — implements IDataProvider using the google-spreadsheet library.
 *
 * Uses the Stock_Master worksheet to store diamond stock data.
 */
export declare class GoogleSheetProvider implements IDataProvider {
    private lastSyncTime;
    /**
     * Initialize the Google Sheets connection and ensure headers exist.
     */
    initialize(): Promise<void>;
    /**
     * Ensure the header row exists with the correct column names.
     */
    private ensureHeaders;
    /**
     * Retrieve all stock items from the Google Sheet.
     */
    getAllRows(requestId: string): Promise<StockItem[]>;
    /**
     * Add a new stock item to the Google Sheet.
     * Generates ID, computes TotalValue, sets Version=1, Status=ACTIVE.
     * Returns ALL rows after the write.
     */
    addRow(data: CreateStockDTO, requestId: string): Promise<StockItem[]>;
    /**
     * Update an existing stock item by ID.
     * Enforces optimistic locking via version check.
     * Returns ALL rows after the write.
     */
    updateRow(id: string, data: UpdateStockDTO, requestId: string): Promise<StockItem[]>;
    /**
     * Delete a stock item by ID.
     * Returns ALL rows after the delete.
     */
    deleteRow(id: string, requestId: string): Promise<StockItem[]>;
    /**
     * Check if Google Sheets is reachable.
     */
    healthCheck(): Promise<ProviderHealth>;
    /**
     * Get the last sync timestamp.
     */
    getLastSyncTime(): string | null;
    /**
     * Parse a string to a number, stripping currency symbols and commas.
     */
    private parseNumber;
    /**
     * Map a google-spreadsheet row object to our StockItem model.
     */
    private mapRowToStockItem;
}
//# sourceMappingURL=provider.d.ts.map