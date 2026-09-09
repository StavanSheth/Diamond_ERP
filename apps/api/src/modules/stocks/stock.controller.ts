import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { transactionService } from '../transactions/transaction.service';
import { TransactionType, TransactionItemAction } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';

export class StockController {
  
  getStocks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const hasFilters = Object.keys(diamondWhere).length > 0;

      // Task 18 & 19: Pagination and Optimization
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 1000;

      const stockWhere: any = {};
      if (hasFilters) {
        stockWhere.diamondItems = { some: diamondWhere };
      }

      if (req.query.paymentDirection || req.query.agingDays) {
        const txWhere: any = {
          paymentStatus: { not: 'COMPLETED' },
          paymentDue: { gt: 0 }
        };
        if (req.query.paymentDirection === 'RECEIVABLE') {
          txWhere.transactionType = 'SALE';
        } else if (req.query.paymentDirection === 'PAYABLE') {
          txWhere.transactionType = { in: ['PURCHASE', 'REPAIR', 'CERTIFICATION', 'REPAIR_OUT'] };
        }
        if (req.query.agingDays && req.query.agingDays !== 'All') {
          const days = parseInt(req.query.agingDays as string, 10);
          if (!isNaN(days) && days > 0) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            txWhere.transactionDate = { lte: cutoff };
          }
        }
        stockWhere.ledgers = {
          some: {
            transactions: {
              some: txWhere
            }
          }
        };
      }

      const [total, stocks] = await prisma.$transaction([
        prisma.stock.count({ where: Object.keys(stockWhere).length > 0 ? stockWhere : undefined }),
        prisma.stock.findMany({
          where: Object.keys(stockWhere).length > 0 ? stockWhere : undefined,
          skip,
          take,
          include: {
            ledgers: true,
            diamondItems: {
              where: diamondWhere
            }
          }
        })
      ]);
      
      const mappedStocks = stocks.map(stock => {
        const activeItems = stock.diamondItems.filter(i => i.status !== 'SOLD' && i.status !== 'WRITTEN_OFF');
        const caratWeight = activeItems.reduce((sum, item) => sum + Number(item.carat), 0);
        const totalValue = activeItems.reduce((sum, item) => sum + Number(item.currentValue), 0);
        
        const certifiedCount = stock.diamondItems.filter(i => i.certificateStatus === 'ISSUED').length;
        const nonCertifiedCount = stock.diamondItems.filter(i => i.certificateStatus !== 'ISSUED').length;
        const roughCount = stock.diamondItems.filter(i => i.polish === 'ROUGH').length;
        const polishedCount = stock.diamondItems.filter(i => i.polish !== 'ROUGH' && i.polish !== null).length;
        const repairCount = stock.diamondItems.filter(i => i.status === 'IN_REPAIR').length;
        const soldCount = stock.diamondItems.filter(i => i.status === 'SOLD').length;
        const singleCount = stock.diamondItems.filter(i => i.category === 'SINGLE').length;
        const parcelCount = stock.diamondItems.filter(i => i.category === 'PARCEL').length;
        const roughCategoryCount = stock.diamondItems.filter(i => i.category === 'ROUGH').length;
        
        let stockStatus = 'ACTIVE';
        if (!stock.isActive) {
          stockStatus = 'ARCHIVED';
        } else if (stock.diamondItems.length > 0 && soldCount === stock.diamondItems.length) {
          stockStatus = 'SOLD_OUT';
        } else if (soldCount > 0 && soldCount < stock.diamondItems.length) {
          stockStatus = 'PARTIAL';
        }

        return {
          id: stock.id,
          name: stock.name,
          stockName: stock.name,
          ledgers: stock.ledgers,
          reportGroup: 'Standard',
          location: 'Vault',
          itemType: 'Mix',
          shape: 'Mixed',
          cut: 'Mixed',
          clarity: 'Mixed',
          color: 'Mixed',
          caratWeight: caratWeight,
          caratRate: caratWeight > 0 ? totalValue / caratWeight : 0,
          totalValue: totalValue,
          status: stockStatus,
          remarks: stock.description,
          itemCount: activeItems.length,
          certifiedCount,
          nonCertifiedCount,
          roughCount,
          polishedCount,
          repairCount,
          singleCount,
          parcelCount,
          roughCategoryCount,
          version: 1,
          createdAt: stock.createdAt,
          updatedAt: stock.updatedAt,
          updatedBy: 'system'
        };
      });

      res.json({ success: true, data: mappedStocks, total });
    } catch (error) {
      next(error);
    }
  };

  createStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stockCode = req.body.stockName.toUpperCase().replace(/\s+/g, '_');
      
      // Check for duplicate stock code
      const existing = await prisma.stock.findUnique({ where: { stockCode } });
      if (existing) {
        res.status(409).json({ success: false, error: `A stock with code "${stockCode}" already exists.` });
        return;
      }

      const stock = await prisma.stock.create({
        data: {
          stockCode,
          name: req.body.stockName,
          description: req.body.remarks,
          currency: 'INR'
        }
      });

      // Automatically create a default ledger for the stock
      const ledger = await prisma.ledger.create({
        data: {
          stockId: stock.id,
          ledgerType: 'DEFAULT',
          name: `${stock.name} Ledger`
        }
      });

      // Insert initial diamond item using a transaction
      // Only if caratWeight is provided > 0
      if (req.body.caratWeight && req.body.caratWeight > 0) {
        await transactionService.createTransaction({
          ledgerId: ledger.id,
          transactionType: TransactionType.ADD_IN as any,
          transactionDate: new Date(),
          createdBy: (req as any).user?.username || 'system',
          remarks: 'Opening Balance for New Stock Parcel',
          totalCarat: parseFloat(req.body.caratWeight),
          totalValue: parseFloat(req.body.caratWeight) * parseFloat(req.body.caratRate || 0),
          items: [
            {
              itemCode: `${stock.stockCode}-001`,
              carat: parseFloat(req.body.caratWeight),
              ratePerCarat: parseFloat(req.body.caratRate || 0),
              totalValue: parseFloat(req.body.caratWeight) * parseFloat(req.body.caratRate || 0),
              itemAction: TransactionItemAction.IN as any,
              shape: req.body.shape,
              color: req.body.color,
              clarity: req.body.clarity,
              cut: req.body.cut,
              category: req.body.itemType === 'Single' ? 'SINGLE' : 'MIX',
              polish: req.body.itemType === 'Mix' ? (req.body.mixState === 'Rough' ? 'ROUGH' : 'POLISHED') : undefined,
              linkedCertificateId: req.body.linkedCertificateId,
              certCost: req.body.certCost ? parseFloat(req.body.certCost) : undefined,
              repairType: req.body.repairType,
              repairVendorId: req.body.repairVendorId,
              repairCost: req.body.repairCost ? parseFloat(req.body.repairCost) : undefined
            }
          ]
        });
      }

      res.status(201).json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  };

  updateStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const dataToUpdate: any = {
        name: req.body.stockName,
        description: req.body.remarks,
      };
      if (req.body.isActive !== undefined) {
        dataToUpdate.isActive = Boolean(req.body.isActive);
      } else if (req.body.status !== undefined) {
        dataToUpdate.isActive = req.body.status !== 'ARCHIVED';
      }

      const stock = await prisma.stock.update({
        where: { id },
        data: dataToUpdate
      });
      res.json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  };

  deleteStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      await prisma.stock.update({
        where: { id },
        data: { isActive: false }
      });
      res.json({ success: true, message: 'Stock deleted' });
    } catch (error) {
      next(error);
    }
  };

  getStockItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stockId = req.params.id as string;
      const diamondWhere = buildDiamondWhereClause(req.query);
      
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 1000;

      const [total, items] = await prisma.$transaction([
        prisma.diamondItem.count({ where: { stockId, ...diamondWhere } }),
        prisma.diamondItem.findMany({
          where: { stockId, ...diamondWhere },
          skip,
          take,
          include: {
            location: true,
            events: true,
            certifications: true,
            repairs: true
          }
        })
      ]);
      res.json({ success: true, data: items, total });
    } catch (error) {
      next(error);
    }
  };
}
