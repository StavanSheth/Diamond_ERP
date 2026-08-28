import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';
import { transactionService } from '../../services/transaction.service';
import { TransactionType, TransactionItemAction } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';

export class StockController {
  
  getStocks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const hasFilters = Object.keys(diamondWhere).length > 0;

      const stocks = await prisma.stock.findMany({
        where: hasFilters ? {
          diamondItems: {
            some: diamondWhere
          }
        } : undefined,
        include: {
          ledgers: true,
          diamondItems: {
            where: diamondWhere
          }
        }
      });
      
      const mappedStocks = stocks.map(stock => {
        const caratWeight = stock.diamondItems.reduce((sum, item) => sum + Number(item.carat), 0);
        const totalValue = stock.diamondItems.reduce((sum, item) => sum + Number(item.currentValue), 0);
        
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
          itemCount: stock.diamondItems.length,
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

      res.json({ success: true, data: mappedStocks });
    } catch (error) {
      next(error);
    }
  };

  createStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stock = await prisma.stock.create({
        data: {
          stockCode: req.body.stockName.toUpperCase().replace(/\s+/g, '_'),
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
          createdBy: 'system',
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
      const stock = await prisma.stock.update({
        where: { id },
        data: {
          name: req.body.stockName,
          description: req.body.remarks,
        }
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
      
      const items = await prisma.diamondItem.findMany({
        where: { stockId, ...diamondWhere },
        include: {
          location: true,
          events: true,
          certifications: true,
          repairs: true
        }
      });
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  };
}
