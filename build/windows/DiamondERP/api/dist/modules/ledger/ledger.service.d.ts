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
    party?: {
        id: string;
        name: string;
        partyCode: string;
        partyType: string;
    } | null;
    ledger?: {
        id: string;
        name: string;
        stockId: string;
        stock?: {
            id: string;
            name: string;
            stockCode?: string;
            description?: string;
        } | null;
    } | null;
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
export declare function computeLedgerBalances(transactionsAsc: LedgerTransaction[], openingCarat?: number, openingValue?: number): BalancedTransaction[];
/**
 * Generate a deterministic stock-code → hex-color mapping.
 * Same stock always gets same color within a single export.
 */
export declare function generateStockColorMap(stocks: Array<{
    stockCode?: string;
    id?: string;
    name?: string;
}>): Map<string, string>;
//# sourceMappingURL=ledger.service.d.ts.map