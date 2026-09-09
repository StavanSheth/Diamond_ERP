import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authorize } from '../../middleware/authorize';

const router = Router();
const reportsController = new ReportsController();

router.get('/', authorize('report.read'), reportsController.getReports);
router.get('/preview', authorize('report.read'), reportsController.getReportPreview);
router.get('/export/excel', authorize('report.export'), reportsController.exportExcel);

export default router;
