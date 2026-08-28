"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
const transaction_service_1 = require("../../services/transaction.service");
const enums_1 = require("../../types/enums");
class StockController {
    constructor() {
        this.getStocks = async (_req, res, next) => {
            try {
                const stocks = await prisma_1.default.stock.findMany({
                    include: {
                        ledgers: true,
                        diamondItems: true
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
                    }
                    else if (stock.diamondItems.length > 0 && soldCount === stock.diamondItems.length) {
                        stockStatus = 'SOLD_OUT';
                    }
                    else if (soldCount > 0 && soldCount < stock.diamondItems.length) {
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
            }
            catch (error) {
                next(error);
            }
        };
        this.createStock = async (req, res, next) => {
            try {
                const stock = await prisma_1.default.stock.create({
                    data: {
                        stockCode: req.body.stockName.toUpperCase().replace(/\s+/g, '_'),
                        name: req.body.stockName,
                        description: req.body.remarks,
                        currency: 'INR'
                    }
                });
                // Automatically create a default ledger for the stock
                const ledger = await prisma_1.default.ledger.create({
                    data: {
                        stockId: stock.id,
                        ledgerType: 'DEFAULT',
                        name: `${stock.name} Ledger`
                    }
                });
                // Insert initial diamond item using a transaction
                // Only if caratWeight is provided > 0
                if (req.body.caratWeight && req.body.caratWeight > 0) {
                    await transaction_service_1.transactionService.createTransaction({
                        ledgerId: ledger.id,
                        transactionType: enums_1.TransactionType.ADD_IN,
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
                                itemAction: enums_1.TransactionItemAction.IN,
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
            }
            catch (error) {
                next(error);
            }
        };
        this.updateStock = async (req, res, next) => {
            try {
                const id = req.params.id;
                const stock = await prisma_1.default.stock.update({
                    where: { id },
                    data: {
                        name: req.body.stockName,
                        description: req.body.remarks,
                    }
                });
                res.json({ success: true, data: stock });
            }
            catch (error) {
                next(error);
            }
        };
        this.deleteStock = async (req, res, next) => {
            try {
                const id = req.params.id;
                await prisma_1.default.stock.update({
                    where: { id },
                    data: { isActive: false }
                });
                res.json({ success: true, message: 'Stock deleted' });
            }
            catch (error) {
                next(error);
            }
        };
        this.getStockItems = async (req, res, next) => {
            try {
                const stockId = req.params.id;
                const items = await prisma_1.default.diamondItem.findMany({
                    where: { stockId },
                    include: {
                        location: true,
                        events: true,
                        certifications: true,
                        repairs: true
                    }
                });
                res.json({ success: true, data: items });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.StockController = StockController;
//# sourceMappingURL=stock.controller.js.map