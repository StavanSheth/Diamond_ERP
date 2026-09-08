import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { StockItem, PartyItem } from '@diamond-erp/contracts';

let cachedStocks: StockItem[] | null = null;
let cachedParties: PartyItem[] | null = null;
let inFlightFetch: Promise<[StockItem[], PartyItem[]]> | null = null;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((listener) => listener());
}

export function invalidateReferenceData() {
  cachedStocks = null;
  cachedParties = null;
  inFlightFetch = null;
}

export function useReferenceData() {
  const [stocks, setStocks] = useState<StockItem[]>(cachedStocks || []);
  const [parties, setParties] = useState<PartyItem[]>(cachedParties || []);
  const [loading, setLoading] = useState<boolean>(!cachedStocks || !cachedParties);
  const [error, setError] = useState<string | null>(null);

  const fetchReferenceData = useCallback(async (force = false) => {
    if (force) {
      invalidateReferenceData();
    }

    if (cachedStocks && cachedParties && !force) {
      setStocks(cachedStocks);
      setParties(cachedParties);
      setLoading(false);
      return;
    }

    if (!inFlightFetch) {
      inFlightFetch = Promise.all([
        api.getStocks().then((res) => (res.success && Array.isArray(res.data) ? res.data : [])).catch(() => []),
        api.getParties().then((res) => (res.success && Array.isArray(res.data) ? res.data : [])).catch(() => []),
      ]);
    }

    try {
      setLoading(true);
      const [sData, pData] = await inFlightFetch;
      cachedStocks = sData;
      cachedParties = pData;
      setStocks(sData);
      setParties(pData);
      notifyAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch reference data');
    } finally {
      inFlightFetch = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      if (cachedStocks) setStocks(cachedStocks);
      if (cachedParties) setParties(cachedParties);
    };

    listeners.add(handleUpdate);

    if (!cachedStocks || !cachedParties) {
      fetchReferenceData();
    }

    return () => {
      listeners.delete(handleUpdate);
    };
  }, [fetchReferenceData]);

  return {
    stocks,
    parties,
    loading,
    error,
    refresh: () => fetchReferenceData(true),
  };
}
