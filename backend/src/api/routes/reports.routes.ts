import { Router } from 'express';
import { ReportsController } from '../controllers/reports.controller';

const router = Router();
const reportsController = new ReportsController();

router.get('/', reportsController.getReports);

export default router;
