// Phase 2.7 P0 — Planned BOM consumption report.
// Report-only: takes already-loaded fulfilled Shopify line items + the current
// MM BOM + effective material catalog, and computes what each fulfilled order
// would have consumed in raw materials. This module does NOT write inventory
// movements — destructive stock deduction is a follow-up slice that needs an
// explicit user action so we don't corrupt historical stock counts.
import Database from 'better-sqlite3';
import type {
  ConsumptionGap,
  ConsumptionLine,
  ConsumptionReport,
  MmBomRow,
  MmMaterialEffective,
} from '@shared/schema';

export type FulfilledLineItemInput = {
  variantId: string | null;
  productName: string;
  variantName: string;
  qty: number;
  orderId: string;
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'partial';
};

export type ConsumptionInputs = {
  fulfilledLines: FulfilledLineItemInput[];
  bomRows: MmBomRow[];
  materials: MmMaterialEffective[];
  filter?: { month?: string; year?: string } | null;
  latestUnitCostByMaterial?: Map<string, number>;
};

export function buildConsumptionReport(
  sqlite: Database.Database,
  inputs: ConsumptionInputs,
): ConsumptionReport {
  const fulfilled = inputs.fulfilledLines.filter(l => l.fulfillmentStatus === 'fulfilled');

  // Index BOM by variantId.
  const bomByVariant = new Map<string, MmBomRow[]>();
  inputs.bomRows.forEach(row => {
    if (!row.variantId) return;
    const list = bomByVariant.get(row.variantId) ?? [];
    list.push(row);
    bomByVariant.set(row.variantId, list);
  });

  const materialById = new Map(inputs.materials.map(m => [m.id, m] as const));
  const latestCost = inputs.latestUnitCostByMaterial ?? new Map<string, number>();

  // Aggregate consumption per material.
  type Agg = {
    materialId: string;
    materialName: string;
    unit: string;
    qtyConsumed: number;
    orders: Set<string>;
    variants: Set<string>;
    unitCostCop: number;
  };
  const aggByMaterial = new Map<string, Agg>();
  const gaps: ConsumptionGap[] = [];
  let coveredLines = 0;
  let totalLines = 0;
  const orders = new Set<string>();

  for (const line of fulfilled) {
    if (line.qty <= 0) continue;
    totalLines += 1;
    orders.add(line.orderId);
    const vid = line.variantId ?? '';
    const bomList = vid ? bomByVariant.get(vid) ?? [] : [];
    if (bomList.length === 0) {
      gaps.push({
        variantId: vid,
        productName: line.productName,
        variantName: line.variantName,
        qtySold: line.qty,
        reason: 'no_bom',
      });
      continue;
    }
    coveredLines += 1;
    for (const bom of bomList) {
      const mat = materialById.get(bom.materialId);
      if (!mat) {
        gaps.push({
          variantId: vid,
          productName: line.productName,
          variantName: line.variantName,
          qtySold: line.qty,
          reason: 'unmatched_material',
        });
        continue;
      }
      const consumed = line.qty * bom.quantity;
      const existing = aggByMaterial.get(mat.id);
      const unitCost = latestCost.get(mat.id) ?? mat.cost ?? 0;
      if (existing) {
        existing.qtyConsumed += consumed;
        existing.orders.add(line.orderId);
        existing.variants.add(vid);
        if (existing.unitCostCop === 0 && unitCost > 0) existing.unitCostCop = unitCost;
      } else {
        aggByMaterial.set(mat.id, {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.measurement ?? '',
          qtyConsumed: consumed,
          orders: new Set([line.orderId]),
          variants: new Set([vid]),
          unitCostCop: unitCost,
        });
      }
    }
  }

  const byMaterial: ConsumptionLine[] = Array.from(aggByMaterial.values()).map(agg => {
    const mat = materialById.get(agg.materialId);
    const currentStock = Number(mat?.stock ?? 0);
    const projected = currentStock - agg.qtyConsumed;
    let warning: ConsumptionLine['warning'] = 'ok';
    if (projected < 0) warning = 'negative_after';
    else if (projected < agg.qtyConsumed * 0.25) warning = 'low_stock';
    return {
      materialId: agg.materialId,
      materialName: agg.materialName,
      qtyConsumed: agg.qtyConsumed,
      unit: agg.unit,
      unitCostCop: agg.unitCostCop,
      totalCostCop: agg.qtyConsumed * agg.unitCostCop,
      ordersTouched: agg.orders.size,
      variantsTouched: agg.variants.size,
      currentStock,
      projectedStock: projected,
      warning,
    };
  }).sort((a, b) => b.totalCostCop - a.totalCostCop);

  const totalCogsCop = byMaterial.reduce((s, m) => s + m.totalCostCop, 0);

  // Dedupe gaps (same variantId+reason).
  const gapKey = (g: ConsumptionGap) => `${g.variantId}::${g.reason}`;
  const dedupedGaps = Array.from(new Map(gaps.map(g => [gapKey(g), g])).values());

  return {
    generatedAt: new Date().toISOString(),
    filter: inputs.filter ?? null,
    ordersAnalyzed: orders.size,
    fulfilledLineItems: fulfilled.length,
    totalCogsCop,
    byMaterial,
    gaps: dedupedGaps,
    bomCoverage: {
      coveredLines,
      totalLines,
      coverage: totalLines > 0 ? coveredLines / totalLines : 1,
    },
  };
}

// Helper: latest-cost map by materialId, sourced from inventory_movements
// (most recent positive). Used by the consumption report to value COGS.
export function buildLatestCostMap(sqlite: Database.Database): Map<string, number> {
  const rows = sqlite.prepare(`
    SELECT m1.material_key, m1.unit_cost_cop
    FROM inventory_movements m1
    JOIN (
      SELECT material_key, MAX(date || '|' || id) AS marker
      FROM inventory_movements
      WHERE qty_delta > 0
      GROUP BY material_key
    ) latest ON latest.material_key = m1.material_key
      AND latest.marker = m1.date || '|' || m1.id
  `).all() as Array<{ material_key: string; unit_cost_cop: number }>;
  const map = new Map<string, number>();
  rows.forEach(r => {
    if (Number(r.unit_cost_cop) > 0) map.set(String(r.material_key), Number(r.unit_cost_cop));
  });
  return map;
}
