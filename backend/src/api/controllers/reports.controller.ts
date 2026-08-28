import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';

export class ReportsController {
  
  getReports = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Sales vs Purchases (over time or just total)
      const sales = await prisma.transaction.findMany({
        where: { transactionType: 'SALE' },
        include: { items: true }
      });
      const purchases = await prisma.transaction.findMany({
        where: { transactionType: 'PURCHASE' },
        include: { items: true }
      });

      const totalSalesValue = sales.reduce((acc, t) => acc + t.items.reduce((sum, item) => sum + Number(item.totalValue), 0), 0);
      const totalPurchasesValue = purchases.reduce((acc, t) => acc + t.items.reduce((sum, item) => sum + Number(item.totalValue), 0), 0);

      const salesVsPurchases = [
        { name: 'Purchases', value: totalPurchasesValue },
        { name: 'Sales', value: totalSalesValue }
      ];

      // 2. Inventory by Category (SINGLE vs MIX vs ROUGH)
      const items = await prisma.diamondItem.findMany({
        where: { status: 'AVAILABLE' }
      });

      const categories = items.reduce((acc: any, item) => {
        const cat = item.category || 'SINGLE';
        if (!acc[cat]) acc[cat] = 0;
        acc[cat] += Number(item.currentValue);
        return acc;
      }, {});

      const inventoryByCategory = Object.keys(categories).map(key => ({
        name: key,
        value: categories[key]
      }));

      // 3. Certified vs Non-Certified
      const certifiedStats = items.reduce((acc: any, item) => {
        const status = item.certificateStatus === 'NONE' ? 'Non-Certified' : 'Certified';
        if (!acc[status]) acc[status] = 0;
        acc[status]++;
        return acc;
      }, {});

      const certificationStatus = Object.keys(certifiedStats).map(key => ({
        name: key,
        value: certifiedStats[key]
      }));

      res.json({
        success: true,
        data: {
          salesVsPurchases,
          inventoryByCategory,
          certificationStatus
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
