export {
  SHAPES,
  CUTS,
  CLARITIES,
  COLORS,
  SYMMETRIES,
  POLISHES,
  STATUSES,
  PartyType,
  TransactionType,
  ItemStatus,
  RepairStatus,
  CertificationStatus,
  CertificateState,
} from '@diamond-erp/contracts';
export * from '@diamond-erp/contracts';

/**
 * LedgerStockOption — unique stocks for ledger filter.
 */
export interface LedgerStockOption {
  stockId: string;
  stockName: string;
  status: string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  provider?: {
    connected: boolean;
    latencyMs: number;
  };
  metrics?: {
    uptime: number;
    memory: any;
  };
}
