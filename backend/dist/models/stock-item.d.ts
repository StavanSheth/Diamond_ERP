import { BaseEntity } from './base-entity';
/**
 * StockItem — the canonical model for a diamond stock parcel in the web app.
 * Mapped to Stock_Master in Google Sheets.
 */
export interface StockItem extends BaseEntity {
    stockName: string;
    reportGroup: string;
    location: string;
    itemCount: number;
    caratWeight: number;
    totalValue: number;
    caratRate: number;
    transactionCount: number;
    uuid: string;
}
/**
 * Display-friendly header names for the Stock_Master Google Sheet.
 */
export declare const SHEET_HEADER_DISPLAY: string[];
//# sourceMappingURL=stock-item.d.ts.map