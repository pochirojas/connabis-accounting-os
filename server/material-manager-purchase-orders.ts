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
  MmPurchaseOrder,
  MmPurchaseOrderLine,
  MmPurchaseOrdersStatus,
} from '@shared/schema';

const PO_CSV_DIR = '/home/user/workspace';
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
  `);
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
    sqlite.prepare('DELETE FROM material_manager_purchase_order_lines').run();
    sqlite.prepare('DELETE FROM material_manager_purchase_orders').run();

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
    status: (row.status === 'cancelled' ? 'cancelled' : 'received') as MmPurchaseOrder['status'],
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
    SELECT id, purchase_order_id, po_number, product, sku, quantity, unit_cost, tax_pct, total_cop, line_index
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
      COALESCE(SUM(CASE WHEN status = 'received' THEN total ELSE 0 END), 0) AS totalAmount
    FROM material_manager_purchase_orders
  `).get() as { total: number; cancelled: number; received: number; totalAmount: number };
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
    totalAmount: Number(totals.totalAmount ?? 0),
    totalLines: Number(linesRow.c ?? 0),
    suppliers: Number(suppliersRow.c ?? 0),
    lastImportedAt: lastRow?.imported_at ? String(lastRow.imported_at) : null,
  };
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
