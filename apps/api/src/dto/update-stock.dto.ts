/**
 * DTO for updating an existing stock item.
 * Client must send the current version for optimistic lock check.
 */
import { CreateStockDTO } from './create-stock.dto';

export interface UpdateStockDTO extends CreateStockDTO {
  status?: string;
  version: number;
}
