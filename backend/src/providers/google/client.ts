import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { config } from '../../config';
import { logger } from '../../logger';
import { SHEET_HEADER_DISPLAY } from '../../models/stock-item';

/**
 * Google Sheets client singleton.
 *
 * Manages the connection to Google Sheets using a service account JWT.
 * Uses Sheet2 ("Inventory") to avoid conflicts with reference project data on Sheet1.
 */

let doc: GoogleSpreadsheet | null = null;
let sheet: GoogleSpreadsheetWorksheet | null = null;

/**
 * Initialize the Google Sheets client.
 * Creates JWT auth, loads the document info, and finds/creates the "Inventory" worksheet.
 */
export async function initializeGoogleClient(): Promise<void> {
  logger.info('Initializing Google Sheets client...');

  const serviceAccountAuth = new JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  doc = new GoogleSpreadsheet(config.google.sheetId, serviceAccountAuth);
  await doc.loadInfo();

  logger.info(`Connected to spreadsheet: "${doc.title}"`);

  // Look for the "Inventory" worksheet; create it if it doesn't exist
  const worksheetName = config.google.worksheetName;
  sheet = doc.sheetsByTitle[worksheetName] || null;

  if (!sheet) {
    logger.info(`Worksheet "${worksheetName}" not found. Creating...`);
    sheet = await doc.addSheet({
      title: worksheetName,
      headerValues: SHEET_HEADER_DISPLAY,
    });
    logger.info(`Created worksheet: "${worksheetName}"`);
  }

  logger.info(`Using worksheet: "${sheet.title}" (${sheet.rowCount} rows, ${sheet.columnCount} cols)`);
}

/**
 * Get the active worksheet.
 * Throws if the client has not been initialized.
 */
export function getSheet(): GoogleSpreadsheetWorksheet {
  if (!sheet) {
    throw new Error(
      'Google Sheets client not initialized. Call initializeGoogleClient() first.',
    );
  }
  return sheet;
}

export function getDoc(): GoogleSpreadsheet {
  if (!doc) {
    throw new Error(
      'Google Sheets doc not initialized. Call initializeGoogleClient() first.',
    );
  }
  return doc;
}


