/**
 * Performance metrics attached to every API response.
 */
export interface PerformanceMetrics {
  requestTimeMs: number;
  googleApiTimeMs: number;
  processingTimeMs: number;
  totalTimeMs: number;
}

/**
 * Standardized API response envelope.
 * Every endpoint returns this shape.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  syncStatus: 'success' | 'error' | 'partial';
  googleLatency: number;
  lastSyncedAt: string;
  requestId: string;
  performance: PerformanceMetrics;
  error?: string;
}

/**
 * Health check response.
 */
export interface HealthResponse {
  backend: 'OK' | 'ERROR';
  google: 'Connected' | 'Disconnected';
  sheet: 'Reachable' | 'Unreachable';
  lastSync: string | null;
  uptime: number;
  requestId: string;
}

/**
 * Dashboard KPIs computed from stock data.
 */
export interface DashboardData {
  totalStockValue: number;
  totalCarats: number;
  activeParcels: number;
  avgRatePerCarat: number;
  stocksByStatus: Record<string, number>;
  topStocks: Array<{
    id: string;
    stockName: string;
    totalValue: number;
    caratWeight: number;
    status: string;
  }>;
  recentActivity: Array<{
    id: string;
    stockName: string;
    action: string;
    updatedAt: string;
    updatedBy: string;
  }>;
}
