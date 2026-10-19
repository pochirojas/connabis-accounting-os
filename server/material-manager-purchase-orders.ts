// Phase 2.2 — Real Material Manager purchase orders.
// Source: the per-PO CSV files exported from Material Manager (one CSV per PO
// living in /home/user/workspace/purchase_order_po*.csv). These replace the
// legacy seed POs from server/seed.ts. PO10 is intentionally absent from the
// CSV set (cancelled by the business) and is recorded here with status
// "cancelled" so it shows up in the UI but does NOT contribute to totals.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  InventoryMovement,
  MmPurchaseOrder,
  MmPurchaseOrderLine,
  MmPurchaseOrdersStatus,
  ReceivePoResult,
} from '@shared/schema';
import { createInventoryBatch, ensureInventoryBatchSchema, generateTrackingCode } from './inventory-batches';
import { buildPoBreakdown, ensurePoCostOverrideSchema } from './po-cost-breakdown';

import { PO_CSV_DIR } from './config';
const PO_CSV_GLOB = /^purchase_order_po(\d+)(?:-\d+)?\.csv$/i;
// Cancelled / missing POs. They have no CSV but should appear in the UI as
// cancelled rows so users see the gap. They don't add to totals/stock.
const CANCELLED_POS: Array<{ poNumber: string; note: string }> = [
  { poNumber: 'PO10', note: 'PO10 cancelled — no CSV provided, excluded from totals/stock.' },
];

export function ensureMmPurchaseOrderSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS material_manager_purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      ship_to TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'COP',
      reference_number TEXT,
      notes TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      taxes REAL NOT NULL DEFAULT 0,
      shipping REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'received',
      source_file TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS material_manager_purchase_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      po_number TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      tax_pct REAL NOT NULL DEFAULT 0,
      total_cop REAL NOT NULL DEFAULT 0,
      line_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES material_manager_purchase_orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mm_po_lines_po ON material_manager_purchase_order_lines(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_mm_po_lines_sku ON material_manager_purchase_order_lines(sku);

    -- Append-only inventory ledger. Idempotency is enforced by the unique
    -- index on (po_line_id) for non-null PO lines: a given PO line can
    -- contribute at most one positive movement; reversals are inserted as
    -- separate compensating rows with po_line_id=NULL and a note.
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_key TEXT NOT NULL,
      material_name TEXT NOT NULL DEFAULT '',
      po_id INTEGER,
      po_number TEXT,
      po_line_id INTEGER,
      qty_delta REAL NOT NULL,
      unit_cost_cop REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'COP',
      fx_rate REAL,
      batch_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inv_mv_material ON inventory_movements(material_key, date);
    CREATE INDEX IF NOT EXISTS idx_inv_mv_po ON inventory_movements(po_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_inv_mv_line ON inventory_movements(po_line_id) WHERE po_line_id IS NOT NULL;
  `);

  // Migration: older builds did not have material_id / batch_id columns on PO
  // lines. Add them best-effort (idempotent).
  const lineCols = sqlite.prepare(`PRAGMA table_info(material_manager_purchase_order_lines)`).all() as Array<{ name: string }>;
  const haveCol = (name: string) => lineCols.some(c => c.name === name);
  if (!haveCol('material_id')) {
    try { sqlite.exec(`ALTER TABLE material_manager_purchase_order_lines ADD COLUMN material_id TEXT`); } catch { /* noop */ }
  }
  if (!haveCol('batch_id')) {
    try { sqlite.exec(`ALTER TABLE material_manager_purchase_order_lines ADD COLUMN batch_id TEXT`); } catch { /* noop */ }
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_mm_po_lines_material ON material_manager_purchase_order_lines(material_id);`);
}

// ---------- CSV parser ----------

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// Tokenize the entire CSV (multi-line cells supported via quoted regions).
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  const cleaned = text.replace(/^﻿/, '');
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      records.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    records.push(row);
  }
  return records;
}

function cleanCell(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  return value.replace(/\r/g, '').trim();
}

