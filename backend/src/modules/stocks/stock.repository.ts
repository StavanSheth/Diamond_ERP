import { IDataProvider } from '../interfaces/data-provider';
import { StockItem } from '../models/stock-item';
import { CreateStockDTO } from '../dto/create-stock.dto';
import { UpdateStockDTO } from '../dto/update-stock.dto';

/**
 * StockRepository — thin abstraction layer over the data provider.
 *
 * Receives IDataProvider via constructor injection.
 * Delegates all calls to the provider, adding any cross-provider
 * business logic or data transformation if needed.
 */
export class StockRepository {
  constructor(private readonly provider: IDataProvider) {}

  async getAll(requestId: string): Promise<StockItem[]> {
    return this.provider.getAllRows(requestId);
  }

  async create(data: CreateStockDTO, requestId: string): Promise<StockItem[]> {
    return this.provider.addRow(data, requestId);
  }

  async update(id: string, data: UpdateStockDTO, requestId: string): Promise<StockItem[]> {
    return this.provider.updateRow(id, data, requestId);
  }

  async delete(id: string, requestId: string): Promise<StockItem[]> {
    return this.provider.deleteRow(id, requestId);
  }
}
