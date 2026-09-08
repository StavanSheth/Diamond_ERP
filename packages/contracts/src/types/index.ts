import {
  PartyType,
  TransactionType,
  TransactionItemAction,
  RepairStatus,
  RepairType,
  CertificationStatus,
  PaymentStatus,
  BrokerageType,
} from '../enums';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockItem {
  id: string;
  name?: string;
  stockName: string;
  reportGroup: string;
  location: string;
  status: string;
  itemCount: number;
  caratWeight: number;
  totalValue: number;
  caratRate: number;
  transactionCount: number;
  repairCount: number;
  certifiedCount: number;
  nonCertifiedCount: number;
  roughCount: number;
  polishedCount: number;
  singleCount: number;
  parcelCount: number;
  roughCategoryCount: number;
  soldCount: number;
  remarks: string;
  uuid?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
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
  certCost?: string | number;
  repairType?: string;
  repairVendorId?: string;
  repairCost?: string | number;
}

export interface UpdateStockDTO extends CreateStockDTO {
  status?: string;
  isActive?: boolean;
  version?: number;
}

export interface LedgerEntry {
  id?: string;
  ledgerId: string;
  sequenceNumber?: number;
  transactionId?: string;
  transactionNo?: string;
  stockId: string;
  stockItemId?: string;
  transactionDate: string;
  transactionType: TransactionType | string;
  partyId: string;
  brokerId?: string;
  caratIn: number;
  caratOut: number;
  valueIn: number;
  valueOut: number;
  balanceCarat?: number;
  balanceValue?: number;
  itemBalanceCarat?: number;
  itemBalanceValue?: number;
  stockBalanceCarat?: number;
  stockBalanceValue?: number;
  remarks: string;
  createdBy: string;
  partyName: string;
  stockName: string;
  brokeragePercentage?: number;
  brokerageAmount?: number;
  brokerageType?: BrokerageType | string;
  paymentStatus?: PaymentStatus | string;
  paymentDone?: number;
  paymentDue?: number;
  itemsCount?: number;
}

export interface TransactionItemDTO {
  diamondItemId?: string;
  existingDiamondId?: string;
  itemCode?: string;
  name?: string;
  displayName?: string;
  carat: number;
  color?: string;
  clarity?: string;
  cut?: string;
  shape?: string;
  ratePerCarat: number;
  totalValue: number;
  itemAction: TransactionItemAction | 'IN' | 'OUT';
  category?: string;
  polish?: string;
  symmetry?: string;
  linkedCertificateId?: string;
  labType?: string;
  certCost?: number;
  repairType?: string;
  repairVendorId?: string;
  repairCost?: number;
  linkedRepairId?: string;
}

export interface CreateTransactionDTO {
  ledgerId: string;
  txnType?: TransactionType | string;
  transactionType?: TransactionType | string;
  transactionDate: string | Date;
  partyId?: string;
  brokeragePercentage?: number;
  brokerageAmount?: number;
  brokerageType?: BrokerageType | 'INCLUSIVE' | 'EXCLUSIVE';
  remarks?: string;
  referenceNo?: string;
  paymentStatus?: PaymentStatus | string;
  paymentDone?: number;
  paymentDue?: number;
  totalCarat: number;
  totalValue: number;
  items: TransactionItemDTO[];
  createdBy?: string;
}

export interface PartyItem {
  id: string;
  partyId?: string;
  partyCode?: string;
  name: string;
  partyName?: string;
  partyType: PartyType | string;
  type?: string;
  nickname?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  contactPerson?: string;
  brokeragePercentage?: number;
  outstandingBalance?: number;
  lastTxDate?: string | Date;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CertificateItem {
  id: string;
  certificateId?: string;
  reportNumber?: string;
  certNumber?: string;
  lab?: string;
  labType?: string;
  diamondItemId?: string;
  itemCode?: string;
  stockItemId?: string;
  stockName?: string;
  itemName?: string;
  carat?: number;
  color?: string;
  clarity?: string;
  cut?: string;
  shape?: string;
  status?: CertificationStatus | string;
  certificateStatus?: CertificationStatus | string;
  issueDate?: string;
  createdDate?: string | Date;
  cost?: number;
  fileUrl?: string;
  pdfPath?: string;
  proportionDiagramPath?: string;
  inclusionPlotPath?: string;
  remarks?: string;
}

export interface RepairItem {
  id: string;
  repairId?: string;
  diamondItemId?: string;
  stockItemId?: string;
  stockName?: string;
  itemName?: string;
  weight?: number;
  caratBefore?: number;
  caratAfter?: number;
  status: RepairStatus | string;
  repairType: RepairType | string;
  vendor?: string;
  vendorPartyId?: string;
  estCost?: number;
  cost?: number;
  finalCost?: number;
  dueDate?: string;
  dateSent?: string | Date;
  dateCompleted?: string | Date;
  remarks?: string;
}

export interface PerformanceMetrics {
  requestTimeMs: number;
  processingTimeMs: number;
  totalTimeMs: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  requestId?: string;
  timestamp?: string;
  syncStatus?: 'success' | 'error' | 'partial' | string;
  lastSyncedAt?: string;
  performance?: PerformanceMetrics;
}

export interface DashboardData {
  totalParcels?: number;
  totalCarats: number;
  totalValue?: number;
  totalStockValue?: number;
  activeParcels?: number;
  avgRatePerCarat?: number;
  stocksByStatus?: Record<string, number>;
  topStocks?: Array<{
    id: string;
    stockName: string;
    totalValue: number;
    caratWeight: number;
    status: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    stockName?: string;
    parcel?: string;
    carats?: number;
    time?: string;
    updatedAt?: string;
    updatedBy?: string;
  }>;
}

export interface AppLockSettings {
  enabled: boolean;
  timeoutMinutes: number;
  hasDeviceAuth: boolean;
  hasPinBackup: boolean;
}

export interface AdvancedItemFilters {
  category?: string;
  transactionType?: string;
  shape?: string;
  color?: string;
  clarity?: string;
  cut?: string;
  symmetry?: string;
  polish?: string;
  minCarat?: string;
  maxCarat?: string;
  minPrice?: string;
  maxPrice?: string;
  paymentDirection?: string;
  agingDays?: string;
}
