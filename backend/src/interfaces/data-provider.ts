import { StockItem } from '../models/stock-item';
import { CreateStockDTO } from '../dto/create-stock.dto';
import { UpdateStockDTO } from '../dto/update-stock.dto';

/**
 * Health status for a data provider.
 */
export interface ProviderHealth {
  connected: boolean;
  reachable: boolean;
  latencyMs: number;
}

/**
 * IDataProvider — the core abstraction for data storage.
 *
 * Every storage backend (Google Sheets, SQLite, PostgreSQL, etc.)
 * implements this interface. The repository layer consumes it without knowing
 * which concrete provider is behind it.
 *
 * Contract:
 * - Every write operation (add, update, delete) MUST return ALL rows after the write.
 * - Never cache. Never assume success. Always re-read after write.
 * - updateRow MUST enforce optimistic locking via the version field.
 */
export interface IDataProvider {
  /**
   * Initialize the provider (connect, verify headers, etc.).
   * Called once on application startup.
   */
  initialize(): Promise<void>;

  /**
   * Retrieve all rows from the data store.
   */
  getAllRows(requestId: string): Promise<StockItem[]>;

  /**
   * Add a new row. Returns ALL rows after the write.
   */
  addRow(data: CreateStockDTO, requestId: string): Promise<StockItem[]>;

  /**
   * Update an existing row by ID. Returns ALL rows after the write.
   * Must throw ConflictError if version does not match.
   */
  updateRow(id: string, data: UpdateStockDTO, requestId: string): Promise<StockItem[]>;

  /**
   * Delete a row by ID. Returns ALL rows after the delete.
   */
  deleteRow(id: string, requestId: string): Promise<StockItem[]>;

  /**
   * Check if the provider is healthy and reachable.
   */
  healthCheck(): Promise<ProviderHealth>;
}
