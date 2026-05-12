// Phase 2.1 — Read-only internal mirror of Material Manager.
// Bulletproof rollback requirement: imports/exports the EXACT MM CSV
// format (same headers, same order, same rows). No Shopify writes happen
// from this module.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  MM_BOM_CSV_HEADERS,
  MM_MATERIALS_CSV_HEADERS,
  type MmBomRow,
  type MmCostHistoryRow,
  type MmImportRun,
  type MmMaterialRow,
  type MmMirrorStatus,
  type MmRoundTripQa,
} from '@shared/schema';

const MM_MATERIALS_CSV = '/home/user/workspace/material-manager-export.csv';
const MM_BOM_CSV = '/home/user/workspace/material-manager-export-material-product.csv';
const COST_HISTORY_JSON = path.resolve(
  process.cwd(),
  'server/data/material-cost-history.json',
);

const STOCK_HEADER = 'Calle 36 #22a-108 (4bf83698-ff9e-4857-9da3-e4f44bc3b447)';

const INSUMO_CATEGORY_HINTS = ['Insumo', 'Insumos', 'Limpieza', 'Equipo', 'Herramienta', 'Tooling'];
const NOID_CATEGORY_HINTS = ['Noid', 'Cartucho', 'Disposable'];

export function ensureMaterialManagerMirrorSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS material_manager_materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      measurement TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      barcode TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'COP',
      update_shopify_inventory INTEGER NOT NULL DEFAULT 0,
      limit_shopify_inventory INTEGER NOT NULL DEFAULT 0,
      materials_used_in_all_orders TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0,
      is_insumo INTEGER NOT NULL DEFAULT 0,
      is_noid INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS material_manager_bom_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      material_name TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      variant_name TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL,
      UNIQUE(material_id, variant_id)
    );

    CREATE TABLE IF NOT EXISTS material_cost_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      material_key TEXT NOT NULL,
      material TEXT NOT NULL,
      unit_cost_cop REAL NOT NULL,
      qty REAL,
      currency TEXT,
      fx_rate REAL,
      source_sheet TEXT NOT NULL,
      description TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cost_history_material ON material_cost_history(material_key, date);
    CREATE INDEX IF NOT EXISTS idx_bom_variant ON material_manager_bom_components(variant_id);

    CREATE TABLE IF NOT EXISTS material_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      materials_imported INTEGER NOT NULL DEFAULT 0,
      bom_imported INTEGER NOT NULL DEFAULT 0,
      cost_history_imported INTEGER NOT NULL DEFAULT 0,
      conflicts INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS material_round_trip_qa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

// ---------- CSV helpers (exact MM format) ----------

function parseCsvLine(line: string) {
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

function parseCsvFile(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter(line => line.length > 0);
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(nonEmpty[0]);
  const rows = nonEmpty.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
  });
  return { headers, rows };
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(headers: readonly string[], rows: Array<Record<string, unknown>>): string {
  const out: string[] = [];
  out.push(headers.map(escapeCsvCell).join(','));
  for (const row of rows) {
    out.push(headers.map(h => escapeCsvCell(row[h])).join(','));
  }
  return out.join('\n') + '\n';
}

// Normalize material name for fuzzy matching against Excel cost-history sheets.
function normalizeMaterialKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function categoryFlags(category: string): { isInsumo: boolean; isNoid: boolean } {
  const lower = category.toLowerCase();
  const isInsumo = INSUMO_CATEGORY_HINTS.some(hint => lower.includes(hint.toLowerCase()));
  const isNoid = NOID_CATEGORY_HINTS.some(hint => lower.includes(hint.toLowerCase()));
  return { isInsumo, isNoid };
}

// ---------- Import / Rebuild ----------

export type ImportResult = {
  run: MmImportRun;
  warnings: string[];
};

