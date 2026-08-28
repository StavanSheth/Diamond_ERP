import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';

export class DiamondController {
  
  /**
   * GET /api/diamonds/:id
   * Get full details of a single diamond item, including its lifecycle events, certs, and repairs.
   */
  getDiamond = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const diamond = await prisma.diamondItem.findUnique({
        where: { id },
        include: {
          events: {
            include: { party: true, transaction: true },
            orderBy: { eventDate: 'desc' }
          },
          certifications: true,
          repairs: { include: { vendor: true } },
          location: true
        }
      });

      if (!diamond) {
        res.status(404).json({ success: false, error: 'Diamond not found' });
        return;
      }

      res.json({ success: true, data: diamond });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/diamonds
   * Get all diamonds
   */
  getAllDiamonds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockId, status } = req.query;
      
      const where: any = {};
      if (stockId) where.stockId = stockId;
      if (status) where.status = status;

      const diamonds = await prisma.diamondItem.findMany({
        where,
        include: {
          stock: true,
          location: true
        }
      });
      
      res.json({ success: true, data: diamonds });
    } catch (error) {
      next(error);
    }
  }
}
