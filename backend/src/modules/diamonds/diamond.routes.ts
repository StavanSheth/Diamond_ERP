import { Router } from 'express';
import { DiamondController } from '../controllers/diamond.controller';

const router = Router();
const diamondController = new DiamondController();

router.get('/', diamondController.getAllDiamonds);
router.get('/:id', diamondController.getDiamond);

export default router;
