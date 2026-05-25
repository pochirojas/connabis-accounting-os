// B2B tiered pricing engine for the "Connabis & Co" page.
//
// Inputs: rows from /api/products (already use the canonical COGS source
// priority — Material Manager BOM > Shopify unitCost > manual override).
// Outputs: per-product computed B2B unit prices for 25/50/100/200/500/1000
// units, plus margin diagnostics and data-quality flags.
//
// Formula (deterministic; tweak constants in TIERS to adjust policy):
//   1. min_price_for_us(t) = COGS / (1 - target_connabis_margin_by_tier(t))
//   2. max_reseller_price(t) = retail * (1 - target_reseller_margin_by_tier(t))
//   3. raw_price(t) = max(min_price_for_us(t), 0)
//      - if raw_price > max_reseller_price → flag "poco margen reseller"
//        and clamp at min(retail * 0.95, raw_price) (never below
//        min_price_for_us; if that itself is above 95% retail, keep raw_price
//        and flag).
//   4. price(t) = roundClean(raw_price), where roundClean snaps to nearest
//      500 COP under 50k, 1.000 COP under 200k, 5.000 COP above. Snapping is
//      done UP if below min_price_for_us to never break the floor.
import type { Product } from '@shared/schema';

export type B2bTier = {
  units: number;
  targetConnabisMargin: number; // gross margin we want to keep
  targetResellerMargin: number; // reseller margin vs retail
};

export const TIERS: B2bTier[] = [
  { units: 25,   targetConnabisMargin: 0.55, targetResellerMargin: 0.15 },
  { units: 50,   targetConnabisMargin: 0.52, targetResellerMargin: 0.18 },
  { units: 100,  targetConnabisMargin: 0.48, targetResellerMargin: 0.22 },
  { units: 200,  targetConnabisMargin: 0.45, targetResellerMargin: 0.25 },
  { units: 500,  targetConnabisMargin: 0.42, targetResellerMargin: 0.30 },
  { units: 1000, targetConnabisMargin: 0.40, targetResellerMargin: 0.35 },
];

export const RETAIL_CEILING = 0.95; // never sell B2B above 95% of retail unless margin requires it.

export type B2bTierRow = {
  units: number;
  price: number | null;        // null when COGS missing
  connabisMargin: number | null;
  resellerMargin: number | null;
  flags: string[];             // e.g. ['poco_margen_reseller']
};

export type B2bPricingRow = {
  id: string;
  name: string;
  sku?: string;
  family: string;
  active: boolean;
  presentation?: string | null;
  retailPrice: number;
  cogs: number | null;         // null if missing
  cogsSource: Product['cogsSource'] | 'missing';
  retailMargin: number | null; // current retail GM
  tiers: B2bTierRow[];
  status: 'sin_cogs' | 'margen_bajo' | 'ok_b2b';
  warnings: string[];
};

// Water-soluble product detector — covers "Solubles en agua", "Soluble",
// "Water-soluble" wording variants. Case-insensitive, diacritic-insensitive.
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export function isWaterSoluble(p: { name: string; family?: string }): boolean {
  const haystack = normalize(`${p.name} ${p.family ?? ''}`);
  return /\bsolubles?\b|\bsoluble\b|water[- ]soluble/.test(haystack);
}

function roundClean(value: number, floor: number): number {
  let step = 500;
  if (value >= 50_000) step = 1_000;
  if (value >= 200_000) step = 5_000;
  const nearest = Math.round(value / step) * step;
  // Never round below the Connabis-margin floor: if rounding pulls us under,
  // round UP to the next step.
  if (nearest < floor) return Math.ceil(floor / step) * step;
  return nearest;
}

