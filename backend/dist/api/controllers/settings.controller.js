"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
class SettingsController {
    constructor() {
        this.getSettings = async (_req, res, next) => {
            try {
                const rows = await prisma_1.default.setting.findMany();
                const settings = {};
                rows.forEach(r => {
                    settings[r.key] = r.value;
                });
                res.json({ success: true, data: settings });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateSettings = async (req, res, next) => {
            try {
                const settingsToUpdate = req.body;
                for (const [key, value] of Object.entries(settingsToUpdate)) {
                    await prisma_1.default.setting.upsert({
                        where: { key },
                        update: { value },
                        create: { key, value }
                    });
                }
                res.json({ success: true, message: 'Settings updated successfully' });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map