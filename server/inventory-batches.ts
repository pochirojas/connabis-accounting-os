// Phase 2.7 P0 — Inventory batch/lot tracking.
// A batch row is created every time a positive inventory_movement is posted
// (full receive or partial accept). The batch carries a deterministic tracking
// code, the qty received vs remaining, and the landed-unit-cost calculation
// (unit + allocated shipping/tax/fees). Consumption logic will decrement
// qtyRemaining FIFO in a later slice; today this table is the audit trail.
import Database from 'better-sqlite3';
import type { InventoryBatch } from '@shared/schema';

export function ensureInventoryBatchSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_code TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_name TEXT NOT NULL DEFAULT '',
      po_id INTEGER,
      po_number TEXT,
      po_line_id INTEGER,
      supplier TEXT NOT NULL DEFAULT '',
      received_date TEXT NOT NULL,
      qty_received REAL NOT NULL,
      qty_remaining REAL NOT NULL,
      unit_cost_cop REAL NOT NULL DEFAULT 0,
      landed_unit_cost_cop REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'COP',
      fx_rate REAL,
      shipping_allocated_cop REAL NOT NULL DEFAULT 0,
      tax_allocated_cop REAL NOT NULL DEFAULT 0,
      fees_allocated_cop REAL NOT NULL DEFAULT 0,
      discount_allocated_cop REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inv_batches_material ON inventory_batches(material_id, received_date);
    CREATE INDEX IF NOT EXISTS idx_inv_batches_po ON inventory_batches(po_id);
    CREATE INDEX IF NOT EXISTS idx_inv_batches_tracking ON inventory_batches(tracking_code);
  `);
}

// Deterministic, readable tracking code. Example: PO15-L132-20260525
//   PO   = source PO number
//   L    = PO line id (stable surrogate within the PO)
//   YYYYMMDD = received date
// Optional `-Nn` suffix when a duplicate is detected (extremely rare, only
// when a single line is partially-received on the same day with a different
// line_id == null insert path).
export function generateTrackingCode(
  sqlite: Database.Database,
  poNumber: string | null,
  poLineId: number | null,
  receivedDate: string,
): string {
  const safePo = (poNumber || 'MAN').replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  const linePart = poLineId ? `L${poLineId}` : 'LM';
  const datePart = (receivedDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const base = `${safePo}-${linePart}-${datePart}`;
  ensureInventoryBatchSchema(sqlite);
  const existing = sqlite.prepare(`SELECT COUNT(*) AS c FROM inventory_batches WHERE tracking_code LIKE ?`).get(`${base}%`) as { c: number };
  if (!existing || Number(existing.c) === 0) return base;
  return `${base}-N${Number(existing.c) + 1}`;
}

export type CreateBatchInput = {
  trackingCode?: string;
  materialId: string;
  materialName: string;
  poId: number | null;
  poNumber: string | null;
  poLineId: number | null;
  supplier: string;
  receivedDate: string;
  qtyReceived: number;
  unitCostCop: number;
  currency: string;
  fxRate: number | null;
  shippingAllocatedCop?: number;
  taxAllocatedCop?: number;
  feesAllocatedCop?: number;
  discountAllocatedCop?: number;
  note?: string | null;
};

export function createInventoryBatch(sqlite: Database.Database, input: CreateBatchInput): InventoryBatch {
  ensureInventoryBatchSchema(sqlite);
  const trackingCode = input.trackingCode && input.trackingCode.trim()
    ? input.trackingCode.trim()
    : generateTrackingCode(sqlite, input.poNumber, input.poLineId, input.receivedDate);
  const shipping = Math.max(0, Number(input.shippingAllocatedCop ?? 0));
  const tax = Math.max(0, Number(input.taxAllocatedCop ?? 0));
  const fees = Math.max(0, Number(input.feesAllocatedCop ?? 0));
  const discount = Math.max(0, Number(input.discountAllocatedCop ?? 0));
  const qty = Math.max(0, Number(input.qtyReceived));
  const unit = Math.max(0, Number(input.unitCostCop));
  const landedTotal = unit * qty + shipping + tax + fees - discount;
  const landedUnit = qty > 0 ? landedTotal / qty : 0;
  const createdAt = new Date().toISOString();
  const info = sqlite.prepare(`
    INSERT INTO inventory_batches (
      tracking_code, material_id, material_name, po_id, po_number, po_line_id,
      supplier, received_date, qty_received, qty_remaining, unit_cost_cop, landed_unit_cost_cop,
      currency, fx_rate, shipping_allocated_cop, tax_allocated_cop, fees_allocated_cop,
      discount_allocated_cop, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trackingCode, input.materialId, input.materialName, input.poId, input.poNumber, input.poLineId,
    input.supplier, input.receivedDate, qty, qty, unit, landedUnit,
    input.currency || 'COP', input.fxRate ?? null, shipping, tax, fees, discount,
    input.note ?? null, createdAt,
  );
  return {
    id: Number(info.lastInsertRowid),
    trackingCode,
    materialId: input.materialId,
    materialName: input.materialName,
    poId: input.poId,
    poNumber: input.poNumber,
    poLineId: input.poLineId,
    supplier: input.supplier,
    receivedDate: input.receivedDate,
    qtyReceived: qty,
    qtyRemaining: qty,
    unitCostCop: unit,
    landedUnitCostCop: landedUnit,
    currency: input.currency || 'COP',
    fxRate: input.fxRate ?? null,
    shippingAllocatedCop: shipping,
    taxAllocatedCop: tax,
    feesAllocatedCop: fees,
    discountAllocatedCop: discount,
    note: input.note ?? null,
    createdAt,
  };
}

