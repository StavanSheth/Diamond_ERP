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
            locations: true,
            diamondItems: {
              where: diamondWhere,
              select: {
                carat: true,
                currentValue: true,
                certificateStatus: true,
                polish: true,
                status: true,
                category: true,
                shape: true,
                color: true,
                clarity: true,
                cut: true,
                location: { select: { name: true } },
              }
            }
          }
        })
      ]);
      
      const mappedStocks = stocks.map(stock => {
        let activeCount = 0;
        let caratWeight = 0;
        let totalValue = 0;
        let certifiedCount = 0;
        let nonCertifiedCount = 0;
        let roughCount = 0;
        let polishedCount = 0;
        let repairCount = 0;
        let soldCount = 0;
        let singleCount = 0;
        let parcelCount = 0;
        let roughCategoryCount = 0;

        for (const item of stock.diamondItems) {
          if (item.status !== 'SOLD' && item.status !== 'WRITTEN_OFF') {
            activeCount++;
            caratWeight += Number(item.carat);
            totalValue += Number(item.currentValue);
          }
          if (item.certificateStatus === 'ISSUED') {
            certifiedCount++;
          } else {
            nonCertifiedCount++;
          }
          if (item.polish === 'ROUGH') {
            roughCount++;
          } else if (item.polish !== null) {
            polishedCount++;
          }
          if (item.status === 'IN_REPAIR') {
            repairCount++;
          } else if (item.status === 'SOLD') {
            soldCount++;
          }
          if (item.category === 'SINGLE') {
            singleCount++;
          } else if (item.category === 'PARCEL') {
            parcelCount++;
          } else if (item.category === 'ROUGH') {
            roughCategoryCount++;
          }
        }
        
        let stockStatus = 'ACTIVE';
        if (!stock.isActive) {
          stockStatus = 'ARCHIVED';
        } else if (stock.diamondItems.length > 0 && soldCount === stock.diamondItems.length) {
          stockStatus = 'SOLD_OUT';
        } else if (soldCount > 0 && soldCount < stock.diamondItems.length) {
          stockStatus = 'PARTIAL';
        }

        // Bug #1/#2: Derive location and classification from actual diamond items & stock locations
        const locationNames = new Set<string>();
        for (const loc of (stock as any).locations || []) {
          if (loc.name) locationNames.add(loc.name);
        }
        const shapes = new Map<string, number>();
        const colors = new Map<string, number>();
        const clarities = new Map<string, number>();
        const cuts = new Map<string, number>();

        for (const item of stock.diamondItems) {
          if ((item as any).location?.name) locationNames.add((item as any).location.name);
          const incr = (m: Map<string, number>, v: string | null) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
          incr(shapes, (item as any).shape);
          incr(colors, (item as any).color);
          incr(clarities, (item as any).clarity);
          incr(cuts, (item as any).cut);
        }

        const mode = (m: Map<string, number>, fallback: string) => {
          if (m.size === 0) return fallback;
          if (m.size === 1) return m.keys().next().value || fallback;
          return 'Mixed';
        };

        return {
          id: stock.id,
          name: stock.name,
          stockName: stock.name,
          ledgers: stock.ledgers,
          reportGroup: stock.diamondItems.length > 0 ? (parcelCount > singleCount ? 'Parcel' : (roughCategoryCount > 0 ? 'Rough' : 'Standard')) : 'Standard',
          location: locationNames.size === 1 ? [...locationNames][0] : (locationNames.size > 1 ? 'Multiple' : 'Not Set'),
          itemType: parcelCount > 0 && singleCount > 0 ? 'Mix' : (parcelCount > 0 ? 'Parcel' : (singleCount > 0 ? 'Single' : 'Mix')),
          shape: mode(shapes, 'Mixed'),
          cut: mode(cuts, 'Mixed'),
          clarity: mode(clarities, 'Mixed'),
          color: mode(colors, 'Mixed'),
          caratWeight: caratWeight,
          caratRate: caratWeight > 0 ? totalValue / caratWeight : 0,
          totalValue: totalValue,
          status: stockStatus,
          remarks: stock.description,
          itemCount: activeCount,
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
          updatedBy: 'system' // ponytail: no updatedBy column on Stock, keep as-is
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

      // Persist storage location if provided
      let locationRecord: any = null;
      if (req.body.location) {
        locationRecord = await prisma.location.upsert({
          where: { stockId_name: { stockId: stock.id, name: req.body.location } },
          create: { stockId: stock.id, name: req.body.location, locationType: 'WAREHOUSE' },
          update: {},
        });
      }

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
              toLocationId: locationRecord?.id,
              shape: req.body.shape || 'MIX',
              color: req.body.color || 'MIX',
              clarity: req.body.clarity || 'MIX',
              cut: req.body.cut || 'MIX',
              category: req.body.itemType === 'Single' ? 'SINGLE' : 'MIX',
              polish: req.body.itemType === 'Mix' ? (req.body.mixState === 'Rough' ? 'ROUGH' : 'POLISHED') : (req.body.itemType === 'Rough' ? 'ROUGH' : undefined),
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

      if (req.body.location) {
        const loc = await prisma.location.upsert({
          where: { stockId_name: { stockId: id, name: req.body.location } },
          create: { stockId: id, name: req.body.location, locationType: 'WAREHOUSE' },
          update: {},
        });
        await prisma.diamondItem.updateMany({
          where: { stockId: id },
          data: { locationId: loc.id }
        });
      }

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
