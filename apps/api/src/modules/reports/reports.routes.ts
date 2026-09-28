import { Router } from 'express';
import { ReportsController } from './reports.controller';

const router = Router();
const reportsController = new ReportsController();

router.get('/', reportsController.getReports);
router.get('/preview', reportsController.getReportPreview);
router.get('/export/excel', reportsController.exportExcel);

export default router;
