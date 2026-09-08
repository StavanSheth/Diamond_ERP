import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { RequestWithId } from '../../middleware/request-id';
import { DashboardData } from '../../dto/api-response.dto';

export class DashboardController {
  
  /**
   * GET /api/dashboard — Returns computed KPIs from Prisma.
   */
  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = (req as RequestWithId).requestId || 'REQ-UNKNOWN';
      
      const stocks = await prisma.stock.findMany({
        include: { diamondItems: true }
      });
      
      let totalStockValue = 0;
      let totalCarats = 0;
      let activeParcels = 0;
      const stocksByStatus: Record<string, number> = {};
      
      const enrichedStocks = stocks.map(stock => {
        const activeItems = stock.diamondItems.filter(i => i.status !== 'SOLD' && i.status !== 'WRITTEN_OFF');
        const stockCarats = activeItems.reduce((sum, item) => sum + Number(item.carat), 0);
        const stockValue = activeItems.reduce((sum, item) => sum + Number(item.currentValue), 0);
        
        totalCarats += stockCarats;
        totalStockValue += stockValue;
        
        if (stock.isActive) activeParcels++;
        
        const status = stock.isActive ? 'ACTIVE' : 'INACTIVE';
        stocksByStatus[status] = (stocksByStatus[status] || 0) + 1;
        
        return {
          id: stock.id,
          stockName: stock.name,
          totalValue: stockValue,
          caratWeight: stockCarats,
          status: status,
          updatedAt: stock.updatedAt,
          updatedBy: 'system'
        };
      });

      const avgRatePerCarat = totalCarats > 0 ? (totalStockValue / totalCarats) : 0;

      const topStocks = [...enrichedStocks]
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 5);

      const recentActivity = [...enrichedStocks]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)
        .map(s => ({
          id: s.id,
          stockName: s.stockName,
          action: 'Updated',
          updatedAt: s.updatedAt.toISOString(),
          updatedBy: s.updatedBy,
        }));

      const dashboard: DashboardData = {
        totalStockValue: Math.round(totalStockValue * 100) / 100,
        totalCarats: Math.round(totalCarats * 100) / 100,
        activeParcels,
        avgRatePerCarat: Math.round(avgRatePerCarat * 100) / 100,
        stocksByStatus,
        topStocks,
        recentActivity,
      };

      res.json({
        success: true,
        data: dashboard,
        syncStatus: 'success',
        requestId,
      });
    } catch (error) {
      next(error);
    }
  };
}
