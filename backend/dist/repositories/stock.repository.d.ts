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
export declare class StockRepository {
    private readonly provider;
    constructor(provider: IDataProvider);
    getAll(requestId: string): Promise<StockItem[]>;
    create(data: CreateStockDTO, requestId: string): Promise<StockItem[]>;
    update(id: string, data: UpdateStockDTO, requestId: string): Promise<StockItem[]>;
    delete(id: string, requestId: string): Promise<StockItem[]>;
}
//# sourceMappingURL=stock.repository.d.ts.map