/**
 * Shared filter and query string utilities.
 */

export const GRADE_MAP: Record<string, string[]> = {
  EX: ['EX', 'Excellent', 'EXCELLENT', 'ex', 'excellent'],
  EXCELLENT: ['EX', 'Excellent', 'EXCELLENT', 'ex', 'excellent'],
  VG: ['VG', 'Very Good', 'VERY GOOD', 'vg', 'very good', 'Very good'],
  'VERY GOOD': ['VG', 'Very Good', 'VERY GOOD', 'vg', 'very good', 'Very good'],
  G: ['G', 'Good', 'GOOD', 'g', 'good'],
  GOOD: ['G', 'Good', 'GOOD', 'g', 'good'],
  F: ['F', 'Fair', 'FAIR', 'f', 'fair'],
  FAIR: ['F', 'Fair', 'FAIR', 'f', 'fair'],
  P: ['P', 'Poor', 'POOR', 'p', 'poor'],
  POOR: ['P', 'Poor', 'POOR', 'p', 'poor'],
};

export const parseMulti = (val: any): string[] | undefined => {
  if (!val) return undefined;
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') {
    const list = val.split(',').map((s) => s.trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  return [String(val)];
};

export const expandVariants = (values: string[] | undefined): string[] | undefined => {
  if (!values || values.length === 0) return undefined;
  const result = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    result.add(trimmed);
    result.add(trimmed.toUpperCase());
    result.add(trimmed.toLowerCase());
    result.add(trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());

    const upper = trimmed.toUpperCase();
    if (GRADE_MAP[upper]) {
      for (const mapped of GRADE_MAP[upper]) {
        result.add(mapped);
      }
    }
  }
  return Array.from(result);
};

export function buildFilterQueryString(filters?: Record<string, any>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== 'All' && value !== '') {
      if (Array.isArray(value)) {
        if (value.length > 0) params.append(key, value.join(','));
      } else {
        params.append(key, String(value));
      }
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
