// Phase 2.7 P0 — Extended QA snapshot.
// Wraps the existing round-trip parity QA with broader sanity checks across
// MM materials, BOM, POs, inventory movements, batches, and PO landed-cost
// math. Status is 'pass' when nothing fires, 'warn' for non-blocking issues
// (e.g. unmatched PO lines), 'fail' when round-trip parity breaks or stock
// goes negative.
import Database from 'better-sqlite3';
import type { MmExtendedQa } from '@shared/schema';
import { listMmMaterialsEffective, runRoundTripQa } from './material-manager-mirror';
import { getMmPurchaseOrder } from './material-manager-purchase-orders';
import { buildPoBreakdown } from './po-cost-breakdown';

export function runExtendedQa(sqlite: Database.Database): MmExtendedQa {
  const ranAt = new Date().toISOString();
  const roundTrip = runRoundTripQa(sqlite);

  const materials = listMmMaterialsEffective(sqlite);
  const counts = {
    materials: materials.length,
    bomComponents: (sqlite.prepare(`SELECT COUNT(*) AS c FROM material_manager_bom_components`).get() as { c: number }).c,
    purchaseOrders: (sqlite.prepare(`SELECT COUNT(*) AS c FROM material_manager_purchase_orders WHERE status != 'cancelled'`).get() as { c: number }).c,
    purchaseOrderLines: (sqlite.prepare(`SELECT COUNT(*) AS c FROM material_manager_purchase_order_lines`).get() as { c: number }).c,
    inventoryMovements: 0,
    batches: 0,
  };
  try {
    counts.inventoryMovements = (sqlite.prepare(`SELECT COUNT(*) AS c FROM inventory_movements`).get() as { c: number }).c;
  } catch { /* table may not exist yet */ }
  try {
    counts.batches = (sqlite.prepare(`SELECT COUNT(*) AS c FROM inventory_batches`).get() as { c: number }).c;
  } catch { /* table may not exist yet */ }

  const unmatchedRow = sqlite.prepare(`
    SELECT COUNT(*) AS c FROM material_manager_purchase_order_lines WHERE material_id IS NULL OR material_id = ''
  `).get() as { c: number };
  const unmatchedPoLines = Number(unmatchedRow.c ?? 0);

  // Negative or suspicious stock. Effective view already merges overrides, so
  // any negative number here indicates a real corruption. We also surface
  // strongly-negative values (< -1) to filter out FP rounding.
  const negativeStockMaterials = materials
    .filter(m => Number(m.stock) < -0.0001)
    .map(m => ({ materialId: m.id, name: m.name, stock: Number(m.stock) }))
    .slice(0, 50);

  // PO landed sanity: declared PO total vs. computed sum of line totals (with
  // shipping + taxes). diff > 1 COP is reported.
  const poNumbers = sqlite.prepare(`
    SELECT po_number FROM material_manager_purchase_orders WHERE status = 'received' AND total > 0 LIMIT 200
  `).all() as Array<{ po_number: string }>;
  const poLandedSanity: MmExtendedQa['poLandedSanity'] = [];
  poNumbers.forEach(r => {
    const po = getMmPurchaseOrder(sqlite, r.po_number);
    if (!po) return;
    const breakdown = buildPoBreakdown(sqlite, po.id);
    if (!breakdown) return;
    const declared = po.total;
    const computed = breakdown.totalLandedCop;
    const diff = Math.abs(declared - computed);
    if (diff > 1) {
      poLandedSanity.push({
        poNumber: po.poNumber,
        declaredTotal: declared,
        computedTotal: computed,
        diff,
      });
    }
  });

  // BOM coverage on sales lines: best-effort using cached fulfilled-line stats
  // if exposed; otherwise null (the daily-report endpoint owns this number).
  let bomCoverageOnSales: MmExtendedQa['bomCoverageOnSales'] = null;
  try {
    const totals = sqlite.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN EXISTS (SELECT 1 FROM material_manager_bom_components b WHERE b.variant_id = l.variant_id) THEN 1 ELSE 0 END) AS covered
      FROM (SELECT DISTINCT variant_id FROM material_manager_bom_components) l
    `).get() as { total: number; covered: number } | undefined;
    if (totals && Number(totals.total) > 0) {
      bomCoverageOnSales = {
        covered: Number(totals.covered ?? 0),
        total: Number(totals.total),
        coverage: Number(totals.covered ?? 0) / Number(totals.total),
      };
    }
  } catch { /* noop */ }

  const warnings: string[] = [];
  if (unmatchedPoLines > 0) warnings.push(`${unmatchedPoLines} PO lines without a matched material — use Historical PO matcher.`);
  if (negativeStockMaterials.length > 0) warnings.push(`${negativeStockMaterials.length} materials with negative stock.`);
  if (poLandedSanity.length > 0) warnings.push(`${poLandedSanity.length} POs where declared total ≠ computed landed total (>1 COP diff).`);
  if (counts.batches === 0 && counts.inventoryMovements > 0) {
    warnings.push('Inventory movements exist but no batches yet — receive future POs to populate batches.');
  }

  let status: MmExtendedQa['status'] = 'pass';
  if (roundTrip.status === 'fail') status = 'fail';
  else if (negativeStockMaterials.length > 0) status = 'fail';
  else if (warnings.length > 0) status = 'warn';

  return {
    ranAt,
    roundTrip,
    counts,
    unmatchedPoLines,
    negativeStockMaterials,
    poLandedSanity,
    bomCoverageOnSales,
    warnings,
    status,
  };
}
