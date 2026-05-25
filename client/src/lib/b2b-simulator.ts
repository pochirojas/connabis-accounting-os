// Client-side B2B pricing recompute. Mirrors server/b2b-pricing.ts so the
// "Connabis & Co" simulator can preview tier prices live against alternative
// margin / rounding policies without writing anything back.

export type SimTier = {
  units: number;
  targetConnabisMargin: number;
  targetResellerMargin: number;
};

export type SimTierResult = {
  units: number;
  price: number | null;
  connabisMargin: number | null;
  resellerMargin: number | null;
  flags: string[];
};

export type SimParams = {
  tiers: SimTier[];
  retailCeiling: number; // 0..1, e.g. 0.95
  roundingStep: 'auto' | 500 | 1000;
};

// Preset definitions — match server defaults for "balanceado".
export const DEFAULT_TIERS: SimTier[] = [
  { units: 25,   targetConnabisMargin: 0.55, targetResellerMargin: 0.15 },
  { units: 50,   targetConnabisMargin: 0.52, targetResellerMargin: 0.18 },
  { units: 100,  targetConnabisMargin: 0.48, targetResellerMargin: 0.22 },
  { units: 200,  targetConnabisMargin: 0.45, targetResellerMargin: 0.25 },
  { units: 500,  targetConnabisMargin: 0.42, targetResellerMargin: 0.30 },
  { units: 1000, targetConnabisMargin: 0.40, targetResellerMargin: 0.35 },
];

export type PresetKey = 'conservador' | 'balanceado' | 'agresivo' | 'custom';

// Tier-scaling shape used by sliders: reseller margin at 100u is the anchor,
// other tiers scale proportionally to the default curve. Same for the optional
// Connabis margin floor.
const RESELLER_CURVE = DEFAULT_TIERS.map(t => t.targetResellerMargin); // [.15,.18,.22,.25,.30,.35]
const CONNABIS_CURVE = DEFAULT_TIERS.map(t => t.targetConnabisMargin); // [.55,.52,.48,.45,.42,.40]
const ANCHOR_IDX = DEFAULT_TIERS.findIndex(t => t.units === 100); // 2

export function tiersFromAnchors(
  resellerAt100: number,
  connabisAt100: number,
): SimTier[] {
  const rAnchor = RESELLER_CURVE[ANCHOR_IDX]; // 0.22
  const cAnchor = CONNABIS_CURVE[ANCHOR_IDX]; // 0.48
  return DEFAULT_TIERS.map((t, i) => {
    const rDelta = RESELLER_CURVE[i] - rAnchor;
    const cDelta = CONNABIS_CURVE[i] - cAnchor;
    return {
      units: t.units,
      // clamp to [0, 0.95]
      targetResellerMargin: Math.max(0, Math.min(0.95, resellerAt100 + rDelta)),
      targetConnabisMargin: Math.max(0, Math.min(0.95, connabisAt100 + cDelta)),
    };
  });
}

export const PRESETS: Record<Exclude<PresetKey, 'custom'>, { resellerAt100: number; connabisAt100: number; label: string; hint: string }> = {
  conservador: {
    resellerAt100: 0.18, connabisAt100: 0.52,
    label: 'Conservador',
    hint: 'Prioriza margen Connabis; reseller gana menos.',
  },
  balanceado: {
    resellerAt100: 0.22, connabisAt100: 0.48,
    label: 'Balanceado (actual)',
    hint: 'Política vigente: Connabis 48% @100u, reseller 22%.',
  },
  agresivo: {
    resellerAt100: 0.30, connabisAt100: 0.42,
    label: 'Agresivo para revendedor',
    hint: 'Reseller gana más; Connabis cede margen para incentivar volumen.',
  },
};

function roundClean(value: number, floor: number, step: 'auto' | 500 | 1000): number {
  let s: number;
  if (step === 500) s = 500;
  else if (step === 1000) s = 1000;
  else {
    s = 500;
    if (value >= 50_000) s = 1_000;
    if (value >= 200_000) s = 5_000;
  }
  const nearest = Math.round(value / s) * s;
  if (nearest < floor) return Math.ceil(floor / s) * s;
  return nearest;
}

export function computeSimTier(
  cogs: number,
  retail: number,
  tier: SimTier,
  retailCeiling: number,
  roundingStep: SimParams['roundingStep'],
): SimTierResult {
  const minForUs = cogs / (1 - tier.targetConnabisMargin);
  const maxForReseller = retail * (1 - tier.targetResellerMargin);
  const ceiling = retail * retailCeiling;
  const flags: string[] = [];

  let raw = minForUs;
  if (raw > maxForReseller && raw <= ceiling) {
    flags.push('poco_margen_reseller');
  } else if (raw > ceiling) {
    flags.push('poco_margen_reseller');
    flags.push('precio_sobre_techo_retail');
  } else {
    raw = Math.min(maxForReseller, ceiling);
    if (raw < minForUs) raw = minForUs;
  }
  const price = roundClean(raw, minForUs, roundingStep);
  const connabisMargin = price > 0 ? (price - cogs) / price : null;
  const resellerMargin = retail > 0 ? (retail - price) / retail : null;
  return { units: tier.units, price, connabisMargin, resellerMargin, flags };
}

// Per-row helper: given fixed retail/cogs and a chosen custom unit price,
// what are the margins, and is the price feasible?
export function evaluateCustomPrice(
  cogs: number | null,
  retail: number,
  unitPrice: number,
  minConnabisMargin: number,
  targetResellerMargin: number,
): {
  connabisMargin: number | null;
  resellerMargin: number | null;
  flags: string[];
} {
  const flags: string[] = [];
  if (cogs === null || cogs <= 0 || retail <= 0 || unitPrice <= 0) {
    return { connabisMargin: null, resellerMargin: null, flags: ['sin_datos'] };
  }
  const connabisMargin = (unitPrice - cogs) / unitPrice;
  const resellerMargin = (retail - unitPrice) / retail;
  if (connabisMargin < minConnabisMargin) flags.push('margen_connabis_bajo');
  if (resellerMargin < targetResellerMargin) flags.push('poco_margen_reseller');
  if (unitPrice >= retail) flags.push('precio_sobre_retail');
  // Feasibility check: if the floor implied by min margin is above the
  // reseller's ceiling, no price can satisfy both.
  const floor = cogs / (1 - minConnabisMargin);
  const cap = retail * (1 - targetResellerMargin);
  if (floor > cap) flags.push('retail_insuficiente');
  return { connabisMargin, resellerMargin, flags };
}

// Check whether a tier configuration is feasible against a (cogs, retail)
// pair — returns true when both margin targets can be met simultaneously.
export function tierFeasible(
  cogs: number | null,
  retail: number,
  tier: SimTier,
): boolean {
  if (cogs === null || cogs <= 0 || retail <= 0) return false;
  const floor = cogs / (1 - tier.targetConnabisMargin);
  const cap = retail * (1 - tier.targetResellerMargin);
  return floor <= cap;
}
