import { Prisma } from '@prisma/client';

/**
 * Shared ledger calculation used by both LedgerController and SettingsController export.
 * Single source of truth for running balance computation.
 */

export interface LedgerTransaction {
  id: string;
  transactionNo: string;
  transactionDate: Date | null;
  transactionType: string;
  status: string;
  referenceNo: string | null;
  remarks: string | null;
  paymentType: string | null;
  paymentStatus: string | null;
  paymentDone: Prisma.Decimal | number | null;
  paymentDue: Prisma.Decimal | number | null;
  brokeragePercentage: Prisma.Decimal | number | null;
  brokerageAmount: Prisma.Decimal | number | null;
  brokerageType: string | null;
  ledgerId: string;
  items: Array<{
    id?: string;
    name?: string;
    carat: Prisma.Decimal | number | null;
    totalValue: Prisma.Decimal | number | null;
    itemAction: string | null;
    ratePerCarat?: Prisma.Decimal | number | null;
    quantity?: number | null;
    diamondItem?: any;
  }>;
  party?: { id: string; name: string; partyCode: string; partyType: string } | null;
  ledger?: { id: string; name: string; stockId: string; stock?: { id: string; name: string; stockCode?: string; description?: string } | null } | null;
}

export interface BalancedTransaction extends LedgerTransaction {
  caratIn: number;
  caratOut: number;
  valueIn: number;
  valueOut: number;
  balanceCarat: number;
  balanceValue: number;
  itemsCount: number;
}

/**
 * Compute running balances for a list of transactions.
 * Transactions must be sorted oldest-first (ASC by date).
 * Returns them in the same order with running balance fields appended.
 */
export function computeLedgerBalances(
  transactionsAsc: LedgerTransaction[],
  openingCarat: number = 0,
  openingValue: number = 0,
): BalancedTransaction[] {
  let currentCarat = new Prisma.Decimal(openingCarat);
  let currentValue = new Prisma.Decimal(openingValue);

  return transactionsAsc.map(txn => {
    let caratIn = new Prisma.Decimal(0);
    let caratOut = new Prisma.Decimal(0);
    let valueIn = new Prisma.Decimal(0);
    let valueOut = new Prisma.Decimal(0);

    (txn.items || []).forEach(item => {
      if (item.itemAction === 'IN') {
        caratIn = caratIn.add(item.carat || 0);
        valueIn = valueIn.add(item.totalValue || 0);
      } else if (item.itemAction === 'OUT') {
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
export function generateStockColorMap(
  stocks: Array<{ stockCode?: string; id?: string; name?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  const sorted = [...stocks].sort((a, b) =>
    (a.stockCode || a.id || '').localeCompare(b.stockCode || b.id || '')
  );
  sorted.forEach((s, i) => {
    const key = s.stockCode || s.id || s.name || `stock-${i}`;
    map.set(key, STOCK_COLORS[i % STOCK_COLORS.length]);
  });
  return map;
}
