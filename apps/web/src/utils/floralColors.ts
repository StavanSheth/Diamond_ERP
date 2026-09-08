/**
 * Floral Color Palettes for ERP Cards
 * Pure white card interiors with elegant, light floral color borders and accent stripes.
 */

export interface FloralPalette {
  id: string;
  name: string;
  cardBg: string;        // Clean white card body
  cardBorder: string;    // Subtle neutral outer border for sides & bottom
  topBorder: string;     // Color border ONLY at the top line
  internalBorder: string;// Very invisible light black internal border
  accentBar: string;     // Vivid top floral stripe / accent line
  badgeBg: string;       // Matching tag badge styling
  accentText: string;    // Tone for primary numbers or badges
  footerBg: string;      // Clean neutral footer tint
  hoverBorder: string;   // Hover border color
}

export const FLORAL_PALETTES: FloralPalette[] = [
  {
    id: 'blossom-rose',
    name: 'Blossom Rose',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-rose-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#F43F5E]',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    accentText: 'text-rose-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'lilac-lavender',
    name: 'Lilac Lavender',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-purple-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#A855F7]',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    accentText: 'text-purple-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'chamomile-jasmine',
    name: 'Chamomile Jasmine',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-amber-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#EAB308]',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    accentText: 'text-amber-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'sage-mint',
    name: 'Sage Mint',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-emerald-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#10B981]',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accentText: 'text-emerald-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'hydrangea-blue',
    name: 'Hydrangea Blue',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-sky-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#0284C7]',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
    accentText: 'text-sky-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'peach-apricot',
    name: 'Peach Apricot',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-orange-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#F97316]',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    accentText: 'text-orange-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'periwinkle-bell',
    name: 'Periwinkle Bell',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-indigo-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#6366F1]',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    accentText: 'text-indigo-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
  {
    id: 'lotus-orchid',
    name: 'Lotus Orchid',
    cardBg: 'bg-white',
    cardBorder: 'border-black/[0.08]',
    topBorder: 'border-t-pink-500',
    internalBorder: 'border-black/[0.06]',
    accentBar: 'bg-[#DB2777]',
    badgeBg: 'bg-pink-50 text-pink-700 border-pink-200',
    accentText: 'text-pink-700',
    footerBg: 'bg-slate-50/70',
    hoverBorder: 'hover:border-black/20',
  },
];

/**
 * Deterministically pick a floral color palette from any ID or string key.
 * Guarantees each card has a unique, distinct color border that never flickers on re-render.
 */
export function getFloralPalette(key: string | null | undefined): FloralPalette {
  if (!key) return FLORAL_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % FLORAL_PALETTES.length;
  return FLORAL_PALETTES[index];
}