export function importMaterialManagerMirror(sqlite: Database.Database): ImportResult {
  ensureMaterialManagerMirrorSchema(sqlite);
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  let materialsImported = 0;
  let bomImported = 0;
  let costHistoryImported = 0;
  let conflicts = 0;

  const materialsCsv = parseCsvFile(MM_MATERIALS_CSV);
  const bomCsv = parseCsvFile(MM_BOM_CSV);

  // Header preservation check — if MM ever changes their headers, surface
  // it loudly rather than silently storing the wrong columns.
  if (materialsCsv.headers.length) {
    const expected = MM_MATERIALS_CSV_HEADERS.join('|');
    const actual = materialsCsv.headers.join('|');
    if (expected !== actual) {
      warnings.push(`Material CSV headers diverged from MM spec: ${actual}`);
      conflicts += 1;
    }
  } else {
    warnings.push(`Material CSV missing or empty at ${MM_MATERIALS_CSV}`);
  }
  if (bomCsv.headers.length) {
    const expected = MM_BOM_CSV_HEADERS.join('|');
    const actual = bomCsv.headers.join('|');
    if (expected !== actual) {
      warnings.push(`BOM CSV headers diverged from MM spec: ${actual}`);
      conflicts += 1;
    }
  } else {
    warnings.push(`BOM CSV missing or empty at ${MM_BOM_CSV}`);
  }

  const tx = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM material_manager_materials').run();
    sqlite.prepare('DELETE FROM material_manager_bom_components').run();
    sqlite.prepare('DELETE FROM material_cost_history').run();

    const insertMaterial = sqlite.prepare(`
      INSERT INTO material_manager_materials (
        id, name, description, measurement, sku, barcode, category, supplier,
        cost, currency_code, update_shopify_inventory, limit_shopify_inventory,
        materials_used_in_all_orders, stock, is_insumo, is_noid, imported_at
      ) VALUES (
        @id, @name, @description, @measurement, @sku, @barcode, @category, @supplier,
        @cost, @currency_code, @update_shopify_inventory, @limit_shopify_inventory,
        @materials_used_in_all_orders, @stock, @is_insumo, @is_noid, @imported_at
      )
    `);
    const seenIds = new Set<string>();
    for (const row of materialsCsv.rows) {
      const id = row['ID']?.trim();
      if (!id) {
        warnings.push(`Material row missing ID, skipped: ${JSON.stringify(row).slice(0, 120)}`);
        conflicts += 1;
        continue;
      }
      if (seenIds.has(id)) {
        warnings.push(`Duplicate material ID in MM CSV: ${id}`);
        conflicts += 1;
        continue;
      }
      seenIds.add(id);
      const category = row['Category'] ?? '';
      const flags = categoryFlags(category);
      insertMaterial.run({
        id,
        name: row['Name'] ?? '',
        description: row['Description'] ?? '',
        measurement: row['Measurement'] ?? '',
        sku: row['SKU'] ?? '',
        barcode: row['Barcode'] ?? '',
        category,
        supplier: row['Supplier'] ?? '',
        cost: Number(row['Cost']) || 0,
        currency_code: row['Currency Code'] ?? 'COP',
        update_shopify_inventory: /true|1|yes/i.test(row['Update Shopify Inventory'] ?? '') ? 1 : 0,
        limit_shopify_inventory: /true|1|yes/i.test(row['Limit Shopify Inventory'] ?? '') ? 1 : 0,
        materials_used_in_all_orders: row['Materials used in all orders'] ?? '',
        stock: Number(row[STOCK_HEADER]) || 0,
        is_insumo: flags.isInsumo ? 1 : 0,
        is_noid: flags.isNoid ? 1 : 0,
        imported_at: startedAt,
      });
      materialsImported += 1;
    }

    const insertBom = sqlite.prepare(`
      INSERT OR IGNORE INTO material_manager_bom_components (
        material_id, variant_id, quantity, material_name, product_name, variant_name, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of bomCsv.rows) {
      const materialId = row['Material ID']?.trim();
      const variantId = row['Variant ID']?.trim();
      if (!materialId || !variantId) {
        warnings.push(`BOM row missing IDs: ${JSON.stringify(row).slice(0, 120)}`);
        conflicts += 1;
        continue;
      }
      const info = insertBom.run(
        materialId,
        variantId,
        Number(row['Quantity of material used']) || 0,
        row['Material name'] ?? '',
        row['Product name'] ?? '',
        row['Variant name'] ?? '',
        startedAt,
      );
      if (info.changes > 0) bomImported += 1;
      else {
        warnings.push(`Duplicate BOM pair material=${materialId} variant=${variantId}`);
        conflicts += 1;
      }
    }

    // Cost history from preprocessed Excel JSON.
    if (fs.existsSync(COST_HISTORY_JSON)) {
      const payload = JSON.parse(fs.readFileSync(COST_HISTORY_JSON, 'utf-8')) as {
        entries: Array<{
          date: string;
          material: string;
          unit_cost_cop: number;
          qty: number | null;
          currency: string | null;
          fx_rate: number | null;
          source_sheet: string;
          description: string | null;
        }>;
      };
      const insertCost = sqlite.prepare(`
        INSERT INTO material_cost_history (
          date, material_key, material, unit_cost_cop, qty, currency, fx_rate,
          source_sheet, description, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const entry of payload.entries ?? []) {
        if (!entry.material || !entry.date || !entry.unit_cost_cop) continue;
        insertCost.run(
          entry.date,
          normalizeMaterialKey(entry.material),
          entry.material,
          entry.unit_cost_cop,
          entry.qty,
          entry.currency,
          entry.fx_rate,
          entry.source_sheet,
          entry.description,
          startedAt,
        );
        costHistoryImported += 1;
      }
    } else {
      warnings.push(`Cost history JSON not found at ${COST_HISTORY_JSON} — run script/extract-material-cost-history.py`);
    }
  });
  tx();

  const status: MmImportRun['status'] = conflicts === 0 ? 'success' : conflicts < 5 ? 'partial' : 'error';
  const finishedAt = new Date().toISOString();
  const notes = warnings.length ? warnings.slice(0, 20).join(' | ') : null;
  const result = sqlite.prepare(`
    INSERT INTO material_import_runs (
      started_at, finished_at, status, materials_imported, bom_imported,
      cost_history_imported, conflicts, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(startedAt, finishedAt, status, materialsImported, bomImported, costHistoryImported, conflicts, notes);

  return {
    run: {
      id: Number(result.lastInsertRowid),
      startedAt,
      finishedAt,
      status,
      materialsImported,
      bomImported,
      costHistoryImported,
      conflicts,
      notes,
    },
    warnings,
  };
}

// ---------- List / Read accessors ----------

export function listMmMaterials(sqlite: Database.Database): MmMaterialRow[] {
  ensureMaterialManagerMirrorSchema(sqlite);
  const rows = sqlite.prepare(`
    SELECT id, name, description, measurement, sku, barcode, category, supplier,
           cost, currency_code, update_shopify_inventory, limit_shopify_inventory,
           materials_used_in_all_orders, stock, is_insumo, is_noid
    FROM material_manager_materials
    ORDER BY name COLLATE NOCASE
  `).all() as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    measurement: String(row.measurement ?? ''),
    sku: String(row.sku ?? ''),
    barcode: String(row.barcode ?? ''),
    category: String(row.category ?? ''),
    supplier: String(row.supplier ?? ''),
    cost: Number(row.cost ?? 0),
    currencyCode: String(row.currency_code ?? 'COP'),
    updateShopifyInventory: Number(row.update_shopify_inventory) === 1,
    limitShopifyInventory: Number(row.limit_shopify_inventory) === 1,
    materialsUsedInAllOrders: String(row.materials_used_in_all_orders ?? ''),
    stock: Number(row.stock ?? 0),
    isInsumo: Number(row.is_insumo) === 1,
    isNoid: Number(row.is_noid) === 1,
  }));
}

export function listMmBomComponents(sqlite: Database.Database, filter?: { materialId?: string; variantId?: string }): MmBomRow[] {
  ensureMaterialManagerMirrorSchema(sqlite);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.materialId) {
    where.push('material_id = ?');
    params.push(filter.materialId);
  }
  if (filter?.variantId) {
    where.push('variant_id = ?');
    params.push(filter.variantId);
  }
  const sql = `
    SELECT material_id, variant_id, quantity, material_name, product_name, variant_name
    FROM material_manager_bom_components
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY product_name COLLATE NOCASE, variant_name COLLATE NOCASE, material_name COLLATE NOCASE
  `;
  const rows = sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    materialId: String(row.material_id),
    variantId: String(row.variant_id),
    quantity: Number(row.quantity ?? 0),
    materialName: String(row.material_name ?? ''),
    productName: String(row.product_name ?? ''),
    variantName: String(row.variant_name ?? ''),
  }));
}

export function listMmCostHistory(
  sqlite: Database.Database,
  filter?: { materialKey?: string; sourceSheet?: string; limit?: number },
): MmCostHistoryRow[] {
  ensureMaterialManagerMirrorSchema(sqlite);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.materialKey) {
    where.push('material_key = ?');
    params.push(filter.materialKey);
  }
  if (filter?.sourceSheet) {
    where.push('source_sheet = ?');
    params.push(filter.sourceSheet);
  }
  const limit = Math.min(Math.max(filter?.limit ?? 500, 1), 5000);
  const sql = `
    SELECT id, date, material_key, material, unit_cost_cop, qty, currency, fx_rate, source_sheet, description
    FROM material_cost_history
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY date DESC, id DESC
    LIMIT ${limit}
  `;
  const rows = sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: Number(row.id),
    date: String(row.date),
    materialKey: String(row.material_key),
    material: String(row.material),
    unitCostCop: Number(row.unit_cost_cop),
    qty: row.qty === null ? null : Number(row.qty),
    currency: row.currency === null ? null : String(row.currency),
    fxRate: row.fx_rate === null ? null : Number(row.fx_rate),
    sourceSheet: String(row.source_sheet),
    description: row.description === null ? null : String(row.description),
  }));
}

export function getMirrorStatus(sqlite: Database.Database): MmMirrorStatus {
  ensureMaterialManagerMirrorSchema(sqlite);
  const materialsImported = Number((sqlite.prepare('SELECT COUNT(*) AS c FROM material_manager_materials').get() as { c: number }).c);
  const bomImported = Number((sqlite.prepare('SELECT COUNT(*) AS c FROM material_manager_bom_components').get() as { c: number }).c);
  const variantsWithBom = Number((sqlite.prepare('SELECT COUNT(DISTINCT variant_id) AS c FROM material_manager_bom_components').get() as { c: number }).c);
  const costHistoryRows = Number((sqlite.prepare('SELECT COUNT(*) AS c FROM material_cost_history').get() as { c: number }).c);
  const lastRunRow = sqlite.prepare(`
    SELECT id, started_at, finished_at, status, materials_imported, bom_imported,
           cost_history_imported, conflicts, notes
    FROM material_import_runs ORDER BY id DESC LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  const lastRun: MmImportRun | null = lastRunRow ? {
    id: Number(lastRunRow.id),
    startedAt: String(lastRunRow.started_at),
    finishedAt: lastRunRow.finished_at ? String(lastRunRow.finished_at) : null,
    status: lastRunRow.status as MmImportRun['status'],
    materialsImported: Number(lastRunRow.materials_imported),
    bomImported: Number(lastRunRow.bom_imported),
    costHistoryImported: Number(lastRunRow.cost_history_imported),
    conflicts: Number(lastRunRow.conflicts),
    notes: lastRunRow.notes ? String(lastRunRow.notes) : null,
  } : null;
  const lastQaRow = sqlite.prepare('SELECT payload FROM material_round_trip_qa ORDER BY id DESC LIMIT 1').get() as { payload?: string } | undefined;
  const lastQa: MmRoundTripQa | null = lastQaRow?.payload ? JSON.parse(lastQaRow.payload) as MmRoundTripQa : null;
  return {
    materialsImported,
    bomImported,
    variantsWithBom,
    costHistoryRows,
    conflicts: lastRun?.conflicts ?? 0,
    lastRun,
    lastQa,
  };
}

