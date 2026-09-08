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
      setStocks(Array.isArray(result?.data) ? result.data : []);
      setLastSyncedAt(result.lastSyncedAt ?? null);
      setPerformance(result.performance ?? null);
      setSyncStatus(result.syncStatus ?? 'success');
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to fetch stocks';
      setError(message);
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + periodic refresh (30s interval)
  // TODO: Consider reducing interval or switching to event-driven updates now that we use a local DB
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
      await api.createStock(dto);
      await fetchStocks(false);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to create stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchStocks]);

  const updateStock = useCallback(async (id: string, dto: UpdateStockDTO) => {
    setLoading(true);
    try {
      await api.updateStock(id, dto);
      await fetchStocks(false);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchStocks]);

  const deleteStock = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await api.deleteStock(id);
      await fetchStocks(false);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete stock';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchStocks]);

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