function mapBatchRow(row: Record<string, unknown>): InventoryBatch {
  return {
    id: Number(row.id),
    trackingCode: String(row.tracking_code),
    materialId: String(row.material_id),
    materialName: String(row.material_name ?? ''),
    poId: row.po_id === null || row.po_id === undefined ? null : Number(row.po_id),
    poNumber: row.po_number === null || row.po_number === undefined ? null : String(row.po_number),
    poLineId: row.po_line_id === null || row.po_line_id === undefined ? null : Number(row.po_line_id),
    supplier: String(row.supplier ?? ''),
    receivedDate: String(row.received_date ?? ''),
    qtyReceived: Number(row.qty_received ?? 0),
    qtyRemaining: Number(row.qty_remaining ?? 0),
    unitCostCop: Number(row.unit_cost_cop ?? 0),
    landedUnitCostCop: Number(row.landed_unit_cost_cop ?? 0),
    currency: String(row.currency ?? 'COP'),
    fxRate: row.fx_rate === null || row.fx_rate === undefined ? null : Number(row.fx_rate),
    shippingAllocatedCop: Number(row.shipping_allocated_cop ?? 0),
    taxAllocatedCop: Number(row.tax_allocated_cop ?? 0),
    feesAllocatedCop: Number(row.fees_allocated_cop ?? 0),
    discountAllocatedCop: Number(row.discount_allocated_cop ?? 0),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    createdAt: String(row.created_at ?? ''),
  };
}

export function listInventoryBatches(
  sqlite: Database.Database,
  filter?: { materialId?: string; poNumber?: string; limit?: number },
): InventoryBatch[] {
  ensureInventoryBatchSchema(sqlite);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.materialId) { where.push('material_id = ?'); params.push(filter.materialId); }
  if (filter?.poNumber) { where.push('po_number = ?'); params.push(filter.poNumber); }
  const limit = Math.min(Math.max(filter?.limit ?? 500, 1), 5000);
  const sql = `
    SELECT id, tracking_code, material_id, material_name, po_id, po_number, po_line_id, supplier,
           received_date, qty_received, qty_remaining, unit_cost_cop, landed_unit_cost_cop, currency, fx_rate,
           shipping_allocated_cop, tax_allocated_cop, fees_allocated_cop, discount_allocated_cop, note, created_at
    FROM inventory_batches
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY received_date DESC, id DESC
    LIMIT ${limit}
  `;
  return (sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(mapBatchRow);
}

export function getBatchByTrackingCode(sqlite: Database.Database, trackingCode: string): InventoryBatch | null {
  ensureInventoryBatchSchema(sqlite);
  const row = sqlite.prepare(`
    SELECT id, tracking_code, material_id, material_name, po_id, po_number, po_line_id, supplier,
           received_date, qty_received, qty_remaining, unit_cost_cop, landed_unit_cost_cop, currency, fx_rate,
           shipping_allocated_cop, tax_allocated_cop, fees_allocated_cop, discount_allocated_cop, note, created_at
    FROM inventory_batches WHERE tracking_code = ?
  `).get(trackingCode) as Record<string, unknown> | undefined;
  return row ? mapBatchRow(row) : null;
}

// Decrement qty_remaining FIFO across a material's open batches. Returns the
// qty actually consumed (may be < `qty` if not enough remaining). Safe to call
// in a transaction. Used by upcoming consumption logic; today's report-only
// consumption endpoint does NOT call this.
export function consumeBatchesFifo(
  sqlite: Database.Database,
  materialId: string,
  qty: number,
): number {
  ensureInventoryBatchSchema(sqlite);
  if (qty <= 0) return 0;
  const open = sqlite.prepare(`
    SELECT id, qty_remaining FROM inventory_batches
    WHERE material_id = ? AND qty_remaining > 0
    ORDER BY received_date ASC, id ASC
  `).all(materialId) as Array<{ id: number; qty_remaining: number }>;
  let remaining = qty;
  let consumed = 0;
  const update = sqlite.prepare(`UPDATE inventory_batches SET qty_remaining = ? WHERE id = ?`);
  for (const batch of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.qty_remaining));
    update.run(Number(batch.qty_remaining) - take, batch.id);
    remaining -= take;
    consumed += take;
  }
  return consumed;
}
