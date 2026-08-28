/**
 * DTO for updating an existing stock item.
 * Client must send the current version for optimistic lock check.
 */
export interface UpdateStockDTO {
    stockName: string;
    reportGroup?: string;
    location?: string;
    itemType?: string;
    shape?: string;
    cut?: string;
    clarity?: string;
    color?: string;
    caratWeight: number;
    caratRate: number;
    remarks?: string;
    itemCount?: number;
    status?: string;
    version: number;
}
//# sourceMappingURL=update-stock.dto.d.ts.map