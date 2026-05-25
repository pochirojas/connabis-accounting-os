// Phase 2.2 P0 — Cost breakdown dashes (Noids / Materials / Supplements /
// Insumos costos). Aggregates the latest unit cost per material by class so
// the UI can render side-by-side dashboards for quick latest-price lookup.
//
// "Latest unit cost" picks the most recent of:
//   1. inventory_movements (received PO line)
//   2. material_cost_history (Excel sheet)
//   3. material_manager_materials.cost (mirror) — last-resort fallback
//
// This module is read-only: it never writes to the mirror.
import Database from 'better-sqlite3';
import type { CostBreakdownBucketSummary, CostBreakdownRow, MmMaterialEffective } from '@shared/schema';
import { listMmMaterialsEffective } from './material-manager-mirror';

const SUPPLEMENT_HINTS = ['supplement', 'suplemento', 'vitamin', 'mineral', 'amino'];

export type BreakdownBucket = CostBreakdownRow['bucket'];

const BUCKET_LABELS: Record<BreakdownBucket, string> = {
  noids: 'Noids costos',
  materials: 'Materials costos',
  supplements: 'Supplements costos',
  insumos: 'Insumos costos',
  uncategorized: 'Uncategorized',
};

function classifyMaterial(m: MmMaterialEffective): BreakdownBucket {
  if (m.isNoid) return 'noids';
  if (m.isInsumo) return 'insumos';
  const cat = (m.category || '').toLowerCase();
  if (SUPPLEMENT_HINTS.some(h => cat.includes(h))) return 'supplements';
  if (cat.trim()) return 'materials';
  return 'uncategorized';
}

type LatestPick = {
  unitCostCop: number;
  source: CostBreakdownRow['latestSource'];
  supplier: string;
  date: string | null;
  poNumber: string | null;
  currency: string;
  fxRate: number | null;
};

function pickLatest(sqlite: Database.Database, m: MmMaterialEffective): LatestPick {
  // 1. inventory_movements — most recent positive movement.
  const mvRow = sqlite.prepare(`
    SELECT unit_cost_cop, supplier, date, po_number, currency, fx_rate
    FROM inventory_movements
    WHERE material_key = ? AND qty_delta > 0
    ORDER BY date DESC, id DESC LIMIT 1
  `).get(m.id) as { unit_cost_cop?: number; supplier?: string; date?: string; po_number?: string; currency?: string; fx_rate?: number } | undefined;
  if (mvRow && Number(mvRow.unit_cost_cop) > 0) {
    return {
      unitCostCop: Number(mvRow.unit_cost_cop),
      source: 'po',
      supplier: String(mvRow.supplier ?? ''),
      date: mvRow.date ? String(mvRow.date) : null,
      poNumber: mvRow.po_number ? String(mvRow.po_number) : null,
      currency: String(mvRow.currency ?? m.currencyCode ?? 'COP'),
      fxRate: mvRow.fx_rate === null || mvRow.fx_rate === undefined ? null : Number(mvRow.fx_rate),
    };
  }
  // 2. material_cost_history — fuzzy match by normalized name. We use the
  //    already-stored material_key (normalized name) for the lookup.
  const normalizedKey = normalizeMaterialKey(m.name);
  if (normalizedKey) {
    const chRow = sqlite.prepare(`
      SELECT unit_cost_cop, date, source_sheet, currency, fx_rate
      FROM material_cost_history
      WHERE material_key = ?
      ORDER BY date DESC, id DESC LIMIT 1
    `).get(normalizedKey) as { unit_cost_cop?: number; date?: string; source_sheet?: string; currency?: string; fx_rate?: number } | undefined;
    if (chRow && Number(chRow.unit_cost_cop) > 0) {
      return {
        unitCostCop: Number(chRow.unit_cost_cop),
        source: 'cost_history',
        supplier: m.supplier ?? '',
        date: chRow.date ? String(chRow.date) : null,
        poNumber: null,
        currency: String(chRow.currency ?? m.currencyCode ?? 'COP'),
        fxRate: chRow.fx_rate === null || chRow.fx_rate === undefined ? null : Number(chRow.fx_rate),
      };
    }
  }
  // 3. Mirror cost (effective override-merged).
  if (Number(m.cost) > 0) {
    return {
      unitCostCop: Number(m.cost),
      source: 'material',
      supplier: m.supplier ?? '',
      date: null,
      poNumber: null,
      currency: m.currencyCode ?? 'COP',
      fxRate: null,
    };
  }
  return {
    unitCostCop: 0,
    source: 'none',
    supplier: m.supplier ?? '',
    date: null,
    poNumber: null,
    currency: m.currencyCode ?? 'COP',
    fxRate: null,
  };
}

function normalizeMaterialKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildCostBreakdownRows(sqlite: Database.Database): CostBreakdownRow[] {
  // Archived materials are excluded from cost dashes — they should not show
  // up in operational latest-price views. Pass includeArchived if a future
  // admin view needs them.
  const materials = listMmMaterialsEffective(sqlite);
  return materials.map(m => {
    const bucket = classifyMaterial(m);
    const latest = pickLatest(sqlite, m);
    return {
      materialId: m.id,
      material: m.name,
      category: m.category,
      bucket,
      unit: m.measurement,
      latestUnitCostCop: latest.unitCostCop,
      latestSource: latest.source,
      latestSupplier: latest.supplier,
      latestDate: latest.date,
      latestPoNumber: latest.poNumber,
      currency: latest.currency,
      fxRate: latest.fxRate,
      stock: m.stock,
    };
  });
}

export function getCostBreakdownByBucket(sqlite: Database.Database): CostBreakdownBucketSummary[] {
  const rows = buildCostBreakdownRows(sqlite);
  const buckets: BreakdownBucket[] = ['noids', 'materials', 'supplements', 'insumos', 'uncategorized'];
  return buckets.map(bucket => {
    const matching = rows
      .filter(r => r.bucket === bucket)
      .sort((a, b) => a.material.localeCompare(b.material));
    return {
      bucket,
      label: BUCKET_LABELS[bucket],
      materialCount: matching.length,
      totalInventoryValue: matching.reduce((s, r) => s + r.stock * r.latestUnitCostCop, 0),
      rows: matching,
    };
  });
}

// Dash view: condensed latest-price-per-material list across all buckets,
// sorted by most-recent update so the user can scan recent restocks quickly.
export function getLatestPriceDash(sqlite: Database.Database, limit = 200): CostBreakdownRow[] {
  return buildCostBreakdownRows(sqlite)
    .filter(r => r.latestUnitCostCop > 0)
    .sort((a, b) => {
      const ad = a.latestDate ?? '';
      const bd = b.latestDate ?? '';
      if (ad !== bd) return ad < bd ? 1 : -1;
      return a.material.localeCompare(b.material);
    })
    .slice(0, limit);
}
