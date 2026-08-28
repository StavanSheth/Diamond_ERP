import { ISyncService } from '../interfaces/sync-service';
import { StockRepository } from '../repositories/stock.repository';
import { StockItem } from '../models/stock-item';
import { CreateStockDTO } from '../dto/create-stock.dto';
import { UpdateStockDTO } from '../dto/update-stock.dto';
import { ApiResponse } from '../dto/api-response.dto';
/**
 * SyncService — wraps repository calls with performance measurement,
 * structured logging, and API response formatting.
 *
 * Every operation is timed at three levels:
 * - requestTime: time before calling Google API
 * - googleApiTime: time spent in Google API calls
 * - processingTime: time after Google API returns
 */
export declare class SyncService implements ISyncService {
    private readonly repository;
    constructor(repository: StockRepository);
    getAll(requestId: string): Promise<ApiResponse<StockItem[]>>;
    create(data: CreateStockDTO, requestId: string): Promise<ApiResponse<StockItem[]>>;
    update(id: string, data: UpdateStockDTO, requestId: string): Promise<ApiResponse<StockItem[]>>;
    delete(id: string, requestId: string): Promise<ApiResponse<StockItem[]>>;
    /**
     * Execute a repository operation with full performance measurement.
     */
    private executeWithMetrics;
}
//# sourceMappingURL=sync.service.d.ts.map