// ---------- Export (must round-trip MM exactly) ----------

export function exportMmMaterialsCsv(sqlite: Database.Database): string {
  const materials = listMmMaterials(sqlite);
  const rows = materials.map(m => ({
    'ID': m.id,
    'Name': m.name,
    'Description': m.description,
    'Measurement': m.measurement,
    'SKU': m.sku,
    'Barcode': m.barcode,
    'Category': m.category,
    'Supplier': m.supplier,
    // MM writes cost with 2 decimals.
    'Cost': m.cost.toFixed(2),
    'Currency Code': m.currencyCode,
    'Update Shopify Inventory': m.updateShopifyInventory ? 'true' : '',
    'Limit Shopify Inventory': m.limitShopifyInventory ? 'true' : '',
    'Materials used in all orders': m.materialsUsedInAllOrders,
    [STOCK_HEADER]: String(m.stock),
  }));
  return buildCsv(MM_MATERIALS_CSV_HEADERS, rows);
}

export function exportMmBomCsv(sqlite: Database.Database): string {
  const bom = listMmBomComponents(sqlite);
  const rows = bom.map(b => ({
    'Material ID': b.materialId,
    'Variant ID': b.variantId,
    'Quantity of material used': Number.isInteger(b.quantity) ? String(b.quantity) : String(b.quantity),
    'Material name': b.materialName,
    'Product name': b.productName,
    'Variant name': b.variantName,
  }));
  return buildCsv(MM_BOM_CSV_HEADERS, rows);
}