export function computeTier(
  cogs: number,
  retail: number,
  tier: B2bTier,
): B2bTierRow {
  const minForUs = cogs / (1 - tier.targetConnabisMargin);
  const maxForReseller = retail * (1 - tier.targetResellerMargin);
  const retailCeiling = retail * RETAIL_CEILING;
  const flags: string[] = [];

  let raw = minForUs;
  if (raw > maxForReseller && raw <= retailCeiling) {
    // We can hit our margin but reseller margin is squeezed.
    flags.push('poco_margen_reseller');
  } else if (raw > retailCeiling) {
    // Required price exceeds 95% of retail — keep our margin (priority) and
    // flag the gap; reseller will need a price uplift or a different deal.
    flags.push('poco_margen_reseller');
    flags.push('precio_sobre_techo_retail');
  } else {
    // raw fits under reseller cap; we can lower price slightly to give reseller
    // their target margin, but never below our floor.
    raw = Math.min(maxForReseller, retailCeiling);
    if (raw < minForUs) raw = minForUs;
  }

  const price = roundClean(raw, minForUs);
  const connabisMargin = price > 0 ? (price - cogs) / price : null;
  const resellerMargin = retail > 0 ? (retail - price) / retail : null;
  return { units: tier.units, price, connabisMargin, resellerMargin, flags };
}

export function computeB2bRow(p: Product): B2bPricingRow {
  const hasCogs = p.cogsUsed > 0;
  const retail = p.unitPrice;
  const tiers: B2bTierRow[] = TIERS.map(tier => {
    if (!hasCogs || retail <= 0) {
      return { units: tier.units, price: null, connabisMargin: null, resellerMargin: null, flags: [] };
    }
    return computeTier(p.cogsUsed, retail, tier);
  });

  const warnings: string[] = [];
  if (!hasCogs) warnings.push('Sin COGS — cargar BOM o unitCost para calcular');
  if (retail <= 0) warnings.push('Sin precio retail en Shopify');
  if (hasCogs && retail > 0 && p.grossMargin < 0.3) warnings.push('Margen retail < 30% — revisar precio');

  let status: B2bPricingRow['status'] = 'ok_b2b';
  if (!hasCogs) status = 'sin_cogs';
  else if (tiers.some(t => t.flags.includes('poco_margen_reseller'))) status = 'margen_bajo';

  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    family: p.family,
    active: p.active,
    presentation: p.presentation,
    retailPrice: retail,
    cogs: hasCogs ? p.cogsUsed : null,
    cogsSource: hasCogs ? p.cogsSource : 'missing',
    retailMargin: retail > 0 && hasCogs ? (retail - p.cogsUsed) / retail : null,
    tiers,
    status,
    warnings,
  };
}

export function computeB2bPricing(products: Product[]): {
  rows: B2bPricingRow[];
  summary: {
    eligible: number;
    excludedWaterSoluble: number;
    withoutCogs: number;
    avgRetailMargin: number;
    avgB2bMarginAt100: number;
    avgResellerMarginAt100: number;
  };
} {
  const active = products.filter(p => p.active);
  const eligible = active.filter(p => !isWaterSoluble(p));
  const excludedWaterSoluble = active.length - eligible.length;
  const rows = eligible.map(computeB2bRow);

  const withCogs = rows.filter(r => r.cogs !== null);
  const avgRetailMargin = withCogs.length
    ? withCogs.reduce((s, r) => s + (r.retailMargin ?? 0), 0) / withCogs.length
    : 0;
  const tier100 = rows.flatMap(r => {
    const t = r.tiers.find(x => x.units === 100);
    return t && t.price !== null ? [t] : [];
  });
  const avgB2bMarginAt100 = tier100.length
    ? tier100.reduce((s, t) => s + (t.connabisMargin ?? 0), 0) / tier100.length
    : 0;
  const avgResellerMarginAt100 = tier100.length
    ? tier100.reduce((s, t) => s + (t.resellerMargin ?? 0), 0) / tier100.length
    : 0;

  return {
    rows,
    summary: {
      eligible: rows.length,
      excludedWaterSoluble,
      withoutCogs: rows.filter(r => r.cogs === null).length,
      avgRetailMargin,
      avgB2bMarginAt100,
      avgResellerMarginAt100,
    },
  };
}
