import { describe, it, expect } from 'vitest';
import { calculateTotalValue, computeRunningBalances, reconcileTotals } from '@diamond-erp/shared-utils';
import { PartyType, TransactionType } from '@diamond-erp/contracts';

describe('Domain Logic & Contracts Smoke Test', () => {
  it('correctly calculates diamond valuation', () => {
    const total = calculateTotalValue(1.5, 50000);
    expect(total).toBe(75000);
  });

  it('correctly calculates running balances across item actions', () => {
    const items = [
      { carat: 2.5, totalValue: 100000, itemAction: 'IN' },
      { carat: 1.0, totalValue: 40000, itemAction: 'OUT' },
    ];
    const { balanceCarat, balanceValue, caratIn, caratOut } = computeRunningBalances(items);
    expect(balanceCarat).toBe(1.5);
    expect(balanceValue).toBe(60000);
    expect(caratIn).toBe(2.5);
    expect(caratOut).toBe(1.0);
  });

  it('reconciles totals with precision tolerances', () => {
    const items = [
      { carat: 1.25, totalValue: 50000 },
      { carat: 0.75, totalValue: 30000 },
    ];
    const result = reconcileTotals(items, 2.0, 80000);
    expect(result.isValid).toBe(true);

    const badResult = reconcileTotals(items, 2.5, 80000);
    expect(badResult.isValid).toBe(false);
  });

  it('exposes unified PartyType enum with all expected roles', () => {
    expect(PartyType.CUSTOMER).toBe('CUSTOMER');
    expect(PartyType.BROKER).toBe('BROKER');
    expect(PartyType.BROKER_CLIENT).toBe('BROKER_CLIENT');
    expect(PartyType.SUPPLIER).toBe('SUPPLIER');
    expect(PartyType.WORKSHOP).toBe('WORKSHOP');
  });

  it('exposes unified TransactionType enum', () => {
    expect(TransactionType.PURCHASE).toBe('PURCHASE');
    expect(TransactionType.SALE).toBe('SALE');
    expect(TransactionType.REPAIR).toBe('REPAIR');
  });
});
