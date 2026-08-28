import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
/**
 * Initialize the Google Sheets client.
 * Creates JWT auth, loads the document info, and finds/creates the "Inventory" worksheet.
 */
export declare function initializeGoogleClient(): Promise<void>;
/**
 * Get the active worksheet.
 * Throws if the client has not been initialized.
 */
export declare function getSheet(): GoogleSpreadsheetWorksheet;
export declare function getDoc(): GoogleSpreadsheet;
//# sourceMappingURL=client.d.ts.map