// ---------- Round-trip QA ----------

export function runRoundTripQa(sqlite: Database.Database): MmRoundTripQa {
  ensureMaterialManagerMirrorSchema(sqlite);
  const ranAt = new Date().toISOString();
  const mismatches: string[] = [];

  const sourceMaterials = parseCsvFile(MM_MATERIALS_CSV);
  const sourceBom = parseCsvFile(MM_BOM_CSV);

  // Header check.
  const matsHeadersMatch = JSON.stringify(sourceMaterials.headers) === JSON.stringify([...MM_MATERIALS_CSV_HEADERS]);
  const bomHeadersMatch = JSON.stringify(sourceBom.headers) === JSON.stringify([...MM_BOM_CSV_HEADERS]);
  const headersMatch = matsHeadersMatch && bomHeadersMatch;
  if (!matsHeadersMatch) mismatches.push('Materials CSV headers do not match MM spec.');
  if (!bomHeadersMatch) mismatches.push('BOM CSV headers do not match MM spec.');

  // Re-parse our generated export and compare to source rows.
  const exportedMaterialsCsv = exportMmMaterialsCsv(sqlite);
  const exportedBomCsv = exportMmBomCsv(sqlite);

  const exportedMaterials = parseCsvFromString(exportedMaterialsCsv);
  const exportedBom = parseCsvFromString(exportedBomCsv);

  const materialsRowCount = { imported: sourceMaterials.rows.length, exported: exportedMaterials.rows.length };
  const bomRowCount = { imported: sourceBom.rows.length, exported: exportedBom.rows.length };
  if (materialsRowCount.imported !== materialsRowCount.exported) {
    mismatches.push(`Materials row count drift: source=${materialsRowCount.imported} exported=${materialsRowCount.exported}`);
  }
  if (bomRowCount.imported !== bomRowCount.exported) {
    mismatches.push(`BOM row count drift: source=${bomRowCount.imported} exported=${bomRowCount.exported}`);
  }

  // ID coverage.
  const sourceMaterialIds = new Set(sourceMaterials.rows.map(r => r['ID']));
  const exportedMaterialIds = new Set(exportedMaterials.rows.map(r => r['ID']));
  const materialIdsMatch = setsEqual(sourceMaterialIds, exportedMaterialIds);
  if (!materialIdsMatch) {
    const missing = Array.from(sourceMaterialIds).filter(id => !exportedMaterialIds.has(id));
    const extra = Array.from(exportedMaterialIds).filter(id => !sourceMaterialIds.has(id));
    mismatches.push(`Material ID drift: missing=${missing.slice(0, 5).join(',')} extra=${extra.slice(0, 5).join(',')}`);
  }

  const sourceVariantPairs = new Set(sourceBom.rows.map(r => `${r['Material ID']}::${r['Variant ID']}`));
  const exportedVariantPairs = new Set(exportedBom.rows.map(r => `${r['Material ID']}::${r['Variant ID']}`));
  const variantIdsMatch = setsEqual(sourceVariantPairs, exportedVariantPairs);
  if (!variantIdsMatch) {
    mismatches.push(`BOM variant pair drift (source ${sourceVariantPairs.size} vs exported ${exportedVariantPairs.size}).`);
  }

  // Quantity & stock checks.
  let bomQuantitiesMatch = true;
  const sourceBomQty = new Map<string, number>();
  for (const r of sourceBom.rows) {
    sourceBomQty.set(`${r['Material ID']}::${r['Variant ID']}`, Number(r['Quantity of material used']) || 0);
  }
  for (const r of exportedBom.rows) {
    const key = `${r['Material ID']}::${r['Variant ID']}`;
    const expected = sourceBomQty.get(key);
    const got = Number(r['Quantity of material used']) || 0;
    if (expected !== undefined && Math.abs(expected - got) > 1e-6) {
      bomQuantitiesMatch = false;
      mismatches.push(`Qty mismatch ${key}: source=${expected} exported=${got}`);
      if (mismatches.length > 50) break;
    }
  }

  let stockMatch = true;
  const sourceStock = new Map<string, number>();
  for (const r of sourceMaterials.rows) {
    sourceStock.set(r['ID'], Number(r[STOCK_HEADER]) || 0);
  }
  for (const r of exportedMaterials.rows) {
    const expected = sourceStock.get(r['ID']);
    const got = Number(r[STOCK_HEADER]) || 0;
    if (expected !== undefined && expected !== got) {
      stockMatch = false;
      mismatches.push(`Stock mismatch ${r['ID']}: source=${expected} exported=${got}`);
      if (mismatches.length > 50) break;
    }
  }

  const status: MmRoundTripQa['status'] = (
    headersMatch &&
    materialsRowCount.imported === materialsRowCount.exported &&
    bomRowCount.imported === bomRowCount.exported &&
    materialIdsMatch &&
    variantIdsMatch &&
    bomQuantitiesMatch &&
    stockMatch
  ) ? 'pass' : 'fail';

  const qa: MmRoundTripQa = {
    headersMatch,
    materialsRowCount,
    bomRowCount,
    materialIdsMatch,
    variantIdsMatch,
    bomQuantitiesMatch,
    stockMatch,
    mismatches: mismatches.slice(0, 50),
    status,
    ranAt,
  };
  sqlite.prepare('INSERT INTO material_round_trip_qa (ran_at, status, payload) VALUES (?, ?, ?)').run(ranAt, status, JSON.stringify(qa));
  return qa;
}

function parseCsvFromString(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
  });
  return { headers, rows };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach(item => { if (!b.has(item)) equal = false; });
  return equal;
}
