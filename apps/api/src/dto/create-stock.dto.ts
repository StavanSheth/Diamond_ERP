/**
 * DTO for creating a new stock item.
 * Only user-provided fields are included.
 * ID, computed fields, and locking fields are set by the backend.
 */
export interface CreateStockDTO {
  stockName: string;
  reportGroup?: string;
  location?: string;
  itemType?: string;
  shape?: string;
  cut?: string;
  clarity?: string;
  color?: string;
  caratWeight?: number;
  caratRate?: number;
  remarks?: string;
  itemCount?: number;
}
