import { useState, useEffect, useCallback, useRef } from 'react';
import { StockItem, CreateStockDTO, UpdateStockDTO, PerformanceMetrics } from '../types/stock';
import { api, ApiError } from '../services/api';

interface UseStocksReturn {
  stocks: StockItem[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  performance: PerformanceMetrics | null;
  syncStatus: string;
  createStock: (dto: CreateStockDTO) => Promise<void>;
  updateStock: (id: string, dto: UpdateStockDTO) => Promise<void>;
  deleteStock: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing stock items with 3s polling.
 */
export function useStocks(): UseStocksReturn {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const intervalRef = useRef<number | null>(null);

  const fetchStocks = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setSyncStatus('syncing');
      const result = await api.getStocks();
      setStocks(result.data);
      setLastSyncedAt(result.lastSyncedAt);
      setPerformance(result.performance);
      setSyncStatus(result.syncStatus);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to fetch stocks';
      setError(message);
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s polling (Google Sheets API allows 60 reads/min/user)
  useEffect(() => {
    fetchStocks(true);
    intervalRef.current = window.setInterval(() => fetchStocks(false), 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStocks]);

  const createStock = useCallback(async (dto: CreateStockDTO) => {
    setLoading(true);
    try {
      const result = await api.createStock(dto);
      setStocks(result.data);
      setLastSyncedAt(result.lastSyncedAt);
      setPerformance(result.performance);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to create stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStock = useCallback(async (id: string, dto: UpdateStockDTO) => {
    setLoading(true);
    try {
      const result = await api.updateStock(id, dto);
      setStocks(result.data);
      setLastSyncedAt(result.lastSyncedAt);
      setPerformance(result.performance);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStock = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const result = await api.deleteStock(id);
      setStocks(result.data);
      setLastSyncedAt(result.lastSyncedAt);
      setPerformance(result.performance);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    stocks,
    loading,
    error,
    lastSyncedAt,
    performance,
    syncStatus,
    createStock,
    updateStock,
    deleteStock,
    refresh: () => fetchStocks(true),
  };
}
