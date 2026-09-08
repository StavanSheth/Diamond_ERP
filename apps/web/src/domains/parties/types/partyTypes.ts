export type PartyType = 
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'BROKER'
  | 'BROKER_CLIENT'
  | 'WORKSHOP'
  | 'CERTIFICATION_LAB'
  | 'OTHER';

export interface PartyTypeConfig {
  value: PartyType;
  label: string;
  badgeText: string;
  badgeClass: string;
  dotColor: string;
  icon: string;
  description: string;
}

export const PARTY_TYPE_CONFIGS: Record<PartyType, PartyTypeConfig> = {
  CUSTOMER: {
    value: 'CUSTOMER',
    label: 'Customer',
    badgeText: 'Customer',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    dotColor: '#10b981',
    icon: 'person',
    description: 'Direct diamond buyer / retail client'
  },
  SUPPLIER: {
    value: 'SUPPLIER',
    label: 'Supplier',
    badgeText: 'Supplier',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
    dotColor: '#3b82f6',
    icon: 'local_shipping',
    description: 'Rough / polished rough supplier or vendor'
  },
  BROKER: {
    value: 'BROKER',
    label: 'Broker',
    badgeText: 'Broker',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80',
    dotColor: '#a855f7',
    icon: 'handshake',
    description: 'Middleman / intermediary earning brokerage commission'
  },
  BROKER_CLIENT: {
    value: 'BROKER_CLIENT',
    label: 'Broker & Client (Mix)',
    badgeText: 'Broker & Client',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    dotColor: '#6366f1',
    icon: 'join_inner',
    description: 'Dual-role entity: direct trader and commission broker'
  },
  WORKSHOP: {
    value: 'WORKSHOP',
    label: 'Workshop',
    badgeText: 'Workshop',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
    dotColor: '#f59e0b',
    icon: 'build',
    description: 'Cutting, polishing, and setting facility'
  },
  CERTIFICATION_LAB: {
    value: 'CERTIFICATION_LAB',
    label: 'Certification Lab',
    badgeText: 'Cert Lab',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
    dotColor: '#06b6d4',
    icon: 'workspace_premium',
    description: 'Grading agency (e.g. GIA, IGI, HRD)'
  },
  OTHER: {
    value: 'OTHER',
    label: 'Other',
    badgeText: 'Other',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/80',
    dotColor: '#64748b',
    icon: 'category',
    description: 'General party or miscellaneous contact'
  }
};

export const PARTY_TYPES: PartyTypeConfig[] = Object.values(PARTY_TYPE_CONFIGS);

export const isBrokerType = (type?: string): boolean => {
  if (!type) return false;
  const upper = type.toUpperCase().trim();
  return upper === 'BROKER' || upper === 'BROKER_CLIENT' || upper === 'BROKER & CLIENT' || upper === 'MIX';
};

export const getPartyTypeConfig = (type?: string): PartyTypeConfig => {
  if (!type) return PARTY_TYPE_CONFIGS.OTHER;
  const upper = type.toUpperCase().trim();
  if (upper === 'BROKER_CLIENT' || upper === 'BROKER & CLIENT' || upper === 'MIX') {
    return PARTY_TYPE_CONFIGS.BROKER_CLIENT;
  }
  return PARTY_TYPE_CONFIGS[upper as PartyType] || PARTY_TYPE_CONFIGS.OTHER;
};
