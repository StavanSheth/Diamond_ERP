import { Prisma } from '@prisma/client';

const parseMulti = (val: any): string[] | undefined => {
  if (!val) return undefined;
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') {
    const list = val.split(',').map(s => s.trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  return [String(val)];
};

const GRADE_MAP: Record<string, string[]> = {
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

const expandVariants = (values: string[] | undefined): string[] | undefined => {
  if (!values || values.length === 0) return undefined;
  const result = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    result.add(trimmed);
    result.add(trimmed.toUpperCase());
    result.add(trimmed.toLowerCase());
    // Title Case (e.g. Round, Princess)
    result.add(trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
    
    // Check grade mapping
    const upper = trimmed.toUpperCase();
    if (GRADE_MAP[upper]) {
      for (const mapped of GRADE_MAP[upper]) {
        result.add(mapped);
      }
    }
  }
  return Array.from(result);
};

export const buildDiamondWhereClause = (query: any): Prisma.DiamondItemWhereInput => {
  const where: Prisma.DiamondItemWhereInput = {};

  if (query.category && query.category !== 'All') {
    where.category = query.category.toUpperCase();
  }
  
  const rawShapes = parseMulti(query.shape);
  const shapes = expandVariants(rawShapes?.filter(s => s !== 'All'));
  if (shapes && shapes.length > 0) {
    where.shape = shapes.length === 1 ? shapes[0] : { in: shapes };
  }

  const rawColors = parseMulti(query.color);
  const colors = expandVariants(rawColors?.filter(c => c !== 'All'));
  if (colors && colors.length > 0) {
    where.color = colors.length === 1 ? colors[0] : { in: colors };
  }

  const rawClarities = parseMulti(query.clarity);
  const clarities = expandVariants(rawClarities?.filter(c => c !== 'All'));
  if (clarities && clarities.length > 0) {
    where.clarity = clarities.length === 1 ? clarities[0] : { in: clarities };
  }

  const rawCuts = parseMulti(query.cut);
  const cuts = expandVariants(rawCuts?.filter(c => c !== 'All'));
  if (cuts && cuts.length > 0) {
    where.cut = cuts.length === 1 ? cuts[0] : { in: cuts };
  }

  const rawSymmetries = parseMulti(query.symmetry);
  const symmetries = expandVariants(rawSymmetries?.filter(s => s !== 'All'));
  if (symmetries && symmetries.length > 0) {
    where.symmetry = symmetries.length === 1 ? symmetries[0] : { in: symmetries };
  }

  const rawPolishes = parseMulti(query.polish);
  const polishes = expandVariants(rawPolishes?.filter(p => p !== 'All'));
  if (polishes && polishes.length > 0) {
    where.polish = polishes.length === 1 ? polishes[0] : { in: polishes };
  }
  
  if (query.minCarat || query.maxCarat) {
    where.carat = {};
    if (query.minCarat) where.carat.gte = parseFloat(query.minCarat);
    if (query.maxCarat) where.carat.lte = parseFloat(query.maxCarat);
  }

  if (query.minPrice || query.maxPrice) {
    where.currentValue = {};
    if (query.minPrice) where.currentValue.gte = parseFloat(query.minPrice);
    if (query.maxPrice) where.currentValue.lte = parseFloat(query.maxPrice);
  }

  // Type of Transaction - check if the diamond has an event matching the transaction type
  if (query.transactionType) {
    where.events = {
      some: {
        transaction: {
          transactionType: query.transactionType.toUpperCase()
        }
      }
    };
  }

  return where;
};
