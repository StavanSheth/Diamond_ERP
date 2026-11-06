"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activationController = exports.ActivationController = exports.isKeyValid = exports.DEFAULT_APP_ACTIVATION_KEY = exports.getActivationFilePath = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const paths_1 = require("../../infrastructure/paths");
const getActivationFilePath = () => path_1.default.join((0, paths_1.getConfigDir)(), '.app-activation.json');
exports.getActivationFilePath = getActivationFilePath;
exports.DEFAULT_APP_ACTIVATION_KEY = 'Diamond@2026#SecureVault-APP';
const isKeyValid = (input) => {
    const trimmed = input.trim();
    const configured = process.env.DIAMOND_ACTIVATION_KEY;
    if (configured) {
        return trimmed === configured;
    }
    // Default complex key with phase tweak, plus test fallback in test env
    if (trimmed === exports.DEFAULT_APP_ACTIVATION_KEY)
        return true;
    if (process.env.NODE_ENV === 'test' && trimmed === 'XW2756WGH')
        return true;
    return false;
};
exports.isKeyValid = isKeyValid;
class ActivationController {
    constructor() {
        this.getActivationStatus = async (_req, res, next) => {
            try {
                // 1. Check file flag
                if (this.isFileActivated()) {
                    res.json({ success: true, isActivated: true });
                    return;
                }
                // 2. Check database setting
                const setting = await prisma_1.default.setting.findUnique({
                    where: { key: 'app_activated' }
                }).catch(() => null);
                if (setting?.value === 'true') {
                    // Sync to file for resilience
                    this.setFileActivated();
                    res.json({ success: true, isActivated: true });
                    return;
                }
                res.json({ success: true, isActivated: false });
            }
            catch (error) {
                next(error);
            }
        };
        this.activate = async (req, res, next) => {
            try {
                const { password } = req.body;
                if (!password || typeof password !== 'string') {
                    res.status(400).json({ success: false, error: 'Password is required' });
                    return;
                }
                if (!(0, exports.isKeyValid)(password)) {
                    res.status(401).json({ success: false, error: 'Invalid master activation password. Access denied.' });
                    return;
                }
                // Mark activated in both DB and File
                this.setFileActivated();
                await prisma_1.default.setting.upsert({
                    where: { key: 'app_activated' },
                    update: { value: 'true' },
                    create: { key: 'app_activated', value: 'true' }
                }).catch(() => null);
                await prisma_1.default.setting.upsert({
                    where: { key: 'app_activated_at' },
                    update: { value: new Date().toISOString() },
                    create: { key: 'app_activated_at', value: new Date().toISOString() }
                }).catch(() => null);
                res.json({
                    success: true,
                    message: 'Application unlocked and activated permanently.'
                });
            }
            catch (error) {
                next(error);
            }
        };
    }
    isFileActivated() {
        try {
            const filePath = (0, exports.getActivationFilePath)();
            if (fs_1.default.existsSync(filePath)) {
                const data = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
                return data?.activated === true;
            }
        }
        catch {
            // Ignore read errors
        }
        return false;
    }
    setFileActivated() {
        try {
            const filePath = (0, exports.getActivationFilePath)();
            const dir = path_1.default.dirname(filePath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(filePath, JSON.stringify({
                activated: true,
                activatedAt: new Date().toISOString()
            }, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('[Activation] Failed to write activation file:', err);
        }
    }
}
exports.ActivationController = ActivationController;
exports.activationController = new ActivationController();
//# sourceMappingURL=activation.controller.js.map