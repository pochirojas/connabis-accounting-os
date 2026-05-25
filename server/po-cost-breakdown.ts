// Phase 2.7 P0 — Purchase Order landed-cost degloss.
// Takes a PO's lines + the (optional) per-PO cost override and allocates
// shipping / tax / order protect / fees / discount across the lines so each
// line gets a real landed unit cost in COP. Allocation basis:
//   1. Proportional to line subtotal (PO currency, then converted to COP).
//   2. Fallback to qty share when subtotal == 0 (e.g. all-zero unit costs).
//   3. Flat (1 / line_count) if both subtotal and qty are zero across lines.
//
// The PO header table stays read-only — overrides live in their own table
// so MM CSV round-trip is preserved.
import Database from 'better-sqlite3';
import type {
  MmPoCostOverride,
  PoBreakdown,
  PoBreakdownLine,
  UpdatePoCostOverride,
} from '@shared/schema';
import { getMmPurchaseOrder } from './material-manager-purchase-orders';

export function ensurePoCostOverrideSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS mm_po_cost_overrides (
      po_id INTEGER PRIMARY KEY,
      po_number TEXT NOT NULL,
      shipping_cop REAL,
      shipping_original REAL,
      tax_cop REAL,
      order_protect_cop REAL,
      fees_cop REAL,
      discount_cop REAL,
      fx_rate REAL,
      currency TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

function mapOverrideRow(row: Record<string, unknown>): MmPoCostOverride {
  return {
    poId: Number(row.po_id),
    poNumber: String(row.po_number),
    shippingCop: row.shipping_cop === null || row.shipping_cop === undefined ? null : Number(row.shipping_cop),
    shippingOriginal: row.shipping_original === null || row.shipping_original === undefined ? null : Number(row.shipping_original),
    taxCop: row.tax_cop === null || row.tax_cop === undefined ? null : Number(row.tax_cop),
    orderProtectCop: row.order_protect_cop === null || row.order_protect_cop === undefined ? null : Number(row.order_protect_cop),
    feesCop: row.fees_cop === null || row.fees_cop === undefined ? null : Number(row.fees_cop),
    discountCop: row.discount_cop === null || row.discount_cop === undefined ? null : Number(row.discount_cop),
    fxRate: row.fx_rate === null || row.fx_rate === undefined ? null : Number(row.fx_rate),
    currency: row.currency === null || row.currency === undefined ? null : String(row.currency),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function getPoCostOverride(sqlite: Database.Database, poId: number): MmPoCostOverride | null {
  ensurePoCostOverrideSchema(sqlite);
  const row = sqlite.prepare(`SELECT * FROM mm_po_cost_overrides WHERE po_id = ?`).get(poId) as Record<string, unknown> | undefined;
  return row ? mapOverrideRow(row) : null;
}

export function upsertPoCostOverride(
  sqlite: Database.Database,
  poId: number,
  poNumber: string,
  patch: UpdatePoCostOverride,
): MmPoCostOverride {
  ensurePoCostOverrideSchema(sqlite);
  const existing = getPoCostOverride(sqlite, poId);
  const merged: MmPoCostOverride = {
    poId,
    poNumber,
    shippingCop: patch.shippingCop ?? existing?.shippingCop ?? null,
    shippingOriginal: patch.shippingOriginal ?? existing?.shippingOriginal ?? null,
    taxCop: patch.taxCop ?? existing?.taxCop ?? null,
    orderProtectCop: patch.orderProtectCop ?? existing?.orderProtectCop ?? null,
    feesCop: patch.feesCop ?? existing?.feesCop ?? null,
    discountCop: patch.discountCop ?? existing?.discountCop ?? null,
    fxRate: patch.fxRate ?? existing?.fxRate ?? null,
    currency: patch.currency ?? existing?.currency ?? null,
    notes: patch.notes ?? existing?.notes ?? null,
    updatedAt: new Date().toISOString(),
  };
  sqlite.prepare(`
    INSERT INTO mm_po_cost_overrides (
      po_id, po_number, shipping_cop, shipping_original, tax_cop, order_protect_cop,
      fees_cop, discount_cop, fx_rate, currency, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(po_id) DO UPDATE SET
      po_number = excluded.po_number,
      shipping_cop = excluded.shipping_cop,
      shipping_original = excluded.shipping_original,
      tax_cop = excluded.tax_cop,
      order_protect_cop = excluded.order_protect_cop,
      fees_cop = excluded.fees_cop,
      discount_cop = excluded.discount_cop,
      fx_rate = excluded.fx_rate,
      currency = excluded.currency,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    merged.poId, merged.poNumber, merged.shippingCop, merged.shippingOriginal,
    merged.taxCop, merged.orderProtectCop, merged.feesCop, merged.discountCop,
    merged.fxRate, merged.currency, merged.notes, merged.updatedAt,
  );
  return merged;
}

export function deletePoCostOverride(sqlite: Database.Database, poId: number): boolean {
  ensurePoCostOverrideSchema(sqlite);
  const info = sqlite.prepare(`DELETE FROM mm_po_cost_overrides WHERE po_id = ?`).run(poId);
  return info.changes > 0;
}

// Build the per-line landed cost degloss for a PO.
export function buildPoBreakdown(sqlite: Database.Database, idOrNumber: string | number): PoBreakdown | null {
  ensurePoCostOverrideSchema(sqlite);
  const po = getMmPurchaseOrder(sqlite, idOrNumber);
  if (!po) return null;
  const override = getPoCostOverride(sqlite, po.id);

  const fxRate = override?.fxRate && override.fxRate > 0 ? override.fxRate : 1;
  const lines = po.lines ?? [];

  // Compute per-line subtotals in PO currency, then COP.
  const linesEnriched = lines.map(line => {
    const subtotalOriginal = line.quantity * line.unitCost;
    const subtotalCop = subtotalOriginal * fxRate;
    return { line, subtotalOriginal, subtotalCop };
  });

  const sumSubtotalCop = linesEnriched.reduce((s, l) => s + l.subtotalCop, 0);
  const sumQty = linesEnriched.reduce((s, l) => s + l.line.quantity, 0);

  // Header-level costs (override wins; fall back to PO-as-imported subtotal/taxes/shipping fields).
  const shippingCop = override?.shippingCop ?? po.shipping ?? 0;
  const taxCop = override?.taxCop ?? po.taxes ?? 0;
  const orderProtectCop = override?.orderProtectCop ?? 0;
  const feesCop = override?.feesCop ?? 0;
  const discountCop = override?.discountCop ?? 0;

  let allocationBasis: PoBreakdown['allocationBasis'] = 'subtotal';
  if (sumSubtotalCop <= 0 && sumQty > 0) allocationBasis = 'quantity';
  else if (sumSubtotalCop <= 0 && sumQty <= 0) allocationBasis = 'flat';

  const lineCount = Math.max(1, linesEnriched.length);
  const breakdownLines: PoBreakdownLine[] = linesEnriched.map(({ line, subtotalOriginal, subtotalCop }) => {
    let share = 0;
    if (allocationBasis === 'subtotal') {
      share = sumSubtotalCop > 0 ? subtotalCop / sumSubtotalCop : 0;
    } else if (allocationBasis === 'quantity') {
      share = sumQty > 0 ? line.quantity / sumQty : 0;
    } else {
      share = 1 / lineCount;
    }
    const shippingAlloc = shippingCop * share;
    const taxAlloc = taxCop * share;
    const opAlloc = orderProtectCop * share;
    const feesAlloc = feesCop * share;
    const discountAlloc = discountCop * share;
    const landedTotal = subtotalCop + shippingAlloc + taxAlloc + opAlloc + feesAlloc - discountAlloc;
    const landedUnit = line.quantity > 0 ? landedTotal / line.quantity : 0;
    return {
      lineId: line.id,
      product: line.product,
      sku: line.sku,
      materialId: line.materialId ?? null,
      quantity: line.quantity,
      unitCost: line.unitCost,
      unitCostCop: line.unitCost * fxRate,
      subtotalOriginal,
      subtotalCop,
      allocationShare: share,
      shippingAllocatedCop: shippingAlloc,
      taxAllocatedCop: taxAlloc,
      orderProtectAllocatedCop: opAlloc,
      feesAllocatedCop: feesAlloc,
      discountAllocatedCop: discountAlloc,
      landedTotalCop: landedTotal,
      landedUnitCop: landedUnit,
    };
  });

  const subtotalCopTotal = breakdownLines.reduce((s, l) => s + l.subtotalCop, 0);
  const totalLanded = breakdownLines.reduce((s, l) => s + l.landedTotalCop, 0);

  return {
    poId: po.id,
    poNumber: po.poNumber,
    date: po.date,
    supplier: po.supplier,
    currency: override?.currency ?? po.currency,
    fxRate,
    subtotalCop: subtotalCopTotal,
    shippingCop,
    taxCop,
    orderProtectCop,
    feesCop,
    discountCop,
    totalLandedCop: totalLanded,
    allocationBasis,
    override,
    lines: breakdownLines,
  };
}
