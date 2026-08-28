"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeGoogleClient = initializeGoogleClient;
exports.getSheet = getSheet;
exports.getDoc = getDoc;
const google_spreadsheet_1 = require("google-spreadsheet");
const google_auth_library_1 = require("google-auth-library");
const config_1 = require("../../config");
const logger_1 = require("../../logger");
const stock_item_1 = require("../../models/stock-item");
/**
 * Google Sheets client singleton.
 *
 * Manages the connection to Google Sheets using a service account JWT.
 * Uses Sheet2 ("Inventory") to avoid conflicts with reference project data on Sheet1.
 */
let doc = null;
let sheet = null;
/**
 * Initialize the Google Sheets client.
 * Creates JWT auth, loads the document info, and finds/creates the "Inventory" worksheet.
 */
async function initializeGoogleClient() {
    logger_1.logger.info('Initializing Google Sheets client...');
    const serviceAccountAuth = new google_auth_library_1.JWT({
        email: config_1.config.google.serviceAccountEmail,
        key: config_1.config.google.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    doc = new google_spreadsheet_1.GoogleSpreadsheet(config_1.config.google.sheetId, serviceAccountAuth);
    await doc.loadInfo();
    logger_1.logger.info(`Connected to spreadsheet: "${doc.title}"`);
    // Look for the "Inventory" worksheet; create it if it doesn't exist
    const worksheetName = config_1.config.google.worksheetName;
    sheet = doc.sheetsByTitle[worksheetName] || null;
    if (!sheet) {
        logger_1.logger.info(`Worksheet "${worksheetName}" not found. Creating...`);
        sheet = await doc.addSheet({
            title: worksheetName,
            headerValues: stock_item_1.SHEET_HEADER_DISPLAY,
        });
        logger_1.logger.info(`Created worksheet: "${worksheetName}"`);
    }
    logger_1.logger.info(`Using worksheet: "${sheet.title}" (${sheet.rowCount} rows, ${sheet.columnCount} cols)`);
}
/**
 * Get the active worksheet.
 * Throws if the client has not been initialized.
 */
function getSheet() {
    if (!sheet) {
        throw new Error('Google Sheets client not initialized. Call initializeGoogleClient() first.');
    }
    return sheet;
}
function getDoc() {
    if (!doc) {
        throw new Error('Google Sheets doc not initialized. Call initializeGoogleClient() first.');
    }
    return doc;
}
//# sourceMappingURL=client.js.map