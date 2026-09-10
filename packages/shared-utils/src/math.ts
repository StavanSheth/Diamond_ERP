/**
 * Pure domain calculations for diamond parcels and accounting entries.
 */

export function calculateTotalValue(caratWeight: number | string, caratRate: number | string): number {
  const cw = Number(caratWeight) || 0;
  const cr = Number(caratRate) || 0;
  return Math.round(cw * cr * 100) / 100;
}

export function calculateCaratRate(totalValue: number | string, caratWeight: number | string): number {
  const tv = Number(totalValue) || 0;
  const cw = Number(caratWeight) || 0;
  if (cw <= 0) return 0;
  return Math.round((tv / cw) * 100) / 100;
}

export interface BalanceItem {
  carat: number | string;
  totalValue: number | string;
  itemAction: 'IN' | 'OUT' | string;
}

export function computeRunningBalances(
  items: BalanceItem[],
  initialCarat = 0,
  initialValue = 0
): { balanceCarat: number; balanceValue: number; caratIn: number; caratOut: number; valueIn: number; valueOut: number } {
  let caratIn = 0;
  let caratOut = 0;
  let valueIn = 0;
  let valueOut = 0;

  for (const item of items) {
    const c = Number(item.carat) || 0;
    const v = Number(item.totalValue) || 0;
    if (item.itemAction === 'IN') {
      caratIn += c;
      valueIn += v;
    } else if (item.itemAction === 'OUT') {
      caratOut += c;
      valueOut += v;
    }
  }

  const balanceCarat = Math.round((initialCarat + caratIn - caratOut) * 1000) / 1000;
  const balanceValue = Math.round((initialValue + valueIn - valueOut) * 100) / 100;

  return {
    balanceCarat,
    balanceValue,
    caratIn: Math.round(caratIn * 1000) / 1000,
    caratOut: Math.round(caratOut * 1000) / 1000,
    valueIn: Math.round(valueIn * 100) / 100,
    valueOut: Math.round(valueOut * 100) / 100,
  };
}

export function reconcileTotals(
  items: Array<{ carat: number | string; totalValue: number | string }>,
  targetCarat: number | string,
  targetValue: number | string
): { isValid: boolean; caratDifference: number; valueDifference: number; message?: string } {
  const sumCarat = items.reduce((sum, item) => sum + (Number(item.carat) || 0), 0);
  const sumValue = items.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);

  const caratDiff = Math.abs(sumCarat - Number(targetCarat));
  const valueDiff = Math.abs(sumValue - Number(targetValue));

  const isCaratValid = caratDiff <= 0.001;
  const isValueValid = valueDiff <= 0.01;

  if (!isCaratValid) {
    return {
      isValid: false,
      caratDifference: caratDiff,
      valueDifference: valueDiff,
      message: `Carat reconciliation failed: items sum ${sumCarat} != total ${targetCarat}`,
    };
  }

  if (!isValueValid) {
    return {
      isValid: false,
      caratDifference: caratDiff,
      valueDifference: valueDiff,
      message: `Value reconciliation failed: items sum ${sumValue} != total ${targetValue}`,
    };
  }

  return { isValid: true, caratDifference: caratDiff, valueDifference: valueDiff };
}

/**
 * Safe numeric parser that rejects NaN, Infinity, negative values (by default),
 * and enforces finite bounds to eliminate injection of malformed numbers (Finding 61).
 */
export function parseSafeNumber(
  val: unknown,
  options: {
    min?: number;
    max?: number;
    allowNegative?: boolean;
    defaultValue?: number;
    fieldName?: string;
  } = {}
): number {
  const { min, max, allowNegative = false, defaultValue, fieldName = 'value' } = options;

  if (val === undefined || val === null || val === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required numeric field: ${fieldName}`);
  }

  const num = typeof val === 'number' ? val : Number(val);

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`Invalid ${fieldName}: must be a finite number`);
  }

  if (!allowNegative && num < 0) {
    throw new Error(`Invalid ${fieldName}: cannot be negative (got ${num})`);
  }

  if (min !== undefined && num < min) {
    throw new Error(`Invalid ${fieldName}: must be at least ${min} (got ${num})`);
  }

  if (max !== undefined && num > max) {
    throw new Error(`Invalid ${fieldName}: cannot exceed ${max} (got ${num})`);
  }

  return num;
}

