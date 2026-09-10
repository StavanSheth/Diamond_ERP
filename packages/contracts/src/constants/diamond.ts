export const SHAPES = [
  'Round',
  'Princess',
  'Cushion',
  'Emerald',
  'Oval',
  'Pear',
  'Marquise',
  'Radiant',
  'Heart',
  'Asscher',
] as const;

export const CUTS = ['EX', 'VG', 'G', 'F', 'P'] as const;

export const CLARITIES = [
  'FL',
  'IF',
  'VVS1',
  'VVS2',
  'VS1',
  'VS2',
  'SI1',
  'SI2',
  'I1',
  'I2',
  'I3',
] as const;

export const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;

export const SYMMETRIES = ['EX', 'VG', 'G', 'F', 'P'] as const;

export const POLISHES = ['EX', 'VG', 'G', 'F', 'P'] as const;

export const STATUSES = ['ACTIVE', 'PARTIAL', 'SOLD_OUT', 'ARCHIVED'] as const;

export const REPORT_GROUPS = ['GIA', 'IGI', 'HRD', 'NON-CERT', 'MIX'] as const;

export const DEFAULT_LOCATION = 'Not Specified';

export const LOCATIONS = [
  'Mumbai - BKC',
] as const;

export const FINANCIAL_YEARS = [
  { id: '2024-25', label: 'FY 24-25 (01 Apr 2024 – 31 Mar 2025)' },
  { id: '2025-26', label: 'FY 25-26 (01 Apr 2025 – 31 Mar 2026)' },
  { id: '2026-27', label: 'FY 26-27 (01 Apr 2026 – 31 Mar 2027)' },
  { id: 'ALL_TIME', label: 'All Time History' },
] as const;
