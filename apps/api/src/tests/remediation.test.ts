import { describe, it, expect } from 'vitest';
import { buildDiamondWhereClause } from '../utils/filter.utils';
import { reportsService } from '../modules/reports/reports.service';
import { calculateTotalValue, computeRunningBalances } from '@diamond-erp/shared-utils';

describe('Production Remediation Verification Suite', () => {
  describe('Diamond Multi-Filter Parsing (buildDiamondWhereClause)', () => {
    it('generates multi-shape case-expanded IN filter', () => {
      const where = buildDiamondWhereClause({ shape: 'Round, Princess' });
      expect(where.shape).toBeDefined();
      expect(typeof where.shape).toBe('object');
      const inShapes = (where.shape as any).in;
      expect(inShapes).toContain('ROUND');
      expect(inShapes).toContain('Princess');
      expect(inShapes).toContain('round');
    });

    it('handles numeric carat ranges', () => {
      const where = buildDiamondWhereClause({ minCarat: '1.0', maxCarat: '2.5' });
      expect(where.carat).toBeDefined();
      expect((where.carat as any).gte).toBe(1.0);
      expect((where.carat as any).lte).toBe(2.5);
    });

    it('maps EX grade variants for cut / polish / symmetry', () => {
      const where = buildDiamondWhereClause({ cut: 'EX' });
      const inCuts = (where.cut as any).in;
      expect(inCuts).toContain('EX');
      expect(inCuts).toContain('Excellent');
      expect(inCuts).toContain('EXCELLENT');
    });
  });

  describe('Inventory Valuation & Running Balances', () => {
    it('correctly calculates total value with rate per carat', () => {
      expect(calculateTotalValue(2.5, 4000)).toBe(10000);
      expect(calculateTotalValue(0, 5000)).toBe(0);
    });

    it('computes running inventory balances for IN vs OUT transactions', () => {
      const movements = [
        { carat: 5.0, totalValue: 50000, itemAction: 'IN' },
        { carat: 2.0, totalValue: 20000, itemAction: 'OUT' },
        { carat: 1.0, totalValue: 10000, itemAction: 'IN' }
      ];
      const balance = computeRunningBalances(movements);
      expect(balance.caratIn).toBe(6.0);
      expect(balance.caratOut).toBe(2.0);
      expect(balance.balanceCarat).toBe(4.0);
      expect(balance.balanceValue).toBe(40000);
    });

    it('simulates stock filtering excluding SOLD or WRITTEN_OFF diamonds', () => {
      const diamondItems = [
        { id: 'd1', carat: 1.5, currentValue: 15000, status: 'AVAILABLE' },
        { id: 'd2', carat: 2.0, currentValue: 20000, status: 'SOLD' },
        { id: 'd3', carat: 0.5, currentValue: 5000, status: 'WRITTEN_OFF' },
        { id: 'd4', carat: 1.0, currentValue: 10000, status: 'MEMO' },
      ];

      // Replicating stock.controller.ts and dashboard.controller.ts active filter
      const activeItems = diamondItems.filter(d => d.status !== 'SOLD' && d.status !== 'WRITTEN_OFF');
      const totalCarat = activeItems.reduce((acc, d) => acc + d.carat, 0);
      const totalValue = activeItems.reduce((acc, d) => acc + d.currentValue, 0);

      expect(totalCarat).toBe(2.5); // 1.5 + 1.0
      expect(totalValue).toBe(25000); // 15000 + 10000
    });
  });

  describe('Excel Export Streaming & Formatting', () => {
    it('successfully streams formatted Excel report without header column collision', async () => {
      const { PassThrough } = await import('stream');
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      const headers: Record<string, string> = {};

      stream.on('data', (chunk) => chunks.push(chunk));

      const mockResponse: any = stream;
      mockResponse.setHeader = (key: string, value: string) => {
        headers[key] = value;
      };

      // Export an inventory report
      await reportsService.exportExcel({ reportType: 'INVENTORY' }, mockResponse);

      const totalBuffer = Buffer.concat(chunks);
      expect(totalBuffer.length).toBeGreaterThan(0);
      expect(headers['Content-Type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(headers['Content-Disposition']).toContain('attachment; filename=');
    });
  });
});
