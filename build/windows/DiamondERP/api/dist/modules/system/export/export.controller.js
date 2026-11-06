"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportController = exports.ExportController = void 0;
const export_service_1 = require("./export.service");
class ExportController {
    constructor() {
        this.exportData = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await export_service_1.exportService.exportBusinessData(req.body, performedBy);
                res.status(201).json({
                    success: true,
                    message: 'Business data export completed and verified successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.verifyExport = async (req, res, next) => {
            try {
                const target = req.body?.path || req.body?.exportId || req.query?.exportId;
                const result = await export_service_1.exportService.verifyExport(target);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.ExportController = ExportController;
exports.exportController = new ExportController();
//# sourceMappingURL=export.controller.js.map