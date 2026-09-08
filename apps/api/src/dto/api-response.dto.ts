export * from '@diamond-erp/contracts';

export interface PerformanceMetrics {
  requestTimeMs: number;
  processingTimeMs: number;
  totalTimeMs: number;
}

export interface HealthResponse {
  backend: 'OK' | 'ERROR';
  database?: 'Connected' | 'Disconnected';
  status: 'ok' | 'error';
  uptime: number;
  requestId?: string;
  timestamp?: string;
}
