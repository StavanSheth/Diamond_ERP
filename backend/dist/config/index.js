"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: Number(process.env.PORT) || 3001,
    pollingInterval: Number(process.env.POLLING_INTERVAL) || 3000,
    google: {
        serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        sheetId: process.env.GOOGLE_SHEET_ID || '',
        worksheetName: process.env.WORKSHEET_NAME || 'Stock_Master',
    },
    retry: {
        maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS) || 3,
        baseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 250,
        retryableStatusCodes: [429, 500, 503],
    },
};
/**
 * Validates that all required environment variables are present.
 * Call this on startup before initializing providers.
 */
function validateConfig() {
    const required = [
        { key: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', value: exports.config.google.serviceAccountEmail },
        { key: 'GOOGLE_PRIVATE_KEY', value: exports.config.google.privateKey },
        { key: 'GOOGLE_SHEET_ID', value: exports.config.google.sheetId },
    ];
    const missing = required.filter((r) => !r.value);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.map((m) => m.key).join(', ')}. ` +
            `Copy .env.example to .env and fill in the values.`);
    }
}
//# sourceMappingURL=index.js.map