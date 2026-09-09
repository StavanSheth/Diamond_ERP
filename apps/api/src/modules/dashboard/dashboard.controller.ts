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
      
      const [activeParcels, stockCounts, totals, recentStocks, topValueStocks] = await Promise.all([
        prisma.stock.count({ where: { isActive: true } }),
        prisma.stock.groupBy({
          by: ['isActive'],
          _count: { _all: true }
        }),
        prisma.diamondItem.aggregate({
          where: { status: { notIn: ['SOLD', 'WRITTEN_OFF'] } },
          _sum: { carat: true, currentValue: true }
        }),
        prisma.stock.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: { id: true, name: true, updatedAt: true }
        }),
        // Top stocks is trickier in pure SQL without a view, we'll fetch stocks and their item sums 
        // using Prisma's relation count/sum isn't perfectly supported in one go without raw query.
        // We'll execute a lightweight raw query for top stocks by value:
        prisma.$queryRaw<{id: string, name: string, total_value: number, carat_weight: number}[]>`
          SELECT s.id, s.name, 
                 SUM(d.currentValue) as total_value,
                 SUM(d.carat) as carat_weight
          FROM "Stock" s
          LEFT JOIN "DiamondItem" d ON d."stockId" = s.id AND d.status NOT IN ('SOLD', 'WRITTEN_OFF')
          GROUP BY s.id, s.name
          ORDER BY total_value DESC
          LIMIT 5
        `
      ]);

      const totalCarats = Number(totals._sum.carat || 0);
      const totalStockValue = Number(totals._sum.currentValue || 0);
      
      const stocksByStatus: Record<string, number> = {
        'ACTIVE': stockCounts.find(c => c.isActive)?._count._all || 0,
        'INACTIVE': stockCounts.find(c => !c.isActive)?._count._all || 0,
      };

      const topStocks = topValueStocks.map(s => ({
        id: s.id,
        stockName: s.name,
        totalValue: Number(s.total_value || 0),
        caratWeight: Number(s.carat_weight || 0),
        status: 'ACTIVE',
        updatedAt: new Date(), // Mocked for UI compatibility from raw query
        updatedBy: 'system'
      }));

      const recentActivity = recentStocks.map(s => ({
        id: s.id,
        stockName: s.name,
        action: 'Updated',
        updatedAt: s.updatedAt.toISOString(),
        updatedBy: 'system',
      }));

      const avgRatePerCarat = totalCarats > 0 ? (totalStockValue / totalCarats) : 0;

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