function parseFloatLoose(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parsePercentLoose(value: string | undefined): number {
  if (!value) return 0;
  // "0%" → 0, "12%" → 12, "12.5" → 12.5
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(value: string): string {
  // "April 20, 2025" → 2025-04-20
  if (!value) return '';
  const cleaned = value.replace(/"/g, '').trim();
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return cleaned;
}

type ParsedPo = {
  poNumber: string;
  date: string;
  supplier: string;
  shipTo: string;
  currency: string;
  referenceNumber: string | null;
  notes: string | null;
  subtotal: number;
  taxes: number;
  shipping: number;
  total: number;
  lines: Array<{
    product: string;
    sku: string;
    quantity: number;
    unitCost: number;
    taxPct: number;
    totalCop: number;
  }>;
  sourceFile: string;
};

export function parsePurchaseOrderCsv(filePath: string): ParsedPo | null {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf-8');
  const records = parseCsvRecords(text);
  if (records.length === 0) return null;

  // Row 1 typically: ["Connabis Colombia", "", "", "", "#PO1", "April 20, 2025"]
  const header = records[0] ?? [];
  const poRaw = cleanCell(header[4]) || cleanCell(header.find(c => /^#?PO\d+/i.test(c.trim())) ?? '');
  const dateRaw = cleanCell(header[5]) || cleanCell(header.find(c => /\d{4}/.test(c) && /[A-Za-z]/.test(c)) ?? '');
  const poNumber = poRaw.replace(/^#/, '').toUpperCase();
  const date = parseDateLoose(dateRaw);

  // Find supplier/ship-to/currency row — the row after "Supplier,Ship to,Currency".
  let supplier = '';
  let shipTo = '';
  let currency = 'COP';
  for (let i = 0; i < records.length - 1; i += 1) {
    const r = records[i] ?? [];
    if (r[0]?.trim() === 'Supplier' && r[1]?.trim() === 'Ship to') {
      const data = records[i + 1] ?? [];
      supplier = cleanCell(data[0]).split('\n')[0]?.trim() ?? '';
      shipTo = cleanCell(data[1]).replace(/\n+/g, ', ');
      currency = cleanCell(data[2]) || 'COP';
      break;
    }
  }

  // Find product header row, then collect lines until a blank row or summary.
  const lines: ParsedPo['lines'] = [];
  let inLines = false;
  let summaryStart = -1;
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i] ?? [];
    const c0 = cleanCell(r[0]);
    const c1 = cleanCell(r[1]);
    if (!inLines) {
      // Header row: ,Product,SKU,Quantity,Cost,Tax,Total(COP) OR Product,SKU,...
      if (c0 === 'Product' || c1 === 'Product') {
        inLines = true;
      }
      continue;
    }
    // Inside line section.
    if (c0 === 'Reference number' || c1 === 'Reference number' || cleanCell(r[4]) === 'Cost summary') {
      summaryStart = i;
      break;
    }
    if (r.every(cell => cleanCell(cell) === '')) {
      // Blank row ends the line section.
      summaryStart = i + 1;
      break;
    }
    // Data row. Two layouts observed:
    //   Layout A: [<blank>, Product, SKU, Qty, Cost, Tax, Total]  (7 cols, common)
    //   Layout B: [Product, SKU, Qty, Cost, Tax, Total]            (6 cols)
    const cells = r.map(cleanCell);
    let product = '';
    let sku = '';
    let qty = '';
    let cost = '';
    let tax = '';
    let total = '';
    if (cells.length >= 7 && cells[0] === '') {
      [, product, sku, qty, cost, tax, total] = cells;
    } else if (cells.length >= 6) {
      [product, sku, qty, cost, tax, total] = cells;
    } else {
      continue;
    }
    if (!product && !sku && !qty) continue;
    lines.push({
      product,
      sku,
      quantity: parseFloatLoose(qty),
      unitCost: parseFloatLoose(cost),
      taxPct: parsePercentLoose(tax),
      totalCop: parseFloatLoose(total),
    });
  }

  // Summary block — typically column 4 has "Subtotal/Taxes/Shipping/Total".
  let subtotal = 0;
  let taxes = 0;
  let shipping = 0;
  let total = 0;
  let referenceNumber: string | null = null;
  let notes: string | null = null;
  const summaryRows = summaryStart > 0 ? records.slice(summaryStart) : [];
  for (const r of summaryRows) {
    const cells = r.map(cleanCell);
    const label = cells[4] ?? '';
    const valueRaw = cells[5] ?? cells[6] ?? '';
    if (/^Subtotal$/i.test(label)) subtotal = parseFloatLoose(valueRaw);
    else if (/^Taxes$/i.test(label)) taxes = parseFloatLoose(valueRaw);
    else if (/^Shipping/i.test(label)) shipping = parseFloatLoose(valueRaw);
    else if (/^Total/i.test(label)) total = parseFloatLoose(valueRaw);
    // Reference number lives in col 0/1 right after the "Reference number" row.
    if (cells[0] === 'Reference number') continue;
    if (cells[0] === 'Notes') continue;
  }
  // Re-scan for reference number / notes (the row labels appear in col 0 and the
  // value is in the row BELOW or in the same row col 0/1 of the next pair).
  for (let i = 0; i < summaryRows.length; i += 1) {
    const r = summaryRows[i] ?? [];
    const c0 = cleanCell(r[0]);
    if (c0 === 'Reference number') {
      const next = summaryRows[i + 1] ?? [];
      const candidate = cleanCell(next[0]);
      if (candidate && candidate !== 'Notes') referenceNumber = candidate;
    }
    if (c0 === 'Notes') {
      const next = summaryRows[i + 1] ?? [];
      const candidate = cleanCell(next[0]);
      if (candidate) notes = candidate;
    }
  }
  // Sometimes reference number / notes appear inline in the same row as the
  // labels, e.g. the file has "Gilded Order #45543" right next to "Reference number".
  for (let i = 0; i < summaryRows.length; i += 1) {
    const r = summaryRows[i] ?? [];
    const c0 = cleanCell(r[0]);
    const prev = summaryRows[i - 1] ?? [];
    if (prev[0]?.trim() === 'Reference number' && c0 && !referenceNumber) {
      referenceNumber = c0;
    }
    if (prev[0]?.trim() === 'Notes' && c0 && !notes) {
      notes = c0;
    }
  }

  if (!poNumber) return null;

  return {
    poNumber,
    date,
    supplier,
    shipTo,
    currency: currency || 'COP',
    referenceNumber,
    notes,
    subtotal,
    taxes,
    shipping,
    total,
    lines,
    sourceFile: filePath,
  };
}

// ---------- Import ----------

export type ImportPosResult = {
  importedPos: number;
  cancelledPos: number;
  importedLines: number;
  skipped: Array<{ file: string; reason: string }>;
  files: string[];
};

export function importMmPurchaseOrders(sqlite: Database.Database): ImportPosResult {
  ensureMmPurchaseOrderSchema(sqlite);
  const files = fs.existsSync(PO_CSV_DIR)
    ? fs.readdirSync(PO_CSV_DIR)
        .filter(name => PO_CSV_GLOB.test(name))
        .map(name => path.join(PO_CSV_DIR, name))
        .sort()
    : [];
  const importedAt = new Date().toISOString();
  const skipped: ImportPosResult['skipped'] = [];
  let importedPos = 0;
  let importedLines = 0;
  let cancelledPos = 0;

  const tx = sqlite.transaction(() => {
    // Preserve manually-created POs (source_file = 'manual') so reimporting the
    // CSV set never destroys hand-entered orders. Cascading delete on the lines
    // table is handled by the FK.
    const manualIdRows = sqlite.prepare(`SELECT id FROM material_manager_purchase_orders WHERE source_file = 'manual'`).all() as Array<{ id: number }>;
    const manualIds = manualIdRows.map(r => Number(r.id));
    if (manualIds.length) {
      const placeholders = manualIds.map(() => '?').join(',');
      sqlite.prepare(`DELETE FROM material_manager_purchase_order_lines WHERE purchase_order_id NOT IN (${placeholders})`).run(...manualIds);
      sqlite.prepare(`DELETE FROM material_manager_purchase_orders WHERE id NOT IN (${placeholders})`).run(...manualIds);
    } else {
      sqlite.prepare('DELETE FROM material_manager_purchase_order_lines').run();
      sqlite.prepare('DELETE FROM material_manager_purchase_orders').run();
    }

    const insertPo = sqlite.prepare(`
      INSERT INTO material_manager_purchase_orders (
        po_number, date, supplier, ship_to, currency, reference_number, notes,
        subtotal, taxes, shipping, total, status, source_file, imported_at
      ) VALUES (
        @po_number, @date, @supplier, @ship_to, @currency, @reference_number, @notes,
        @subtotal, @taxes, @shipping, @total, @status, @source_file, @imported_at
      )
    `);
    const insertLine = sqlite.prepare(`
      INSERT INTO material_manager_purchase_order_lines (
        purchase_order_id, po_number, product, sku, quantity, unit_cost, tax_pct, total_cop, line_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of files) {
      const parsed = parsePurchaseOrderCsv(file);
      if (!parsed) {
        skipped.push({ file, reason: 'parse_failed' });
        continue;
      }
      const info = insertPo.run({
        po_number: parsed.poNumber,
        date: parsed.date,
        supplier: parsed.supplier,
        ship_to: parsed.shipTo,
        currency: parsed.currency,
        reference_number: parsed.referenceNumber,
        notes: parsed.notes,
        subtotal: parsed.subtotal,
        taxes: parsed.taxes,
        shipping: parsed.shipping,
        total: parsed.total,
        status: 'received',
        source_file: parsed.sourceFile,
        imported_at: importedAt,
      });
      const poId = Number(info.lastInsertRowid);
      parsed.lines.forEach((line, idx) => {
        insertLine.run(
          poId,
          parsed.poNumber,
          line.product,
          line.sku,
          line.quantity,   // float — never rounded
          line.unitCost,
          line.taxPct,
          line.totalCop,
          idx,
        );
        importedLines += 1;
      });
      importedPos += 1;
    }

    // Cancelled / missing POs — recorded but never counted in totals.
    for (const c of CANCELLED_POS) {
      try {
        insertPo.run({
          po_number: c.poNumber,
          date: '',
          supplier: '',
          ship_to: '',
          currency: 'COP',
          reference_number: null,
          notes: c.note,
          subtotal: 0,
          taxes: 0,
          shipping: 0,
          total: 0,
          status: 'cancelled',
          source_file: null,
          imported_at: importedAt,
        });
        cancelledPos += 1;
      } catch {
        // duplicate po_number — skip silently
      }
    }
  });
  tx();

  return { importedPos, cancelledPos, importedLines, skipped, files };
}

// ---------- Read accessors ----------

function mapPoRow(row: Record<string, unknown>, lineCount: number): MmPurchaseOrder {
  return {
    id: Number(row.id),
    poNumber: String(row.po_number),
    date: String(row.date ?? ''),
    supplier: String(row.supplier ?? ''),
    shipTo: String(row.ship_to ?? ''),
    currency: String(row.currency ?? 'COP'),
    referenceNumber: row.reference_number === null || row.reference_number === undefined
      ? null : String(row.reference_number),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    subtotal: Number(row.subtotal ?? 0),
    taxes: Number(row.taxes ?? 0),
    shipping: Number(row.shipping ?? 0),
    total: Number(row.total ?? 0),
    status: (row.status === 'cancelled' ? 'cancelled' : row.status === 'draft' ? 'draft' : 'received') as MmPurchaseOrder['status'],
    sourceFile: row.source_file === null || row.source_file === undefined ? null : String(row.source_file),
    importedAt: String(row.imported_at ?? ''),
    lineCount,
  };
}

function mapPoLineRow(row: Record<string, unknown>): MmPurchaseOrderLine {
  return {
    id: Number(row.id),
    purchaseOrderId: Number(row.purchase_order_id),
    poNumber: String(row.po_number),
    product: String(row.product ?? ''),
    sku: String(row.sku ?? ''),
    quantity: Number(row.quantity ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    taxPct: Number(row.tax_pct ?? 0),
    totalCop: Number(row.total_cop ?? 0),
    lineIndex: Number(row.line_index ?? 0),
    materialId: row.material_id === null || row.material_id === undefined ? null : String(row.material_id),
    batchId: row.batch_id === null || row.batch_id === undefined ? null : String(row.batch_id),
  };
}

function poNumberSortKey(po: { poNumber: string }) {
  const m = po.poNumber.match(/^PO(\d+)/i);
  return m ? Number(m[1]) : 0;
}

// Descending: newest date first; if date missing, fall back to highest PO number.
// Cancelled POs (e.g. PO10) keep their date if present and otherwise sort by PO number,
// never throwing the order off.
function poSortDescCompare(a: MmPurchaseOrder, b: MmPurchaseOrder): number {
  const aHasDate = Boolean(a.date);
  const bHasDate = Boolean(b.date);
  if (aHasDate && bHasDate) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return poNumberSortKey(b) - poNumberSortKey(a);
  }
  if (aHasDate) return -1;
  if (bHasDate) return 1;
  return poNumberSortKey(b) - poNumberSortKey(a);
}

export function listMmPurchaseOrders(sqlite: Database.Database): MmPurchaseOrder[] {
  ensureMmPurchaseOrderSchema(sqlite);
  const rows = sqlite.prepare(`
    SELECT id, po_number, date, supplier, ship_to, currency, reference_number, notes,
           subtotal, taxes, shipping, total, status, source_file, imported_at
    FROM material_manager_purchase_orders
  `).all() as Array<Record<string, unknown>>;
  const counts = sqlite.prepare(`
    SELECT purchase_order_id AS poId, COUNT(*) AS c
    FROM material_manager_purchase_order_lines
    GROUP BY purchase_order_id
  `).all() as Array<{ poId: number; c: number }>;
  const countById = new Map(counts.map(r => [Number(r.poId), Number(r.c)]));
  return rows
    .map(r => mapPoRow(r, countById.get(Number(r.id)) ?? 0))
    .sort(poSortDescCompare);
}

export function getMmPurchaseOrder(sqlite: Database.Database, idOrNumber: string | number): MmPurchaseOrder | null {
  ensureMmPurchaseOrderSchema(sqlite);
  const isNumber = typeof idOrNumber === 'number' || /^\d+$/.test(String(idOrNumber));
  const row = (isNumber
    ? sqlite.prepare(`
        SELECT id, po_number, date, supplier, ship_to, currency, reference_number, notes,
               subtotal, taxes, shipping, total, status, source_file, imported_at
        FROM material_manager_purchase_orders WHERE id = ?
      `).get(Number(idOrNumber))
    : sqlite.prepare(`
        SELECT id, po_number, date, supplier, ship_to, currency, reference_number, notes,
               subtotal, taxes, shipping, total, status, source_file, imported_at
        FROM material_manager_purchase_orders WHERE po_number = ?
      `).get(String(idOrNumber).toUpperCase())
  ) as Record<string, unknown> | undefined;
  if (!row) return null;
  const poId = Number(row.id);
  const lines = (sqlite.prepare(`
    SELECT id, purchase_order_id, po_number, product, sku, quantity, unit_cost, tax_pct, total_cop, line_index,
           material_id, batch_id
    FROM material_manager_purchase_order_lines
    WHERE purchase_order_id = ?
    ORDER BY line_index ASC, id ASC
  `).all(poId) as Array<Record<string, unknown>>).map(mapPoLineRow);
  const mapped = mapPoRow(row, lines.length);
  mapped.lines = lines;
  return mapped;
}

export function getMmPurchaseOrdersStatus(sqlite: Database.Database): MmPurchaseOrdersStatus {
  ensureMmPurchaseOrderSchema(sqlite);
  const totals = sqlite.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'received'  THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN status = 'draft'     THEN 1 ELSE 0 END) AS drafts,
      COALESCE(SUM(CASE WHEN status = 'received' THEN total ELSE 0 END), 0) AS totalAmount
    FROM material_manager_purchase_orders
  `).get() as { total: number; cancelled: number; received: number; drafts: number; totalAmount: number };
  const linesRow = sqlite.prepare('SELECT COUNT(*) AS c FROM material_manager_purchase_order_lines').get() as { c: number };
  const suppliersRow = sqlite.prepare(`
    SELECT COUNT(DISTINCT supplier) AS c
    FROM material_manager_purchase_orders
    WHERE status = 'received' AND supplier != ''
  `).get() as { c: number };
  const lastRow = sqlite.prepare(`
    SELECT imported_at FROM material_manager_purchase_orders ORDER BY imported_at DESC LIMIT 1
  `).get() as { imported_at?: string } | undefined;
  return {
    totalPos: Number(totals.total ?? 0),
    cancelledPos: Number(totals.cancelled ?? 0),
    receivedPos: Number(totals.received ?? 0),
    draftPos: Number(totals.drafts ?? 0),
    totalAmount: Number(totals.totalAmount ?? 0),
    totalLines: Number(linesRow.c ?? 0),
    suppliers: Number(suppliersRow.c ?? 0),
    lastImportedAt: lastRow?.imported_at ? String(lastRow.imported_at) : null,
  };
}

// ---------- Manual PO creation (Phase 2.2+) ----------
// Manually-entered purchase orders live alongside the CSV-imported ones but
// are tagged with `source_file = 'manual'`. They survive reimporting the CSV
// set and are included in totals/status so the UI works for new in-house POs.
export type CreateManualPoInput = {
  poNumber?: string;          // optional — auto-assigned if omitted
  date: string;               // YYYY-MM-DD
  supplier: string;
  shipTo?: string;
  currency?: string;
  referenceNumber?: string | null;
  notes?: string | null;
  shipping?: number;
  taxes?: number;
  // Phase 2.2 P0: 'draft' = created but not received (no inventory effect).
  // 'received' = legacy behavior, also auto-creates inventory movements.
  status?: 'draft' | 'received';
  lines: Array<{
    product: string;
    sku?: string;
    quantity: number;
    unitCost: number;
    taxPct?: number;
    // Canonical Material Manager material id. If omitted/null, the line is
    // treated as "unmatched/manual" — visible in the UI with a warning so the
    // user can match it before receiving. Receive flow skips unmatched lines.
    materialId?: string | null;
  }>;
};

function nextManualPoNumber(sqlite: Database.Database): string {
  ensureMmPurchaseOrderSchema(sqlite);
  const rows = sqlite.prepare(`SELECT po_number FROM material_manager_purchase_orders`).all() as Array<{ po_number: string }>;
  let maxN = 0;
  rows.forEach(r => {
    const m = String(r.po_number).match(/^PO(\d+)/i);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  });
  return `PO${maxN + 1}`;
}

export function createMmPurchaseOrder(sqlite: Database.Database, input: CreateManualPoInput): MmPurchaseOrder {
  ensureMmPurchaseOrderSchema(sqlite);
  if (!input.lines.length) throw new Error('po_requires_lines');
  if (!input.supplier.trim()) throw new Error('po_requires_supplier');
  if (!input.date) throw new Error('po_requires_date');

  const poNumber = (input.poNumber && input.poNumber.trim()) ? input.poNumber.trim() : nextManualPoNumber(sqlite);
  const existing = sqlite.prepare('SELECT id FROM material_manager_purchase_orders WHERE po_number = ?').get(poNumber);
  if (existing) throw new Error(`po_already_exists:${poNumber}`);

  const importedAt = new Date().toISOString();
  const shipping = Number(input.shipping ?? 0) || 0;
  const taxesOverride = Number(input.taxes ?? 0) || 0;
  let subtotal = 0;
  let taxes = 0;
  const linesPrepared = input.lines.map((line, idx) => {
    const qty = Number(line.quantity) || 0;
    const unitCost = Number(line.unitCost) || 0;
    const taxPct = Number(line.taxPct ?? 0) || 0;
    const lineSubtotal = qty * unitCost;
    const lineTax = lineSubtotal * (taxPct / 100);
    subtotal += lineSubtotal;
    taxes += lineTax;
    return {
      product: line.product,
      sku: line.sku ?? '',
      quantity: qty,
      unitCost,
      taxPct,
      totalCop: lineSubtotal + lineTax,
      lineIndex: idx,
      materialId: line.materialId && String(line.materialId).trim() ? String(line.materialId).trim() : null,
    };
  });
  if (taxesOverride > 0) taxes = taxesOverride;
  const total = subtotal + taxes + shipping;

  const initialStatus: 'draft' | 'received' = input.status === 'draft' ? 'draft' : 'received';
  const tx = sqlite.transaction(() => {
    const info = sqlite.prepare(`
      INSERT INTO material_manager_purchase_orders (
        po_number, date, supplier, ship_to, currency, reference_number, notes,
        subtotal, taxes, shipping, total, status, source_file, imported_at
      ) VALUES (
        @po_number, @date, @supplier, @ship_to, @currency, @reference_number, @notes,
        @subtotal, @taxes, @shipping, @total, @status, 'manual', @imported_at
      )
    `).run({
      po_number: poNumber,
      date: input.date,
      supplier: input.supplier.trim(),
      ship_to: input.shipTo ?? '',
      currency: input.currency ?? 'COP',
      reference_number: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      subtotal,
      taxes,
      shipping,
      total,
      status: initialStatus,
      imported_at: importedAt,
    });
    const poId = Number(info.lastInsertRowid);
    const insertLine = sqlite.prepare(`
      INSERT INTO material_manager_purchase_order_lines (
        purchase_order_id, po_number, product, sku, quantity, unit_cost, tax_pct, total_cop, line_index, material_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    linesPrepared.forEach(line => {
      insertLine.run(poId, poNumber, line.product, line.sku, line.quantity, line.unitCost, line.taxPct, line.totalCop, line.lineIndex, line.materialId);
    });
    return poId;
  });
  tx();
  // For backward compatibility, when a 'received' manual PO is created we also
  // post inventory movements for matched lines so stock + latest cost update
  // immediately. Drafts wait for an explicit receive call.
  if (initialStatus === 'received') {
    try { receivePurchaseOrder(sqlite, poNumber); } catch { /* best-effort */ }
  }
  const created = getMmPurchaseOrder(sqlite, poNumber);
  if (!created) throw new Error('po_create_failed');
  return created;
}

// ---------- Inventory movements + receive flow (Phase 2.2 P0) ----------

function mapMovementRow(row: Record<string, unknown>): InventoryMovement {
  return {
    id: Number(row.id),
    materialKey: String(row.material_key),
    materialName: String(row.material_name ?? ''),
    poId: row.po_id === null || row.po_id === undefined ? null : Number(row.po_id),
    poNumber: row.po_number === null || row.po_number === undefined ? null : String(row.po_number),
    poLineId: row.po_line_id === null || row.po_line_id === undefined ? null : Number(row.po_line_id),
    qtyDelta: Number(row.qty_delta ?? 0),
    unitCostCop: Number(row.unit_cost_cop ?? 0),
    date: String(row.date ?? ''),
    supplier: String(row.supplier ?? ''),
    currency: String(row.currency ?? 'COP'),
    fxRate: row.fx_rate === null || row.fx_rate === undefined ? null : Number(row.fx_rate),
    batchId: row.batch_id === null || row.batch_id === undefined ? null : String(row.batch_id),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    createdAt: String(row.created_at ?? ''),
  };
}

export function listInventoryMovements(
  sqlite: Database.Database,
  filter?: { materialKey?: string; poNumber?: string; limit?: number },
): InventoryMovement[] {
  ensureMmPurchaseOrderSchema(sqlite);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.materialKey) { where.push('material_key = ?'); params.push(filter.materialKey); }
  if (filter?.poNumber) { where.push('po_number = ?'); params.push(filter.poNumber); }
  const limit = Math.min(Math.max(filter?.limit ?? 500, 1), 5000);
  const sql = `
    SELECT id, material_key, material_name, po_id, po_number, po_line_id, qty_delta, unit_cost_cop,
           date, supplier, currency, fx_rate, batch_id, note, created_at
    FROM inventory_movements
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY date DESC, id DESC
    LIMIT ${limit}
  `;
  return (sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(mapMovementRow);
}

function generateBatchId(poNumber: string, lineId: number): string {
  return `${poNumber}-L${lineId}-${Date.now().toString(36)}`;
}

// Compute the allocated shipping/tax/fees/discount for each PO line at receive
// time. Re-uses the same breakdown engine the UI calls so receive-time landed
// cost = displayed degloss. Returns a map keyed by line id.
function computeLineAllocations(sqlite: Database.Database, poId: number | string) {
  try {
    const breakdown = buildPoBreakdown(sqlite, poId);
    if (!breakdown) return new Map<number, { shipping: number; tax: number; fees: number; discount: number; landedUnitCop: number }>();
    const map = new Map<number, { shipping: number; tax: number; fees: number; discount: number; landedUnitCop: number }>();
    breakdown.lines.forEach(l => {
      map.set(l.lineId, {
        shipping: l.shippingAllocatedCop,
        tax: l.taxAllocatedCop,
        fees: l.feesAllocatedCop + l.orderProtectAllocatedCop,
        discount: l.discountAllocatedCop,
        landedUnitCop: l.landedUnitCop,
      });
    });
    return map;
  } catch {
    return new Map<number, { shipping: number; tax: number; fees: number; discount: number; landedUnitCop: number }>();
  }
}

// Idempotent: inserts a positive movement per matched (materialId != null) PO
// line that does NOT already have one. Unmatched lines are reported in the
// `unmatchedLines` count and never silently update stock.
export function receivePurchaseOrder(sqlite: Database.Database, idOrNumber: string | number): ReceivePoResult {
  ensureMmPurchaseOrderSchema(sqlite);
  ensureInventoryBatchSchema(sqlite);
  ensurePoCostOverrideSchema(sqlite);
  const po = getMmPurchaseOrder(sqlite, idOrNumber);
  if (!po) throw new Error('po_not_found');
  if (po.status === 'cancelled') throw new Error('po_cancelled_cannot_receive');

  const createdAt = new Date().toISOString();
  const allocByLine = computeLineAllocations(sqlite, po.id);
  let movementsCreated = 0;
  let movementsSkipped = 0;
  let matchedLines = 0;
  let unmatchedLines = 0;

  const insertMv = sqlite.prepare(`
    INSERT INTO inventory_movements (
      material_key, material_name, po_id, po_number, po_line_id, qty_delta, unit_cost_cop,
      date, supplier, currency, fx_rate, batch_id, note, created_at
    ) VALUES (
      @material_key, @material_name, @po_id, @po_number, @po_line_id, @qty_delta, @unit_cost_cop,
      @date, @supplier, @currency, @fx_rate, @batch_id, @note, @created_at
    )
  `);
  const updateLineBatch = sqlite.prepare(`UPDATE material_manager_purchase_order_lines SET batch_id = ? WHERE id = ?`);
  // Latest-price update is applied as a local material override so the
  // pristine MM mirror is untouched. We import lazily to avoid a circular
  // require — material-manager-mirror imports this file in some flows.
  const upsertOverride = sqlite.prepare(`
    INSERT INTO material_manager_material_overrides (
      material_id, cost, supplier, updated_at, note
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(material_id) DO UPDATE SET
      cost = excluded.cost,
      supplier = excluded.supplier,
      updated_at = excluded.updated_at
  `);

  const tx = sqlite.transaction(() => {
    for (const line of po.lines ?? []) {
      if (!line.materialId) { unmatchedLines += 1; continue; }
      matchedLines += 1;
      // Idempotency: skip when a movement for this exact line already exists.
      const existing = sqlite.prepare(`SELECT 1 FROM inventory_movements WHERE po_line_id = ?`).get(line.id);
      if (existing) { movementsSkipped += 1; continue; }
      const materialRow = sqlite.prepare(`SELECT name FROM material_manager_materials WHERE id = ?`).get(line.materialId) as { name?: string } | undefined;
      const materialName = materialRow?.name ?? line.product;
      const receivedDate = po.date || createdAt.slice(0, 10);
      const batchId = line.batchId && line.batchId.trim()
        ? line.batchId
        : generateTrackingCode(sqlite, po.poNumber, line.id, receivedDate);
      const alloc = allocByLine.get(line.id) ?? { shipping: 0, tax: 0, fees: 0, discount: 0, landedUnitCop: line.unitCost };
      insertMv.run({
        material_key: line.materialId,
        material_name: materialName,
        po_id: po.id,
        po_number: po.poNumber,
        po_line_id: line.id,
        qty_delta: line.quantity,
        unit_cost_cop: line.unitCost,
        date: receivedDate,
        supplier: po.supplier,
        currency: po.currency,
        fx_rate: null,
        batch_id: batchId,
        note: null,
        created_at: createdAt,
      });
      updateLineBatch.run(batchId, line.id);
      // Create the batch ledger row alongside the inventory movement so
      // tracking codes, landed cost, and allocations are persisted.
      createInventoryBatch(sqlite, {
        trackingCode: batchId,
        materialId: line.materialId,
        materialName,
        poId: po.id,
        poNumber: po.poNumber,
        poLineId: line.id,
        supplier: po.supplier,
        receivedDate,
        qtyReceived: line.quantity,
        unitCostCop: line.unitCost,
        currency: po.currency,
        fxRate: null,
        shippingAllocatedCop: alloc.shipping,
        taxAllocatedCop: alloc.tax,
        feesAllocatedCop: alloc.fees,
        discountAllocatedCop: alloc.discount,
        note: null,
      });
      // Push latest unit cost + supplier into the material override (does not
      // mutate the pristine MM row used for round-trip export).
      if (line.unitCost > 0) {
        upsertOverride.run(line.materialId, line.unitCost, po.supplier || '', createdAt, null);
      }
      movementsCreated += 1;
    }
    // Bump PO status to 'received' once at least one line is in the ledger.
    if (po.status !== 'received') {
      sqlite.prepare(`UPDATE material_manager_purchase_orders SET status = 'received' WHERE id = ?`).run(po.id);
    }
  });
  tx();

  return {
    poNumber: po.poNumber,
    status: 'received',
    movementsCreated,
    movementsSkipped,
    matchedLines,
    unmatchedLines,
  };
}

// Partial / per-line receive flow (Phase 2.6 P0). The MM UI lets the user
// type an Accept qty + Reject qty per line, with "All unreceived" shortcuts.
// We translate that into inventory_movements:
//   * Accept qty > 0 → positive movement (idempotency check by sum-of-accepted
//     so re-submitting the same partial receive doesn't double-post).
//   * Reject qty > 0 → negative-quantity movement tagged `rejection_of:<lineId>`
//     so it shows up in the adjustment history without polluting stock.
// Unmatched lines (no materialId) are skipped and counted in unmatchedLines.
export type PartialReceiveLineInput = {
  lineId: number;
  accept?: number;
  reject?: number;
};

export type PartialReceiveResult = {
  poNumber: string;
  status: MmPoStatus;
  acceptCreated: number;
  rejectCreated: number;
  matchedLines: number;
  unmatchedLines: number;
  totalAccepted: number;
  totalOrdered: number;
};

export function receivePurchaseOrderPartial(
  sqlite: Database.Database,
  idOrNumber: string | number,
  lines: PartialReceiveLineInput[],
): PartialReceiveResult {
  ensureMmPurchaseOrderSchema(sqlite);
  ensureInventoryBatchSchema(sqlite);
  ensurePoCostOverrideSchema(sqlite);
  const po = getMmPurchaseOrder(sqlite, idOrNumber);
  if (!po) throw new Error('po_not_found');
  if (po.status === 'cancelled') throw new Error('po_cancelled_cannot_receive');
  const allocByLinePartial = computeLineAllocations(sqlite, po.id);

  const createdAt = new Date().toISOString();
  let acceptCreated = 0;
  let rejectCreated = 0;
  let matchedLines = 0;
  let unmatchedLines = 0;
  let totalAccepted = 0;
  let totalOrdered = 0;

  const linesByPoId = new Map((po.lines ?? []).map(l => [l.id, l] as const));

  const insertMv = sqlite.prepare(`
    INSERT INTO inventory_movements (
      material_key, material_name, po_id, po_number, po_line_id, qty_delta, unit_cost_cop,
      date, supplier, currency, fx_rate, batch_id, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateLineBatch = sqlite.prepare(`UPDATE material_manager_purchase_order_lines SET batch_id = ? WHERE id = ?`);
  const upsertOverride = sqlite.prepare(`
    INSERT INTO material_manager_material_overrides (
      material_id, cost, supplier, updated_at, note
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(material_id) DO UPDATE SET
      cost = excluded.cost,
      supplier = excluded.supplier,
      updated_at = excluded.updated_at
  `);

  const tx = sqlite.transaction(() => {
    for (const line of po.lines ?? []) {
      totalOrdered += line.quantity;
    }
    for (const input of lines) {
      const line = linesByPoId.get(input.lineId);
      if (!line) continue;
      const accept = Math.max(0, Number(input.accept ?? 0));
      const reject = Math.max(0, Number(input.reject ?? 0));
      if (accept <= 0 && reject <= 0) continue;
      if (!line.materialId) { unmatchedLines += 1; continue; }
      matchedLines += 1;

      const alreadyReceived = (sqlite.prepare(`
        SELECT COALESCE(SUM(qty_delta), 0) AS sum FROM inventory_movements
        WHERE po_line_id = ? AND qty_delta > 0
      `).get(line.id) as { sum: number }).sum;
      const remaining = Math.max(0, line.quantity - alreadyReceived);
      const acceptQty = Math.min(accept, remaining);
      if (acceptQty > 0) {
        const receivedDate = po.date || createdAt.slice(0, 10);
        // Each partial accept gets a fresh deterministic code so the batch
        // ledger never collides. The first accept reuses the line's existing
        // tracking code if available; follow-ups get a new code via the
        // generator (which auto-suffixes -Nn when needed).
        const batchId = alreadyReceived === 0 && line.batchId && line.batchId.trim()
          ? line.batchId
          : generateTrackingCode(sqlite, po.poNumber, line.id, receivedDate);
        insertMv.run(
          line.materialId,
          line.product,
          po.id,
          po.poNumber,
          // po_line_id: re-use the line id for the first accept movement (so
          // the unique index applies). When a follow-up partial accept lands
          // for the same line, we need a fresh row → set NULL and tag note.
          alreadyReceived > 0 ? null : line.id,
          acceptQty,
          line.unitCost,
          receivedDate,
          po.supplier,
          po.currency,
          null,
          batchId,
          alreadyReceived > 0 ? `partial_accept_of_line:${line.id}` : null,
          createdAt,
        );
        if (!line.batchId) updateLineBatch.run(batchId, line.id);
        // Allocations are computed against the full PO quantity; scale by
        // the actually-accepted fraction so partial receives get a fair share.
        const fullAlloc = allocByLinePartial.get(line.id) ?? { shipping: 0, tax: 0, fees: 0, discount: 0, landedUnitCop: line.unitCost };
        const fraction = line.quantity > 0 ? acceptQty / line.quantity : 0;
        createInventoryBatch(sqlite, {
          trackingCode: batchId,
          materialId: line.materialId,
          materialName: line.product,
          poId: po.id,
          poNumber: po.poNumber,
          poLineId: line.id,
          supplier: po.supplier,
          receivedDate,
          qtyReceived: acceptQty,
          unitCostCop: line.unitCost,
          currency: po.currency,
          fxRate: null,
          shippingAllocatedCop: fullAlloc.shipping * fraction,
          taxAllocatedCop: fullAlloc.tax * fraction,
          feesAllocatedCop: fullAlloc.fees * fraction,
          discountAllocatedCop: fullAlloc.discount * fraction,
          note: alreadyReceived > 0 ? `partial_accept_of_line:${line.id}` : null,
        });
        if (line.unitCost > 0) {
          upsertOverride.run(line.materialId, line.unitCost, po.supplier || '', createdAt, null);
        }
        acceptCreated += 1;
        totalAccepted += acceptQty;
      }
      if (reject > 0) {
        // Negative movement that does NOT touch stock balance net of the
        // accept (they're independent ledger rows). Tag the note so the
        // adjustment history shows "rejection · X units".
        insertMv.run(
          line.materialId,
          line.product,
          po.id,
          po.poNumber,
          null,
          -reject,
          line.unitCost,
          po.date || createdAt.slice(0, 10),
          po.supplier,
          po.currency,
          null,
          line.batchId ?? null,
          `rejection_of_line:${line.id}`,
          createdAt,
        );
        rejectCreated += 1;
      }
    }
    // Promote PO status. Strict full-receive comparison would race partial
    // submissions, so we leave it on 'received' once anything has landed
    // and revert to 'draft' only via explicit reverse.
    if (po.status !== 'received' && acceptCreated > 0) {
      sqlite.prepare(`UPDATE material_manager_purchase_orders SET status = 'received' WHERE id = ?`).run(po.id);
    }
  });
  tx();

  // Recompute totals for the return payload now that the ledger reflects this batch.
  const accepted = (sqlite.prepare(`
    SELECT COALESCE(SUM(qty_delta), 0) AS sum FROM inventory_movements
    WHERE po_id = ? AND qty_delta > 0
  `).get(po.id) as { sum: number }).sum;

  return {
    poNumber: po.poNumber,
    status: 'received',
    acceptCreated,
    rejectCreated,
    matchedLines,
    unmatchedLines,
    totalAccepted: accepted,
    totalOrdered,
  };
}

// Sum the positive movements per PO line so the UI can show received progress
// without re-querying the ledger row-by-row.
export type PoLineReceivedProgress = { lineId: number; received: number; ordered: number };

export function getPoLineReceivedProgress(sqlite: Database.Database, poId: number): PoLineReceivedProgress[] {
  ensureMmPurchaseOrderSchema(sqlite);
  const rows = sqlite.prepare(`
    SELECT l.id AS lineId, l.quantity AS ordered,
           COALESCE((
             SELECT SUM(qty_delta) FROM inventory_movements
             WHERE po_id = ? AND po_line_id = l.id AND qty_delta > 0
           ), 0) AS receivedDirect,
           COALESCE((
             SELECT SUM(qty_delta) FROM inventory_movements
             WHERE po_id = ? AND po_line_id IS NULL AND qty_delta > 0
               AND note = ?
           ), 0) AS receivedPartial
    FROM material_manager_purchase_order_lines l
    WHERE l.purchase_order_id = ?
  `).all(poId, poId, `partial_accept_of_line:`, poId) as Array<{ lineId: number; ordered: number; receivedDirect: number; receivedPartial: number }>;
  // The partial_accept_of_line note is per-line, so a bare lookup is fine here
  // — we re-query with the actual line ids:
  return rows.map(r => {
    const partial = (sqlite.prepare(`
      SELECT COALESCE(SUM(qty_delta), 0) AS sum FROM inventory_movements
      WHERE po_id = ? AND po_line_id IS NULL AND qty_delta > 0 AND note = ?
    `).get(poId, `partial_accept_of_line:${r.lineId}`) as { sum: number }).sum;
    return {
      lineId: Number(r.lineId),
      ordered: Number(r.ordered),
      received: Number(r.receivedDirect) + Number(partial),
    };
  });
}

// Reverse a previously-received PO: writes compensating negative-qty
// movements for every existing positive movement of this PO so the ledger
// nets to zero. Sets status back to 'draft'. Safe to call once per PO.
export function reversePurchaseOrderReceipt(sqlite: Database.Database, idOrNumber: string | number) {
  ensureMmPurchaseOrderSchema(sqlite);
  const po = getMmPurchaseOrder(sqlite, idOrNumber);
  if (!po) throw new Error('po_not_found');
  const movements = sqlite.prepare(`
    SELECT id, material_key, material_name, po_id, po_number, po_line_id, qty_delta, unit_cost_cop,
           date, supplier, currency, fx_rate, batch_id
    FROM inventory_movements
    WHERE po_id = ? AND qty_delta > 0
      AND id NOT IN (
        SELECT m2.id FROM inventory_movements m2
        WHERE m2.po_id = inventory_movements.po_id AND m2.qty_delta < 0
          AND m2.material_key = inventory_movements.material_key
      )
  `).all(po.id) as Array<Record<string, unknown>>;
  const createdAt = new Date().toISOString();
  const insertMv = sqlite.prepare(`
    INSERT INTO inventory_movements (
      material_key, material_name, po_id, po_number, po_line_id, qty_delta, unit_cost_cop,
      date, supplier, currency, fx_rate, batch_id, note, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = sqlite.transaction(() => {
    for (const m of movements) {
      insertMv.run(
        String(m.material_key), String(m.material_name ?? ''), Number(m.po_id), String(m.po_number ?? ''),
        -Number(m.qty_delta ?? 0), Number(m.unit_cost_cop ?? 0), String(m.date ?? ''),
        String(m.supplier ?? ''), String(m.currency ?? 'COP'), m.fx_rate ?? null,
        m.batch_id ?? null, `reversal_of_${m.id}`, createdAt,
      );
    }
    sqlite.prepare(`UPDATE material_manager_purchase_orders SET status = 'draft' WHERE id = ?`).run(po.id);
  });
  tx();
  return { poNumber: po.poNumber, reversedMovements: movements.length };
}

// ---------- Historical PO line matcher (Phase 2.2 P0) ----------
// Suggest a canonical Material Manager material for unmatched PO lines.
// Order of preference: exact SKU > exact normalized name > fuzzy token-overlap.
// The matcher NEVER mutates lines on its own — the UI must call the apply
// endpoint with an explicit lineId + materialId.
import type { MmMaterialEffective, MmPoStatus, PoLineMatchSuggestion } from '@shared/schema';

function normalizeNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(t => t.length > 1));
  const tb = new Set(b.split(/\s+/).filter(t => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach(t => { if (tb.has(t)) shared += 1; });
  return shared / Math.max(ta.size, tb.size);
}

export function suggestMatchesForLines(
  sqlite: Database.Database,
  materials: MmMaterialEffective[],
  options?: { onlyUnmatched?: boolean; limitFuzzy?: number },
): PoLineMatchSuggestion[] {
  ensureMmPurchaseOrderSchema(sqlite);
  const onlyUnmatched = options?.onlyUnmatched ?? true;
  const limitFuzzy = options?.limitFuzzy ?? 3;
  const where = onlyUnmatched ? `WHERE material_id IS NULL OR material_id = ''` : '';
  const rows = sqlite.prepare(`
    SELECT id, po_number, product, sku
    FROM material_manager_purchase_order_lines
    ${where}
    ORDER BY po_number DESC, line_index ASC
  `).all() as Array<{ id: number; po_number: string; product: string; sku: string }>;

  // Build lookups once.
  const bySku = new Map<string, MmMaterialEffective>();
  const byNameKey = new Map<string, MmMaterialEffective>();
  materials.forEach(m => {
    if (m.sku) bySku.set(m.sku.trim().toLowerCase(), m);
    const key = normalizeNameKey(m.name);
    if (key) byNameKey.set(key, m);
  });

  return rows.map(r => {
    const skuLower = (r.sku || '').trim().toLowerCase();
    const nameKey = normalizeNameKey(r.product || '');
    const exactSkuMatch = skuLower && bySku.has(skuLower)
      ? { materialId: bySku.get(skuLower)!.id, name: bySku.get(skuLower)!.name, sku: bySku.get(skuLower)!.sku }
      : null;
    const exactNameMatch = nameKey && byNameKey.has(nameKey)
      ? { materialId: byNameKey.get(nameKey)!.id, name: byNameKey.get(nameKey)!.name, sku: byNameKey.get(nameKey)!.sku }
      : null;
    let fuzzy: Array<{ materialId: string; name: string; sku: string; score: number }> = [];
    if (!exactSkuMatch && !exactNameMatch && nameKey) {
      fuzzy = materials
        .map(m => ({
          materialId: m.id,
          name: m.name,
          sku: m.sku,
          score: tokenOverlapScore(nameKey, normalizeNameKey(m.name)),
        }))
        .filter(s => s.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, limitFuzzy);
    }
    return {
      lineId: r.id,
      poNumber: r.po_number,
      product: r.product,
      sku: r.sku,
      exactSkuMatch,
      exactNameMatch,
      fuzzySuggestions: fuzzy,
    };
  });
}

export function applyPoLineMatch(
  sqlite: Database.Database,
  lineId: number,
  materialId: string,
): { lineId: number; materialId: string } {
  ensureMmPurchaseOrderSchema(sqlite);
  const exists = sqlite.prepare(`SELECT id FROM material_manager_purchase_order_lines WHERE id = ?`).get(lineId);
  if (!exists) throw new Error('po_line_not_found');
  sqlite.prepare(`UPDATE material_manager_purchase_order_lines SET material_id = ? WHERE id = ?`).run(materialId, lineId);
  return { lineId, materialId };
}

export function clearPoLineMatch(sqlite: Database.Database, lineId: number): { lineId: number; cleared: boolean } {
  ensureMmPurchaseOrderSchema(sqlite);
  const info = sqlite.prepare(`UPDATE material_manager_purchase_order_lines SET material_id = NULL WHERE id = ?`).run(lineId);
  return { lineId, cleared: info.changes > 0 };
}

// Auto-import on startup if the table is empty. Idempotent.
export function ensureMmPurchaseOrdersImported(sqlite: Database.Database): MmPurchaseOrdersStatus {
  ensureMmPurchaseOrderSchema(sqlite);
  const row = sqlite.prepare('SELECT COUNT(*) AS c FROM material_manager_purchase_orders').get() as { c: number };
  if (Number(row.c) === 0) {
    importMmPurchaseOrders(sqlite);
  }
  return getMmPurchaseOrdersStatus(sqlite);
}
