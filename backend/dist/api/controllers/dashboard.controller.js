"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
class DashboardController {
    constructor() {
        /**
         * GET /api/dashboard — Returns computed KPIs from Prisma.
         */
        this.getDashboard = async (req, res, next) => {
            try {
                const requestId = req.requestId || 'REQ-UNKNOWN';
                const stocks = await prisma_1.default.stock.findMany({
                    include: { diamondItems: true }
                });
                let totalStockValue = 0;
                let totalCarats = 0;
                let activeParcels = 0;
                const stocksByStatus = {};
                const enrichedStocks = stocks.map(stock => {
                    const stockCarats = stock.diamondItems.reduce((sum, item) => sum + Number(item.carat), 0);
                    const stockValue = stock.diamondItems.reduce((sum, item) => sum + Number(item.currentValue), 0);
                    totalCarats += stockCarats;
                    totalStockValue += stockValue;
                    if (stock.isActive)
                        activeParcels++;
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
                const dashboard = {
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
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.DashboardController = DashboardController;
//# sourceMappingURL=dashboard.controller.js.map