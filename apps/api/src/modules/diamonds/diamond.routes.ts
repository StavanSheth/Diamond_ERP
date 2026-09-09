import { Router } from 'express';
import { DiamondController } from './diamond.controller';
import { authorize } from '../../middleware/authorize';

const router = Router();
const diamondController = new DiamondController();

router.get('/', authorize('diamond.read'), diamondController.getAllDiamonds);
router.get('/:id', authorize('diamond.read'), diamondController.getDiamond);

export default router;
