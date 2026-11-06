"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeLedgerBalances = computeLedgerBalances;
exports.generateStockColorMap = generateStockColorMap;
const client_1 = require("@prisma/client");
/**
 * Compute running balances for a list of transactions.
 * Transactions must be sorted oldest-first (ASC by date).
 * Returns them in the same order with running balance fields appended.
 */
function computeLedgerBalances(transactionsAsc, openingCarat = 0, openingValue = 0) {
    let currentCarat = new client_1.Prisma.Decimal(openingCarat);
    let currentValue = new client_1.Prisma.Decimal(openingValue);
    return transactionsAsc.map(txn => {
        let caratIn = new client_1.Prisma.Decimal(0);
        let caratOut = new client_1.Prisma.Decimal(0);
        let valueIn = new client_1.Prisma.Decimal(0);
        let valueOut = new client_1.Prisma.Decimal(0);
        (txn.items || []).forEach(item => {
            if (item.itemAction === 'IN') {
                caratIn = caratIn.add(item.carat || 0);
                valueIn = valueIn.add(item.totalValue || 0);
            }
            else if (item.itemAction === 'OUT') {
                caratOut = caratOut.add(item.carat || 0);
                valueOut = valueOut.add(item.totalValue || 0);
            }
        });
        currentCarat = currentCarat.add(caratIn).sub(caratOut);
        currentValue = currentValue.add(valueIn).sub(valueOut);
        return {
            ...txn,
            caratIn: caratIn.toNumber(),
            caratOut: caratOut.toNumber(),
            valueIn: valueIn.toNumber(),
            valueOut: valueOut.toNumber(),
            balanceCarat: currentCarat.toNumber(),
            balanceValue: currentValue.toNumber(),
            itemsCount: (txn.items || []).length,
        };
    });
}
// ponytail: 20 pastel fills. Cycle if >20 stocks. Enough for any realistic diamond inventory.
const STOCK_COLORS = [
    'DCEEFB', 'D5F5E3', 'FEF9E7', 'FADBD8', 'E8DAEF',
    'D6EAF8', 'D1F2EB', 'FDEBD0', 'F5CBA7', 'D5D8DC',
    'AED6F1', 'A9DFBF', 'F9E79F', 'F5B7B1', 'D2B4DE',
    'A3E4D7', 'FAD7A0', 'ABEBC6', 'F0B27A', 'ABB2B9',
];
/**
 * Generate a deterministic stock-code → hex-color mapping.
 * Same stock always gets same color within a single export.
 */
function generateStockColorMap(stocks) {
    const map = new Map();
    const sorted = [...stocks].sort((a, b) => (a.stockCode || a.id || '').localeCompare(b.stockCode || b.id || ''));
    sorted.forEach((s, i) => {
        const key = s.stockCode || s.id || s.name || `stock-${i}`;
        map.set(key, STOCK_COLORS[i % STOCK_COLORS.length]);
    });
    return map;
}
//# sourceMappingURL=ledger.service.js.map