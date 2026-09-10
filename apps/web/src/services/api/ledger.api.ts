import { request } from './client';
import { LedgerEntry, LedgerStockOption } from '../../types/stock';

export const ledgerApi = {
  /** Get ledger entries, optionally filtered */
  getLedger(
    stockId?: string,
    partyId?: string,
    itemCode?: string,
    paymentStatus?: string,
    agingDays?: string | number,
    paymentDirection?: string
  ): Promise<{ success: boolean; data: LedgerEntry[]; count: number }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    if (agingDays) params.append('agingDays', String(agingDays));
    if (paymentDirection) params.append('paymentDirection', paymentDirection);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/ledger${qs}`);
  },

  /** Get ledger payment summary with optional aging filter */
  getPaymentSummary(
    stockId?: string,
    partyId?: string,
    itemCode?: string,
    agingDays?: string | number
  ): Promise<{
    success: boolean;
    data: {
      payableDue: number;
      payablePaid: number;
      receivableDue: number;
      receivableCollected: number;
      aging?: any;
    };
  }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    if (agingDays) params.append('agingDays', String(agingDays));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/ledger/payment-summary${qs}`);
  },

  /** Get stock names for filter dropdown */
  getLedgerStocks(): Promise<{ success: boolean; data: LedgerStockOption[] }> {
    return request('/api/ledger/stocks');
  },

  /** Get party names for transaction dropdown */
  getLedgerParties(): Promise<{ success: boolean; data: { partyId: string; partyName: string; type: string }[] }> {
    return request('/api/ledger/parties');
  },

  /** Create transaction */
  postLedger(data: any): Promise<any> {
    return request('/api/ledger', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update transaction */
  updateLedger(id: string, data: any): Promise<any> {
    return request(`/api/ledger/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete transaction - Note: Historical transactions are immutable in the ledger.
   * Attempting to delete will be rejected by the backend. Use a reversal transaction instead.
   */
  deleteLedger(id: string): Promise<any> {
    return request(`/api/ledger/${id}`, {
      method: 'DELETE',
    });
  },
};
