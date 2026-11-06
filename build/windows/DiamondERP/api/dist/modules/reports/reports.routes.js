"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reports_controller_1 = require("./reports.controller");
const router = (0, express_1.Router)();
const reportsController = new reports_controller_1.ReportsController();
router.get('/', reportsController.getReports);
router.get('/preview', reportsController.getReportPreview);
router.get('/export/excel', reportsController.exportExcel);
exports.default = router;
//# sourceMappingURL=reports.routes.js.map