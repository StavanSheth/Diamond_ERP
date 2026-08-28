import { StockItem } from '../models/stock-item';
import { CreateStockDTO } from '../dto/create-stock.dto';
import { UpdateStockDTO } from '../dto/update-stock.dto';
import { ApiResponse } from '../dto/api-response.dto';

/**
 * ISyncService — wraps data operations with performance measurement
 * and response formatting.
 */
export interface ISyncService {
  getAll(requestId: string): Promise<ApiResponse<StockItem[]>>;
  create(data: CreateStockDTO, requestId: string): Promise<ApiResponse<StockItem[]>>;
  update(id: string, data: UpdateStockDTO, requestId: string): Promise<ApiResponse<StockItem[]>>;
  delete(id: string, requestId: string): Promise<ApiResponse<StockItem[]>>;
}
