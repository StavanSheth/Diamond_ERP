"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = setup;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function setup() {
    process.env.DATABASE_URL = 'file:./test.db';
    const dbPath = path_1.default.join(__dirname, '../../prisma/test.db');
    if (fs_1.default.existsSync(dbPath)) {
        fs_1.default.unlinkSync(dbPath);
    }
    try {
        (0, child_process_1.execSync)('npx prisma db push --accept-data-loss', {
            env: {
                ...process.env,
                DATABASE_URL: 'file:./test.db'
            },
            stdio: 'inherit'
        });
    }
    catch (error) {
        console.error('Failed to setup test database:', error);
        throw error;
    }
}
//# sourceMappingURL=global-setup.js.map