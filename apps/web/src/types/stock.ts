/**
 * StockItem — mirrors the backend model (Stock_Master).
 */
export interface StockItem {
  id: string;
  stockName: string;
  reportGroup: string;
  location: string;
  status: string;
  itemCount: number;
  caratWeight: number;
  totalValue: number;
  caratRate: number;
  transactionCount: number;
  repairCount?: number;
  certifiedCount?: number;
  nonCertifiedCount?: number;
  roughCount?: number;
  polishedCount?: number;
  singleCount?: number;
  parcelCount?: number;
  roughCategoryCount?: number;
  remarks: string;
  uuid: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CreateStockDTO {
  stockName: string;
  reportGroup?: string;
  location?: string;
  itemType?: string;
  shape?: string;
  cut?: string;
  clarity?: string;
  color?: string;
  caratWeight: number;
  caratRate: number;
  remarks?: string;
  itemCount?: number;
  mixCertification?: string;
  mixState?: string;
  linkedCertificateId?: string;
  labType?: string;
  internalNotes?: string;
  certCost?: string;
  repairType?: string;
  repairVendorId?: string;
  repairCost?: string;
}

export interface UpdateStockDTO extends CreateStockDTO {
  status?: string;
  version: number;
}

export interface PerformanceMetrics {
  requestTimeMs: number;
  googleApiTimeMs: number;
  processingTimeMs: number;
  totalTimeMs: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  syncStatus: 'success' | 'error' | 'partial';
  googleLatency: number;
  lastSyncedAt: string;
  requestId: string;
  performance: PerformanceMetrics;
}

export interface DashboardData {
  totalParcels: number;
  totalCarats: number;
  totalValue: number;
  recentActivity: Array<{
    id: string;
    action: string;
    parcel: string;
    carats: number;
    time: string;
  }>;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  provider: {
    connected: boolean;
    latencyMs: number;
  };
  metrics: {
    uptime: number;
    memory: any;
  };
}

export const REPORT_GROUPS = ['GIA', 'IGI', 'HRD', 'NON-CERT', 'MIX'];
export const LOCATIONS = [
  'Mumbai - Main Office',
  'Surat - Cutting Unit',
  'Hong Kong - Sales Office',
  'Dubai - Vault',
  'Antwerp - Grading',
];

export const SHAPES = ['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear', 'Marquise', 'Radiant', 'Heart', 'Asscher'];
export const CUTS = ['EX', 'VG', 'G', 'F', 'P'];
export const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];
export const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
export const STATUSES = ['ACTIVE', 'PARTIAL', 'SOLD_OUT', 'ARCHIVED'] as const;

/**
 * LedgerEntry — a single ledger row from Google Sheets.
 */
export interface LedgerEntry {
  ledgerId: string;
  transactionId: string;
  stockId: string;
  stockItemId: string;
  transactionDate: string;
  transactionType: string;
  partyId: string;
  brokerId: string;
  caratIn: number;
  caratOut: number;
  valueIn: number;
  valueOut: number;
  itemBalanceCarat: number;
  itemBalanceValue: number;
  stockBalanceCarat: number;
  stockBalanceValue: number;
  remarks: string;
  createdBy: string;
  partyName: string;
  stockName: string;
}

/**
 * LedgerStockOption — unique stocks for ledger filter.
 */
export interface LedgerStockOption {
  stockId: string;
  stockName: string;
  status: string;
}

// 20 predefined distinct colors mapped to 12 variations.
const STOCK_COLORS = [
  { bg: 'bg-[#E3F2FD]', text: 'text-[#1565C0]', border: 'border-[#90CAF9]' },
  { bg: 'bg-[#F3E5F5]', text: 'text-[#7B1FA2]', border: 'border-[#CE93D8]' },
  { bg: 'bg-[#E8F5E9]', text: 'text-[#2E7D32]', border: 'border-[#A5D6A7]' },
  { bg: 'bg-[#FFF3E0]', text: 'text-[#E65100]', border: 'border-[#FFCC80]' },
  { bg: 'bg-[#E0F7FA]', text: 'text-[#00838F]', border: 'border-[#80DEEA]' },
  { bg: 'bg-[#FBE9E7]', text: 'text-[#D84315]', border: 'border-[#FFAB91]' },
  { bg: 'bg-[#F1F8E9]', text: 'text-[#558B2F]', border: 'border-[#C5E1A5]' },
  { bg: 'bg-[#EFEBE9]', text: 'text-[#4E342E]', border: 'border-[#BCAAA4]' },
  { bg: 'bg-[#EDE7F6]', text: 'text-[#4527A0]', border: 'border-[#B39DDB]' },
  { bg: 'bg-[#FFF8E1]', text: 'text-[#F9A825]', border: 'border-[#FFE082]' },
  { bg: 'bg-[#FFEBEE]', text: 'text-[#C62828]', border: 'border-[#EF9A9A]' },
  { bg: 'bg-[#E0F2F1]', text: 'text-[#00695C]', border: 'border-[#80CBC4]' },
];

/**
 * Get a deterministic color scheme based on the stock name string.
 */
export function getStockColor(stockName: string) {
  let hash = 0;
  for (let i = 0; i < stockName.length; i++) {
    hash = stockName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % STOCK_COLORS.length;
  return STOCK_COLORS[index];
}
