import { SHAPES, COLORS, CLARITIES, CUTS, SYMMETRIES, POLISHES } from '../../types/stock';

export const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Aliases for backward compatibility
export const SHAPE_OPTIONS = SHAPES;
export const COLOR_OPTIONS = COLORS;
export const CLARITY_OPTIONS = CLARITIES;
export const CUT_OPTIONS = CUTS;
export const SYMMETRY_OPTIONS = SYMMETRIES;
export const POLISH_OPTIONS = POLISHES;

export const FY_OPTIONS = [
  { id: '2024-25', label: 'FY 24-25 (01 Apr 2024 – 31 Mar 2025)' },
  { id: '2025-26', label: 'FY 25-26 (01 Apr 2025 – 31 Mar 2026)' },
  { id: '2026-27', label: 'FY 26-27 (01 Apr 2026 – 31 Mar 2027)' },
  { id: 'ALL_TIME', label: 'All Time History' },
];

export const PARTY_TYPE_OPTIONS = [
  { id: 'CLIENT', label: 'Client / Customer' },
  { id: 'SUPPLIER', label: 'Supplier' },
  { id: 'BROKER', label: 'Broker' },
  { id: 'MIX', label: 'Mix (Broker & Client)' },
];

export const STATUS_OPTIONS = [
  { id: 'AVAILABLE', label: 'Available / Active' },
  { id: 'SOLD', label: 'Sold / Completed' },
  { id: 'MEMO', label: 'Memo / Consignment' },
  { id: 'IN_REPAIR', label: 'In Workshop / Repair' },
  { id: 'ARCHIVED', label: 'Archived' },
];

export interface QuickPreset {
  id: string;
  title: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  reportType: string;
  icon: string;
  desc: string;
  hasYearSelector?: boolean;
}

export const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'preset-fy-statement',
    title: 'Financial Year (FY)',
    badge: 'Statutory Filing',
    badgeBg: 'bg-blue-50 border-blue-200',
    badgeText: 'text-blue-700',
    reportType: 'FY_25_26',
    icon: 'account_balance',
    desc: 'Annual statement with Debit (Dr / In), Credit (Cr / Out), running balances & brokerage breakdown',
    hasYearSelector: true,
  },
  {
    id: 'preset-pl-statement',
    title: 'Profit & Loss (P&L)',
    badge: 'Banking Standard',
    badgeBg: 'bg-emerald-50 border-emerald-200',
    badgeText: 'text-emerald-700',
    reportType: 'PROFIT_AND_LOSS',
    icon: 'query_stats',
    desc: 'Audited banking schedule: Revenue, COGS with inventory adjustment, Gross Margin & EBITDA',
    hasYearSelector: true,
  },
  {
    id: 'preset-physical-audit',
    title: 'Stock Reconciliation Audit',
    badge: 'Compliance & Audit',
    badgeBg: 'bg-purple-50 border-purple-200',
    badgeText: 'text-purple-700',
    reportType: 'AUDIT_RECONCILIATION',
    icon: 'fact_check',
    desc: 'Verify ledger book balance vs physical verified carat weight with discrepancy tolerances',
  },
  {
    id: 'preset-stone-register',
    title: 'Granular Stone Register',
    badge: 'Item-Level 4Cs',
    badgeBg: 'bg-indigo-50 border-indigo-200',
    badgeText: 'text-indigo-700',
    reportType: 'INVENTORY_ITEMS',
    icon: 'diamond',
    desc: 'Inventory stone register covering all stones with 4Cs, certificates, status & valuations',
  },
  {
    id: 'preset-brokerage-audit',
    title: 'Brokerage Commission Audit',
    badge: 'Broker Ledger',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-700',
    reportType: 'BROKERAGE',
    icon: 'handshake',
    desc: 'Brokered transaction audit, % commissions, and Inclusive vs Exclusive payouts',
  },
];
