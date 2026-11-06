"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_utils_1 = require("@diamond-erp/shared-utils");
const contracts_1 = require("@diamond-erp/contracts");
(0, vitest_1.describe)('Domain Logic & Contracts Smoke Test', () => {
    (0, vitest_1.it)('correctly calculates diamond valuation', () => {
        const total = (0, shared_utils_1.calculateTotalValue)(1.5, 50000);
        (0, vitest_1.expect)(total).toBe(75000);
    });
    (0, vitest_1.it)('correctly calculates running balances across item actions', () => {
        const items = [
            { carat: 2.5, totalValue: 100000, itemAction: 'IN' },
            { carat: 1.0, totalValue: 40000, itemAction: 'OUT' },
        ];
        const { balanceCarat, balanceValue, caratIn, caratOut } = (0, shared_utils_1.computeRunningBalances)(items);
        (0, vitest_1.expect)(balanceCarat).toBe(1.5);
        (0, vitest_1.expect)(balanceValue).toBe(60000);
        (0, vitest_1.expect)(caratIn).toBe(2.5);
        (0, vitest_1.expect)(caratOut).toBe(1.0);
    });
    (0, vitest_1.it)('reconciles totals with precision tolerances', () => {
        const items = [
            { carat: 1.25, totalValue: 50000 },
            { carat: 0.75, totalValue: 30000 },
        ];
        const result = (0, shared_utils_1.reconcileTotals)(items, 2.0, 80000);
        (0, vitest_1.expect)(result.isValid).toBe(true);
        const badResult = (0, shared_utils_1.reconcileTotals)(items, 2.5, 80000);
        (0, vitest_1.expect)(badResult.isValid).toBe(false);
    });
    (0, vitest_1.it)('exposes unified PartyType enum with all expected roles', () => {
        (0, vitest_1.expect)(contracts_1.PartyType.CUSTOMER).toBe('CUSTOMER');
        (0, vitest_1.expect)(contracts_1.PartyType.BROKER).toBe('BROKER');
        (0, vitest_1.expect)(contracts_1.PartyType.BROKER_CLIENT).toBe('BROKER_CLIENT');
        (0, vitest_1.expect)(contracts_1.PartyType.SUPPLIER).toBe('SUPPLIER');
        (0, vitest_1.expect)(contracts_1.PartyType.WORKSHOP).toBe('WORKSHOP');
    });
    (0, vitest_1.it)('exposes unified TransactionType enum', () => {
        (0, vitest_1.expect)(contracts_1.TransactionType.PURCHASE).toBe('PURCHASE');
        (0, vitest_1.expect)(contracts_1.TransactionType.SALE).toBe('SALE');
        (0, vitest_1.expect)(contracts_1.TransactionType.REPAIR).toBe('REPAIR');
    });
});
//# sourceMappingURL=smoke.test.js.map