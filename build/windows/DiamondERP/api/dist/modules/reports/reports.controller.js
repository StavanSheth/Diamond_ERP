"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const reports_service_1 = require("./reports.service");
class ReportsController {
    constructor() {
        /**
         * Existing KPI charts data endpoint for backward compatibility
         */
        this.getReports = async (_req, res, next) => {
            try {
                const data = await reports_service_1.reportsService.getKPIs();
                res.json({
                    success: true,
                    data
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/reports/preview
         * Live interactive table preview before export
         */
        this.getReportPreview = async (req, res, next) => {
            try {
                const data = await reports_service_1.reportsService.buildReportData(req.query);
                res.json({ success: true, ...data });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/reports/export/excel
         * Downloads formatted Excel spreadsheet, respecting user-selected rows and visible columns if specified
         */
        this.exportExcel = async (req, res, next) => {
            try {
                await reports_service_1.reportsService.exportExcel(req.query, res);
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.ReportsController = ReportsController;
//# sourceMappingURL=reports.controller.js.map