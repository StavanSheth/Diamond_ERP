import { BaseEntity } from './base-entity';

/**
 * StockItem — the canonical model for a diamond stock parcel in the web app.
 * Mapped to Stock_Master in Google Sheets.
 */
export interface StockItem extends BaseEntity {
  stockName: string; // Maps to Stock_Name
  reportGroup: string; // Maps to Report_Group
  location: string; // Maps to Location
  itemCount: number; // Maps to Item_Count
  caratWeight: number; // Maps to Current_Carat
  totalValue: number; // Maps to Current_Value
  caratRate: number; // Maps to Average_Rate
  transactionCount: number; // Maps to Transaction_Count
  uuid: string; // Maps to UUID
}

/**
 * Display-friendly header names for the Stock_Master Google Sheet.
 */
export const SHEET_HEADER_DISPLAY: string[] = [
  'ID',
  'Stock_Name',
  'Report_Group',
  'Location',
  'Status',
  'Item_Count',
  'Current_Carat',
  'Current_Value',
  'Average_Rate',
  'Transaction_Count',
  'Remarks',
  'UUID',
  'Version',
  'Created_At',
  'Created_By',
  'Updated_At',
  'Updated_By',
  'Is_Deleted',
  'Deleted_At',
  'Deleted_By'
];
