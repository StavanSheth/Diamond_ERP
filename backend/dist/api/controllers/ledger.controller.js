"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
const transaction_service_1 = require("../../services/transaction.service");
class LedgerController {
    constructor() {
        /**
         * GET /api/ledger
         * Returns all transactions with their items, ordered by date descending.
         */
        this.getAll = async (req, res, next) => {
            try {
                const { stockId, partyId, itemCode } = req.query;
                const whereCondition = {};
                if (stockId) {
                    whereCondition.ledger = { stockId: stockId };
                }
                if (partyId) {
                    whereCondition.partyId = partyId;
                }
                if (itemCode) {
                    whereCondition.items = {
                        some: {
                            diamondItem: {
                                itemCode: itemCode
                            }
                        }
                    };
                }
                const transactions = await prisma_1.default.transaction.findMany({
                    where: whereCondition,
                    include: {
                        ledger: { include: { stock: true } },
                        party: true,
                        items: { include: { diamondItem: true } },
                        inventoryMovements: true,
                        financialEntries: true
                    },
                    orderBy: { transactionDate: 'desc' }
                });
                // Calculate running balances on the fly (since ledger might have many transactions)
                // Actually the prompt said "Running balances should preferably be calculated from an ordered transaction stream"
                let currentCaratBalance = 0;
                let currentValueBalance = 0;
                const transactionsAsc = [...transactions].reverse();
                const balancedTransactions = transactionsAsc.map(txn => {
                    let caratIn = 0;
                    let caratOut = 0;
                    let valueIn = 0;
                    let valueOut = 0;
                    // Compute carat and value in/out from transaction items (TransactionItem stream)
                    txn.items.forEach(item => {
                        if (item.itemAction === 'IN') {
                            caratIn += Number(item.carat);
                            valueIn += Number(item.totalValue);
                        }
                        else if (item.itemAction === 'OUT') {
                            caratOut += Number(item.carat);
                            valueOut += Number(item.totalValue);
                        }
                    });
                    currentCaratBalance = currentCaratBalance + caratIn - caratOut;
                    currentValueBalance = currentValueBalance + valueIn - valueOut;
                    return {
                        ...txn,
                        caratIn,
                        caratOut,
                        valueIn,
                        valueOut,
                        balanceCarat: currentCaratBalance,
                        balanceValue: currentValueBalance,
                        itemsCount: txn.items.length
                    };
                });
                // Reverse back for display
                balancedTransactions.reverse();
                res.json({ success: true, data: balancedTransactions });
            }
            catch (err) {
                next(err);
            }
        };
        /**
         * POST /api/ledger
         * Create a transaction using TransactionService.
         */
        this.create = async (req, res, next) => {
            try {
                const payload = req.body;
                // Map payload to CreateTransactionPayload
                const transaction = await transaction_service_1.transactionService.createTransaction({
                    ledgerId: payload.ledgerId,
                    transactionType: payload.txnType,
                    transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
                    partyId: payload.partyId,
                    remarks: payload.remarks,
                    referenceNo: payload.referenceNo,
                    createdBy: payload.createdBy || 'system',
                    totalCarat: payload.totalCarat || (payload.items || []).reduce((sum, item) => sum + Number(item.carat || 0), 0),
                    totalValue: payload.totalValue || (payload.items || []).reduce((sum, item) => sum + Number(item.totalValue || 0), 0),
                    items: payload.items || []
                });
                res.json({ success: true, data: transaction });
            }
            catch (err) {
                next(err);
            }
        };
        /**
         * DELETE /api/ledger/:id
         * Soft deletes a transaction. Wait, rule 1: "Never delete historical transactions. Use reversal/correction transactions."
         * For the API, we can either throw an error or implement a reverse.
         */
        this.delete = async (_req, res, next) => {
            try {
                res.status(400).json({ success: false, error: 'Historical transactions cannot be deleted. Please create a reversal transaction instead.' });
            }
            catch (err) {
                next(err);
            }
        };
        this.update = async (req, res, next) => {
            try {
                const id = req.params.id;
                const payload = req.body;
                const transaction = await transaction_service_1.transactionService.updateTransaction(id, payload);
                res.json({ success: true, data: transaction });
            }
            catch (err) {
                next(err);
            }
        };
        this.getParties = async (_req, res, next) => {
            try {
                const parties = await prisma_1.default.party.findMany();
                res.json({ success: true, data: parties });
            }
            catch (err) {
                next(err);
            }
        };
        this.getStockNames = async (_req, res, next) => {
            try {
                const stocks = await prisma_1.default.stock.findMany();
                res.json({ success: true, data: stocks });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.LedgerController = LedgerController;
//# sourceMappingURL=ledger.controller.js.map