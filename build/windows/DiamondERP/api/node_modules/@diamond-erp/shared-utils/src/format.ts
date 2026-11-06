/**
 * Standard formatting utilities for Indian business numbers and currencies.
 */

export const getNumberLocale = (): string => 'en-IN';

export function formatCurrency(value: number | string | null | undefined, showSymbol = true): string {
  const num = Number(value) || 0;
  const formatted = num.toLocaleString(getNumberLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showSymbol ? `₹${formatted}` : formatted;
}

export function formatNumber(
  value: number | string | null | undefined,
  minDigits = 2,
  maxDigits = 2
): string {
  const num = Number(value) || 0;
  return num.toLocaleString(getNumberLocale(), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString(getNumberLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Sanitizes cell values to prevent CSV/Formula injection (CWE-1236).
 * If a string begins with =, +, -, @, \t, or \r, it prepends a single quote.
 */
export function sanitizeForSpreadsheet<T>(val: T): T {
  if (typeof val === 'string') {
    const trimmed = val.trimStart();
    if (
      trimmed.startsWith('=') ||
      trimmed.startsWith('+') ||
      trimmed.startsWith('-') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('\t') ||
      trimmed.startsWith('\r')
    ) {
      return `'${val}` as unknown as T;
    }
  }
  return val;
}

