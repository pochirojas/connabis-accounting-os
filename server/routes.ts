import type { Express, Response } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { insertExpenseSchema, updateCashAccountSchema, updateCloseChecklistSchema, updateExpenseSchema } from '@shared/schema';
import type { Alert, DailyPerformance, Expense, Product } from '@shared/schema';
import { sqlite, storage } from './storage';
import {
  createBomDraft,
  deleteBomDraft,
  deleteMaterialOverride,
  deleteMmBomOverride,
  exportMmBomCsv,
  exportMmMaterialsCsv,
  getMaterialDetail,
  getMirrorStatus,
  getMmMaterialEffective,
  getProductBomDetail,
  importMaterialManagerMirror,
  listMmBomComponents,
  listMmBomDrafts,
  listMmBomOverrides,
  listMmCostHistory,
  listMmMaterialsEffective,
  runRoundTripQa,
  updateBomDraft,
  upsertMaterialOverride,
  upsertMmBomOverride,
} from './material-manager-mirror';
import {
  importMmPurchaseOrders,
  listMmPurchaseOrders,
  getMmPurchaseOrder,
  getMmPurchaseOrdersStatus,
  createMmPurchaseOrder,
} from './material-manager-purchase-orders';
import {
  listTerpeneSlots,
  upsertTerpeneSlot,
  deleteTerpeneSlot,
  listTerpeneDrafts,
  upsertTerpeneDraft,
  deleteTerpeneDraft,
} from './terpene-rotation';
import {
  CLEAR_BUBBLE_BAG_COST,
  buildRecipesWithMmCosts,
  buildPackagingWithMmCosts,
} from './cart-calculator';
import {
  insertBomDraftSchema,
  updateBomDraftSchema,
  updateBomOverrideSchema,
  updateMaterialOverrideSchema,
} from '@shared/schema';
import type { MmPurchaseOrder, PurchaseOrder } from '@shared/schema';
import {
  channels, years, months, kpis, products,
  materials, alerts, integrationPhases,
  dailyPerformance, glossaryTerms, accountingSuggestions,
  incomeDetails, restockRecommendations,
  ceoMetrics, pnlRows, cashFlowSnapshots, inventoryAccountingRows, closeChecklist,
} from './seed';

const SHOPIFY_API_VERSION = '2026-04';
const MATERIAL_MANAGER_BOM_PATH = '/home/user/workspace/material-manager-export-material-product.csv';
const MATERIAL_MANAGER_MATERIALS_PATH = '/home/user/workspace/material-manager-export.csv';
const HISTORICAL_EXPENSES_PATH = '/home/user/workspace/connabis-accounting-os/server/data/historical-expenses.json';

// Map a real MM purchase order onto the legacy PurchaseOrder shape used by the
// existing /api/purchase-orders consumers. Quantity is the SUM of all line
// quantities (kept as float — never rounded).
function mmPoToLegacy(po: MmPurchaseOrder): PurchaseOrder {
  const lines = po.lines ?? [];
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalSubtotal = lines.reduce((s, l) => s + l.totalCop, 0);
  const unitCost = totalQty > 0 ? totalSubtotal / totalQty : 0;
  const status = po.status === 'cancelled' ? 'pendiente' : 'recibido';
  return {
    id: po.poNumber.toLowerCase(),
    date: po.date || po.importedAt.slice(0, 10),
    supplier: po.supplier || (po.status === 'cancelled' ? 'Cancelado' : ''),
    category: lines[0]?.product ?? '—',
    qty: totalQty,
    unitCost,
    shipping: po.shipping,
    tax: po.taxes,
    landedCost: po.total,
    status,
    currency: (po.currency === 'USD' ? 'USD' : 'COP') as 'USD' | 'COP',
    paymentMethod: '',
    notes: po.notes ?? undefined,
    items: lines.map(l => ({
      material: l.product,
      sku: l.sku,
      category: '—',
      qty: l.quantity,
      unitCost: l.unitCost,
      subtotal: l.totalCop,
    })),
  };
}

function loadHistoricalExpenses() {
  if (!fs.existsSync(HISTORICAL_EXPENSES_PATH)) return [];
  const payload = JSON.parse(fs.readFileSync(HISTORICAL_EXPENSES_PATH, 'utf-8')) as {
    expenses?: Array<Record<string, unknown>>;
  };
  return payload.expenses ?? [];
}

// Effective-field fallback: when paidTo is blank/null, surface description as paidTo
// so historic provider analytics (pivot, breakdowns, CSV) attribute the expense to
// something instead of an "(sin proveedor)" bucket. Idempotent — never overwrites a
// real paidTo. The DB row itself is not mutated; the override is applied at load time.
function applyPaidToFallback<T extends { paidTo?: string | null; description?: string | null }>(expense: T): T {
  const raw = typeof expense.paidTo === 'string' ? expense.paidTo.trim() : '';
  if (raw) return expense;
  const desc = typeof expense.description === 'string' ? expense.description.trim() : '';
  if (!desc) return expense;
  return { ...expense, paidTo: desc };
}

async function loadAllExpenses() {
  const manualExpenses = await storage.listManualExpenses();
  const overrides = await storage.listExpenseOverrides();
  return [...loadHistoricalExpenses(), ...manualExpenses]
    .map(expense => ({
      ...expense,
      ...(overrides[String(expense.id)] ?? {}),
    }))
    .map(applyPaidToFallback);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(path: string) {
  if (!fs.existsSync(path)) return [] as Record<string, string>[];
  const lines = fs.readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function loadMaterialManagerData() {
  const materials = parseCsv(MATERIAL_MANAGER_MATERIALS_PATH);
  const bomRows = parseCsv(MATERIAL_MANAGER_BOM_PATH);
  const materialsById = new Map(materials.map(material => [
    material.ID,
    {
      name: material.Name,
      category: material.Category || 'Material',
      measurement: material.Measurement || 'unidad',
      cost: Number(material.Cost) || 0,
      currency: material['Currency Code'] || 'COP',
      stock: Number(material['Calle 36 #22a-108 (4bf83698-ff9e-4857-9da3-e4f44bc3b447)']) || 0,
    },
  ]));

  const bomByVariantId = new Map<string, Array<{
    productName: string;
    materialId: string;
    materialName: string;
    quantity: number;
    unitCost: number;
    amount: number;
    category: string;
    measurement: string;
    stock: number;
  }>>();

  for (const row of bomRows) {
    const variantId = row['Variant ID'];
    const material = materialsById.get(row['Material ID']);
    if (!variantId || !material) continue;
    const quantity = Number(row['Quantity of material used']) || 0;
    const amount = quantity * material.cost;
    const item = {
      materialId: row['Material ID'],
      materialName: row['Material name'] || material.name,
      quantity,
      unitCost: material.cost,
      amount,
      productName: row['Product name'] || '',
      category: material.category,
      measurement: material.measurement,
      stock: material.stock,
    };
    bomByVariantId.set(variantId, [...(bomByVariantId.get(variantId) ?? []), item]);
  }

  const variantCostByProductKey = new Map<string, Map<string, number>>();
  for (const [variantId, items] of bomByVariantId.entries()) {
    const productName = items[0]?.productName;
    if (!productName) continue;
    const productKey = normalizeProductMatchKey(productName);
    const variantCosts = variantCostByProductKey.get(productKey) ?? new Map<string, number>();
    variantCosts.set(variantId, items.reduce((sum, item) => sum + item.amount, 0));
    variantCostByProductKey.set(productKey, variantCosts);
  }

  const bomAverageCostByProductKey = new Map<string, number>();
  for (const [productKey, variantCosts] of variantCostByProductKey.entries()) {
    const costs = Array.from(variantCosts.values());
    bomAverageCostByProductKey.set(productKey, costs.reduce((sum, cost) => sum + cost, 0) / Math.max(costs.length, 1));
  }

  return { bomByVariantId, bomAverageCostByProductKey, variantCostByProductKey };
}

let materialManagerCache: ReturnType<typeof loadMaterialManagerData> | null = null;

function getMaterialManagerData() {
  materialManagerCache ??= loadMaterialManagerData();
  return materialManagerCache;
}

function parseShopifyLegacyId(gid?: string | null) {
  return gid?.split('/').pop() ?? '';
}

function normalizeProductMatchKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bthc[\s-]?o\b/g, 'thco')
    .replace(/\bcbd\s+doble\b/g, 'cbdoble')
    .replace(/\bcart\b/g, 'cartucho')
    .replace(/\bcarts\b/g, 'cartuchos')
    .replace(/^blend\s+/g, 'recarga ')
    .replace(/\bpxxx\b/g, 'pineapple xxx')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Historical Shopify line-item titles whose canonical Material Manager BOM
// lives under a different product name. Keyed by the normalized Shopify title
// (post-normalizeProductMatchKey).
//
// Targets must be UNAMBIGUOUS: either a specific MM Variant ID (preferred \u2014 uses
// that variant's exact BOM cost) or an explicit `unitCost` confirmed by business.
// We deliberately do NOT alias to a product NAME that spans multiple variants of
// different sizes, because `bomAverageCostByProductKey` is the unweighted average
// across variants \u2014 for products like "THC-O Destilado en Jeringa" the per-variant
// cost spans 13.474 \u2192 131.665 COP (1ml \u2192 10ml), so an averaged value materially
// overstates COGS for any single historical line whose size cannot be inferred.
//
// Use sparingly: only for confirmed-by-business equivalences where the historical
// SKU is gone from Shopify but the BOM still matches an existing MM variant.
// Custom/generic products (custom line items without a stable equivalent) should
// NOT be aliased here \u2014 they remain hasBom=false so they show up in alerts as
// pending manual COGS.
type HistoricalAlias = {
  shopifyKey: string; // normalizeProductMatchKey output for the historical Shopify title
  target:
    | { kind: 'variant'; variantId: string; note: string }
    | { kind: 'fixed'; unitCost: number; note: string };
};

const HISTORICAL_PRODUCT_ALIASES: ReadonlyArray<HistoricalAlias> = [
  // 'Delta-8-THC-O Destilado' \u2014 pending: user confirmed (2026-05-15) it is the
  // same physical product as MM 'THC-O Destilado en Jeringa', but the MM product
  // has 5 variants (Jeringa 1ml/5ml/10ml, Tarro 5ml/10ml) with per-variant cost
  // spanning 13.474 \u2192 131.665 COP. Aliasing to the multi-variant average
  // overstated COGS materially (all-time ~8.35M COP, 2026 ~946K COP) without a
  // confirmed size. Disabled until business confirms the historical size or
  // unit cost. To re-enable, add an entry like:
  //   { shopifyKey: 'delta 8 thco destilado',
  //     target: { kind: 'variant', variantId: '42845811507277',
  //               note: 'historical Delta-8-THC-O = THCO Jeringa 1ml, confirmed YYYY-MM-DD' } }
  // or with { kind: 'fixed', unitCost: <COP> } if a manual cost is preferred.
];

function getBomUnitCostByVariantId(variantGid?: string | null, productTitle?: string) {
  const variantId = parseShopifyLegacyId(variantGid);
  const { bomByVariantId } = getMaterialManagerData();
  const items = variantId ? bomByVariantId.get(variantId) ?? [] : [];
  if (items.length > 0) {
    return {
      unitCost: items.reduce((sum, item) => sum + item.amount, 0),
      hasBom: true,
      matchType: 'variant' as const,
    };
  }

  if (productTitle) {
    const { bomAverageCostByProductKey, bomByVariantId: bomByVariantIdMap } = getMaterialManagerData();
    const titleKey = normalizeProductMatchKey(productTitle);
    const exact = bomAverageCostByProductKey.get(titleKey);
    if (exact !== undefined) return { unitCost: exact, hasBom: true, matchType: 'product_name' as const };
    const fuzzyMatch = Array.from(bomAverageCostByProductKey.entries())
      .find(([productKey]) => titleKey.includes(productKey) || productKey.includes(titleKey));
    if (fuzzyMatch) return { unitCost: fuzzyMatch[1], hasBom: true, matchType: 'product_name' as const };

    // Last resort: explicit historical alias (see HISTORICAL_PRODUCT_ALIASES).
    // Only triggers when Variant ID, exact-name and fuzzy substring all fail.
    // Aliases must resolve to a specific variant or a fixed cost — never to a
    // multi-variant product-name average (see comment on HISTORICAL_PRODUCT_ALIASES).
    for (const alias of HISTORICAL_PRODUCT_ALIASES) {
      if (titleKey !== alias.shopifyKey) continue;
      if (alias.target.kind === 'variant') {
        const items = bomByVariantIdMap.get(alias.target.variantId) ?? [];
        if (items.length === 0) continue;
        const unitCost = items.reduce((sum, item) => sum + item.amount, 0);
        return { unitCost, hasBom: true, matchType: 'alias' as const };
      }
      if (alias.target.kind === 'fixed') {
        return { unitCost: alias.target.unitCost, hasBom: true, matchType: 'alias' as const };
      }
    }
  }

  return { unitCost: 0, hasBom: false, matchType: 'missing' as const };
}

async function getShopifyAccessToken() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const shop = process.env.SHOPIFY_SHOP_DOMAIN || '2f979e-24.myshopify.com';

  if (!clientId || !clientSecret) {
    throw new Error('missing_shopify_credentials');
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'shopify_token_exchange_failed');
  }

  return { token: data.access_token, shop };
}

async function shopifyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { token, shop } = await getShopifyAccessToken();
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map(error => error.message).join('; ') || `shopify_graphql_${response.status}`);
  }

  return payload.data as T;
}

type ShopifySalesSummary = {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shippingCharges: number;
  totalSales: number;
  orders: number;
};

type ShopifySalesRow = ShopifySalesSummary & { period: string };

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function getPeriodDateBounds(params: PeriodParams = {}) {
  if (params.start && params.end && /^\d{4}-\d{2}-\d{2}$/.test(params.start) && /^\d{4}-\d{2}-\d{2}$/.test(params.end)) {
    return { start: params.start, end: params.end };
  }
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    return { start: `${params.month}-01`, end: lastDayOfMonth(params.month) };
  }
  if (params.year && /^\d{4}$/.test(params.year)) {
    return { start: `${params.year}-01-01`, end: `${params.year}-12-31` };
  }
  return { start: '2024-01-01', end: todayInReportTimeZone() };
}

function parseShopifySalesRow(row: Record<string, unknown>): ShopifySalesSummary {
  return {
    grossSales: toNumber(row.gross_sales),
    discounts: toNumber(row.discounts),
    returns: toNumber(row.returns),
    netSales: toNumber(row.net_sales),
    shippingCharges: toNumber(row.shipping_charges),
    totalSales: toNumber(row.total_sales),
    orders: toNumber(row.orders),
  };
}

async function shopifyqlRows(query: string): Promise<Array<Record<string, unknown>>> {
  const data = await shopifyGraphql<{
    shopifyqlQuery: {
      parseErrors: string[];
      tableData: { rows: Array<Record<string, unknown>> } | null;
    };
  }>(`
    query Shopifyql($query: String!) {
      shopifyqlQuery(query: $query) {
        parseErrors
        tableData { rows }
      }
    }
  `, { query });

  if (data.shopifyqlQuery.parseErrors.length) {
    throw new Error(data.shopifyqlQuery.parseErrors.join('; '));
  }
  return data.shopifyqlQuery.tableData?.rows ?? [];
}

async function loadShopifySalesSummary(params: PeriodParams = {}): Promise<ShopifySalesSummary> {
  const { start, end } = getPeriodDateBounds(params);
  const rows = await shopifyqlRows(
    `FROM sales SHOW gross_sales, discounts, returns, net_sales, shipping_charges, total_sales, orders SINCE ${start} UNTIL ${end}`
  );
  return parseShopifySalesRow(rows[0] ?? {});
}

async function loadShopifySalesRows(groupBy: 'day' | 'month' | 'year', params: PeriodParams = {}): Promise<ShopifySalesRow[]> {
  const { start, end } = getPeriodDateBounds(params);
  const rows = await shopifyqlRows(
    `FROM sales SHOW gross_sales, discounts, returns, net_sales, shipping_charges, total_sales, orders GROUP BY ${groupBy} SINCE ${start} UNTIL ${end}`
  );
  return rows.map(row => ({
    period: String(row[groupBy] ?? '').slice(0, 10),
    ...parseShopifySalesRow(row),
  }));
}

function inferProductFamily(title: string) {
  const value = title.toLowerCase();
  if (value.includes('soluble')) return 'Solubles';
  if (value.includes('melena') || value.includes('cola de pavo') || value.includes('reishi') || value.includes('ganoderma')) return 'Hongos funcionales';
  if (value.includes('cartucho')) return 'Cartuchos';
  if (value.includes('desechable')) return 'Desechables';
  if (value.includes('recarga') || value.includes('jeringa')) return 'Recargas';
  if (value.includes('kit') || value.includes('bundle')) return 'Bundles';
  return 'Shopify activo';
}

function defaultPackaging(title: string) {
  const value = title.toLowerCase();
  if (value.includes('cartucho') || value.includes('desechable')) return 3_500;
  if (value.includes('recarga') || value.includes('jeringa')) return 2_500;
  if (value.includes('soluble') || value.includes('melena') || value.includes('cola de pavo') || value.includes('reishi')) return 4_500;
  return 3_000;
}

function shouldSplitProductVariants(title: string) {
  const value = title.toLowerCase();
  return value.includes('recarga') || value.includes('destilado');
}

function getVariantPresentation(title: string) {
  const pieces = title.split('/').map(piece => piece.trim()).filter(Boolean);
  return pieces.length > 1 ? pieces[pieces.length - 1] : title.trim();
}

function variantsHaveSameEconomics(variants: Array<{ price: string; inventoryItem: { unitCost: { amount: string; currencyCode: string } | null } }>) {
  const prices = new Set(variants.map(variant => Number(variant.price).toFixed(2)));
  const costs = new Set(variants.map(variant => Number(variant.inventoryItem.unitCost?.amount ?? 0).toFixed(2)));
  return prices.size <= 1 && costs.size <= 1;
}

function getBomComponentKey(materialName: string) {
  return materialName.toLowerCase().includes('terpenos') ? 'Terpeno según sabor' : materialName;
}

function buildGroupedBomBreakdown(variantLegacyIds: string[]) {
  const { bomByVariantId } = getMaterialManagerData();
  const variantBoms = variantLegacyIds
    .map(id => bomByVariantId.get(id) ?? [])
    .filter(items => items.length > 0);

  if (variantBoms.length === 0) return null;

  const componentMap = new Map<string, {
    label: string;
    amount: number;
    source: 'bom';
    note: string;
  }>();

  for (const items of variantBoms) {
    for (const item of items) {
      const key = getBomComponentKey(item.materialName);
      const current = componentMap.get(key);
      const note = key === 'Terpeno según sabor'
        ? `Promedio del terpeno específico de cada sabor. MM: ${item.quantity} ${item.measurement} × ${item.unitCost.toLocaleString('es-CO')} COP.`
        : `MM: ${item.quantity} ${item.measurement} × ${item.unitCost.toLocaleString('es-CO')} COP · Stock material: ${item.stock.toLocaleString('es-CO')}.`;
      componentMap.set(key, {
        label: key,
        amount: (current?.amount ?? 0) + item.amount,
        source: 'bom',
        note: current?.note ?? note,
      });
    }
  }

  const divisor = variantBoms.length;
  const breakdown = Array.from(componentMap.values())
    .map(item => ({ ...item, amount: item.amount / divisor }))
    .sort((a, b) => b.amount - a.amount);
  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { breakdown, total, matchedVariants: variantBoms.length };
}

function moneyAmount(value?: { shopMoney?: { amount?: string } } | null) {
  return Number(value?.shopMoney?.amount ?? 0) || 0;
}

const REPORT_TIME_ZONE = 'America/Bogota';

function reportDateFromIso(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function todayInReportTimeZone() {
  return reportDateFromIso(new Date().toISOString());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function sumOrderOriginalLineRevenue(order: LiveIncomeOrder) {
  return order.lineItems.edges.reduce((sum, edge) => sum + moneyAmount(edge.node.originalTotalSet), 0);
}

function sumOrderDiscountedLineRevenue(order: LiveIncomeOrder) {
  return order.lineItems.edges.reduce((sum, edge) => sum + moneyAmount(edge.node.discountedTotalSet), 0);
}

function getOrderAccountingRevenue(order: LiveIncomeOrder) {
  const grossProductRevenue = sumOrderOriginalLineRevenue(order);
  const discountedProductRevenue = sumOrderDiscountedLineRevenue(order);
  const discounts = Math.max(0, grossProductRevenue - discountedProductRevenue);
  const shipping = moneyAmount(order.totalShippingPriceSet);
  const refunds = moneyAmount(order.totalRefundedSet);
  const totalSales = moneyAmount(order.currentTotalPriceSet ?? order.totalPriceSet);

  return {
    grossProductRevenue,
    grossRevenueWithShipping: grossProductRevenue + shipping,
    discounts,
    shipping,
    refunds,
    totalSales,
    netRevenue: totalSales,
  };
}

function getExpenseAmount(expense: Record<string, unknown>) {
  return Number(expense.amount || 0) || 0;
}

function getExpenseText(expense: Record<string, unknown>) {
  return [
    expense.category,
    expense.description,
    expense.paidTo,
    expense.notes,
  ].filter(Boolean).join(' ').toLowerCase();
}

type ExpenseClassification = NonNullable<Expense['classification']>;

const INVENTORY_CAPEX_SUPPLIERS = [
  'hau',
  'floraplex',
  'mc',
  'gilded extracts',
  'amazon',
  'imprenta',
  'dashmile',
];

// Explicit category buckets — the user-typed category alone is enough to classify the row.
// Runs before the supplier heuristic so an "Inventario" row stays inventory even if paidTo
// happens to look like an operating provider.
const INVENTORY_CATEGORY_VALUES = new Set([
  'inventario',
  'inventory',
  'materia prima',
  'materials',
  'supplies',
  'insumos',
  'empaque',
  'hardware',
]);

const CAPEX_CATEGORY_VALUES = new Set([
  'capex',
  'activo fijo',
  'equipment',
  'equipo',
  'equipos',
]);

function normalizeSearchText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isInventoryCapexSupplier(expense: Record<string, unknown>) {
  const paidTo = normalizeSearchText(expense.paidTo ?? expense.paid_to);
  const text = normalizeSearchText(getExpenseText(expense));
  return INVENTORY_CAPEX_SUPPLIERS.some(supplier => {
    if (supplier === 'mc') return paidTo === 'mc' || /\bmc\b/.test(text);
    return paidTo.includes(supplier) || text.includes(supplier);
  });
}

// Single source of truth for "is this row an inventory/capex purchase?" — used for P&L,
// KPIs, dashboard cards, gastos analytics scope, day-details, daily perf, etc. Order:
//   1. Explicit Capex/Equipment category → capex
//   2. Explicit Inventario/Materials/Supplies/Insumos/Empaque/Hardware category → inventory
//   3. paidTo / text matches known inventory-supplier list → inventory (capex if category hints)
//   4. Empty/junk category → uncategorized (counts as operating but alerted)
//   5. Legacy keyword fallback in free-text → capex / inventory
//   6. Default → operating
function classifyExpense(expense: Record<string, unknown>): ExpenseClassification {
  const text = getExpenseText(expense);
  const category = normalizeSearchText(expense.category);
  if (CAPEX_CATEGORY_VALUES.has(category)) return 'capex';
  if (INVENTORY_CATEGORY_VALUES.has(category)) return 'inventory';
  if (isInventoryCapexSupplier(expense)) return category.includes('capex') ? 'capex' : 'inventory';
  if (!category || category === '.' || category === '-' || category.includes('sin categor') || category === 'otros' || category === 'other') {
    return 'uncategorized';
  }
  if ([
    'equipment',
    'equipo',
    'maquina',
    'máquina',
    'computador',
    'impresora',
    'mueble',
    'capex',
    'activo fijo',
  ].some(keyword => text.includes(keyword))) {
    return 'capex';
  }
  if ([
    'gilded extracts',
    'materials',
    'microingredients',
    'supplies',
    'cartucho',
    'cartuchos',
    'destilado',
    'terpeno',
    'terpenos',
    'insumo',
    'insumos',
    'materia prima',
    'hardware',
    'empaque',
    'imprenta',
    'inventario',
    'materia',
  ].some(keyword => text.includes(keyword))) {
    return 'inventory';
  }
  return 'operating';
}

function splitOperatingAndInventoryExpenses(expenses: Array<Record<string, unknown>>) {
  return expenses.reduce((summary, expense) => {
    const amount = getExpenseAmount(expense);
    const classification = classifyExpense(expense);
    if (classification === 'inventory') {
      summary.inventoryPurchases += amount;
    } else if (classification === 'capex') {
      summary.capex += amount;
    } else {
      summary.operatingExpenses += amount;
      if (classification === 'uncategorized') summary.uncategorized += amount;
    }
    return summary;
  }, { operatingExpenses: 0, inventoryPurchases: 0, capex: 0, uncategorized: 0 });
}

function monthLabel(month: string) {
  return new Date(`${month}-02T00:00:00`).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
}

function normalizePaymentStatus(status: string): 'paid' | 'pending' | 'refunded' | 'partially_refunded' {
  const value = status.toLowerCase();
  if (value.includes('refund') && value.includes('partial')) return 'partially_refunded';
  if (value.includes('refund')) return 'refunded';
  if (value.includes('paid')) return 'paid';
  return 'pending';
}

function normalizeFulfillmentStatus(status: string): 'fulfilled' | 'unfulfilled' | 'partial' {
  const value = status.toLowerCase();
  if (value.includes('partial')) return 'partial';
  if (value.includes('fulfilled')) return 'fulfilled';
  return 'unfulfilled';
}

type PeriodParams = { month?: string; year?: string; start?: string; end?: string };

function getPeriodQuery(params: PeriodParams) {
  if (params.start && params.end && /^\d{4}-\d{2}-\d{2}$/.test(params.start) && /^\d{4}-\d{2}-\d{2}$/.test(params.end)) {
    return `created_at:>=${addDays(params.start, -1)} created_at:<${addDays(params.end, 2)}`;
  }
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const start = `${params.month}-01`;
    return `created_at:>=${addDays(start, -1)} created_at:<${addDays(lastDayOfMonth(params.month), 2)}`;
  }
  if (params.year && /^\d{4}$/.test(params.year)) {
    const year = Number(params.year);
    return `created_at:>=${year - 1}-12-31 created_at:<${year + 1}-01-02`;
  }
  return 'created_at:>=2024-01-01';
}

function getPeriodParams(query: Record<string, unknown>): PeriodParams {
  return {
    month: typeof query.month === 'string' ? query.month : undefined,
    year: typeof query.year === 'string' ? query.year : undefined,
    start: typeof query.start === 'string' ? query.start : undefined,
    end: typeof query.end === 'string' ? query.end : undefined,
  };
}

function expenseInPeriod(expense: Record<string, unknown>, params: PeriodParams) {
  const date = String(expense.date ?? '');
  const month = String(expense.month ?? date.slice(0, 7));
  if (params.month) return month === params.month;
  if (params.year) return month.startsWith(`${params.year}-`);
  if (params.start && date < params.start) return false;
  if (params.end && date > params.end) return false;
  return true;
}

function orderInPeriod(order: LiveIncomeOrder, params: PeriodParams) {
  const paymentStatus = normalizePaymentStatus(order.displayFinancialStatus);
  if (paymentStatus === 'pending' || paymentStatus === 'refunded') return false;
  if (order.cancelledAt || order.test) return false;
  const date = reportDateFromIso(order.createdAt);
  const month = date.slice(0, 7);
  if (params.month) return month === params.month;
  if (params.year) return month.startsWith(`${params.year}-`);
  if (params.start && date < params.start) return false;
  if (params.end && date > params.end) return false;
  return true;
}

function withExpenseClassification<T extends Record<string, unknown>>(expense: T): T & { classification: ExpenseClassification } {
  return { ...expense, classification: classifyExpense(expense) };
}

type LiveIncomeOrder = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  sourceName: string | null;
  cancelledAt: string | null;
  test: boolean;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  subtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalDiscountsSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  customer: { numberOfOrders: string | number } | null;
  lineItems: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        originalTotalSet: { shopMoney: { amount: string; currencyCode: string } } | null;
        discountedTotalSet: { shopMoney: { amount: string; currencyCode: string } } | null;
        variant: { id: string; sku: string | null } | null;
      };
    }>;
  };
};

type AccountingLine = {
  id: string;
  orderId: string;
  orderName: string;
  date: string;
  month: string;
  channel: string;
  customerType: 'nuevo' | 'recurrente';
  product: string;
  productFamily: string;
  sku: string;
  variantId: string;
  qty: number;
  grossRevenue: number;
  discounts: number;
  shipping: number;
  refunds: number;
  netRevenue: number;
  cogsUnit: number;
  cogsSold: number;
  hasBom: boolean;
  bomMatchType: 'variant' | 'product_name' | 'alias' | 'missing';
  paymentStatus: 'paid' | 'pending' | 'refunded' | 'partially_refunded';
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'partial';
};

async function loadLiveShopifyIncomeOrders(params: PeriodParams = {}) {
  const query = `
    query LiveIncomeOrders($cursor: String, $query: String!) {
      orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: false, query: $query) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            sourceName
            cancelledAt
            test
            totalPriceSet { shopMoney { amount currencyCode } }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            customer { numberOfOrders }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  quantity
                  originalTotalSet { shopMoney { amount currencyCode } }
                  discountedTotalSet { shopMoney { amount currencyCode } }
                  variant { id sku }
                }
              }
            }
          }
        }
      }
    }
  `;

  const allOrders: LiveIncomeOrder[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await shopifyGraphql<{
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: LiveIncomeOrder }>;
      };
    }>(query, { cursor, query: getPeriodQuery(params) });
    allOrders.push(...data.orders.edges.map(edge => edge.node));
    hasNextPage = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }
  return allOrders.filter(order => orderInPeriod(order, params));
}

function mapOrdersToAccountingLines(orders: LiveIncomeOrder[]): AccountingLine[] {
  return orders.flatMap(order => {
    const date = reportDateFromIso(order.createdAt);
    const month = date.slice(0, 7);
    const { shipping, refunds, totalSales } = getOrderAccountingRevenue(order);
    const lineCount = Math.max(order.lineItems.edges.length, 1);
    const discountedOrderProducts = sumOrderDiscountedLineRevenue(order);
    const customerOrders = Number(order.customer?.numberOfOrders ?? 1);

    return order.lineItems.edges.map((edge, index) => {
      const line = edge.node;
      const grossRevenue = moneyAmount(line.originalTotalSet);
      const netRevenue = moneyAmount(line.discountedTotalSet);
      const allocationBase = discountedOrderProducts > 0 ? netRevenue / discountedOrderProducts : 1 / lineCount;
      const bom = getBomUnitCostByVariantId(line.variant?.id, line.title);
      return {
        orderId: order.id,
        id: `${order.id}-${index}`,
        orderName: order.name,
        date,
        month,
        channel: order.sourceName || 'Shopify',
        customerType: customerOrders > 1 ? 'recurrente' : 'nuevo',
        product: line.title,
        productFamily: inferProductFamily(line.title),
        sku: line.variant?.sku ?? '—',
        variantId: parseShopifyLegacyId(line.variant?.id),
        qty: line.quantity,
        grossRevenue,
        discounts: Math.max(0, grossRevenue - netRevenue),
        shipping: index === 0 ? shipping : 0,
        refunds: index === 0 ? refunds : 0,
        netRevenue: totalSales * allocationBase,
        cogsUnit: bom.unitCost,
        cogsSold: bom.unitCost * line.quantity,
        hasBom: bom.hasBom,
        bomMatchType: bom.matchType,
        paymentStatus: normalizePaymentStatus(order.displayFinancialStatus),
        fulfillmentStatus: normalizeFulfillmentStatus(order.displayFulfillmentStatus),
      };
    }).slice(0, lineCount);
  });
}

function mapOrdersToIncomeDetails(orders: LiveIncomeOrder[]) {
  return mapOrdersToAccountingLines(orders).map(line => ({
    id: line.id,
    orderName: line.orderName,
    date: line.date,
    month: line.month,
    channel: line.channel,
    customerType: line.customerType,
    product: line.product,
    sku: line.sku,
    qty: line.qty,
    grossRevenue: line.grossRevenue,
    discounts: line.discounts,
    shipping: line.shipping,
    refunds: line.refunds,
    netRevenue: line.netRevenue,
    paymentStatus: line.paymentStatus,
    fulfillmentStatus: line.fulfillmentStatus,
  }));
}

function listDatesInMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

async function buildDailyPerformanceRows(): Promise<DailyPerformance[]> {
  const [incomeRows, salesRows] = await Promise.all([
    loadLiveShopifyIncomeOrders().then(mapOrdersToAccountingLines),
    loadShopifySalesRows('day'),
  ]);
  const expenseRows = (await loadAllExpenses()).map(withExpenseClassification) as Array<{
    date: string;
    month: string;
    amount: number;
    classification: ExpenseClassification;
  }>;

  const monthsWithData = new Set<string>();
  incomeRows.forEach(row => monthsWithData.add(row.month));
  expenseRows.forEach(row => monthsWithData.add(row.month));
  salesRows.forEach(row => monthsWithData.add(row.period.slice(0, 7)));
  const salesByDay = new Map(salesRows.map(row => [row.period, row]));

  const byDate = new Map<string, {
    orders: Set<string>;
    revenue: number;
    cogs: number;
    expenses: number;
    products: Map<string, { revenue: number; units: number }>;
  }>();

  function ensureDate(date: string) {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created = {
      orders: new Set<string>(),
      revenue: 0,
      cogs: 0,
      expenses: 0,
      products: new Map<string, { revenue: number; units: number }>(),
    };
    byDate.set(date, created);
    return created;
  }

  for (const row of incomeRows) {
    const day = ensureDate(row.date);
    day.orders.add(row.orderId);
    day.revenue += row.netRevenue;
    day.cogs += row.cogsSold;
    const product = day.products.get(row.product) ?? { revenue: 0, units: 0 };
    product.revenue += row.netRevenue;
    product.units += row.qty;
    day.products.set(row.product, product);
  }

  for (const row of expenseRows) {
    if (row.classification === 'inventory' || row.classification === 'capex') continue;
    const day = ensureDate(row.date);
    day.expenses += Number(row.amount || 0);
  }

  return Array.from(monthsWithData)
    .sort()
    .flatMap(month => listDatesInMonth(month))
    .map(date => {
      const day = byDate.get(date);
      const productEntries = day ? Array.from(day.products.entries()) : [];
      const topProduct = productEntries.sort((a, b) => b[1].revenue - a[1].revenue)[0];
      const sales = salesByDay.get(date);
      const revenue = sales?.totalSales ?? day?.revenue ?? 0;
      const cogs = day?.cogs ?? 0;
      const expenses = day?.expenses ?? 0;
      const orders = sales?.orders ?? day?.orders.size ?? 0;
      const grossProfit = revenue - cogs;
      const profit = grossProfit - expenses;
      return {
        date,
        month: date.slice(0, 7),
        orders,
        revenue,
        cogs,
        grossProfit,
        expenses,
        profit,
        netMargin: revenue ? profit / revenue : 0,
        aov: orders ? revenue / orders : 0,
        topProduct: topProduct?.[0] ?? '—',
        topProductRevenue: topProduct?.[1].revenue ?? 0,
        topProductUnits: topProduct?.[1].units ?? 0,
        note: orders === 0 && expenses === 0 ? 'Sin movimiento registrado' : undefined,
      };
    });
}

function summarizeYears(orders: LiveIncomeOrder[], salesRows: ShopifySalesRow[] = []) {
  const lines = mapOrdersToAccountingLines(orders);
  const grouped = new Map<number, { orders: Set<string>; revenue: number }>();
  for (const line of lines) {
    const year = Number(line.date.slice(0, 4));
    const current = grouped.get(year) ?? { orders: new Set<string>(), revenue: 0 };
    current.orders.add(line.orderId);
    current.revenue += line.netRevenue;
    grouped.set(year, current);
  }
  const salesByYear = new Map(salesRows.map(row => [Number(row.period.slice(0, 4)), row]));
  return Array.from(grouped.entries()).map(([year, row]) => {
    const sales = salesByYear.get(year);
    const revenue = sales?.totalSales ?? row.revenue;
    const ordersCount = sales?.orders ?? row.orders.size;
    return {
    year,
    orders: ordersCount,
    revenue,
    aov: ordersCount ? revenue / ordersCount : 0,
    projected: year === 2026 ? Math.round((revenue / Math.max(new Date().getMonth() + 1, 1)) * 12) : undefined,
    note: 'ShopifyQL total_sales: ventas totales Analytics',
    };
  }).sort((a, b) => a.year - b.year);
}

function summarizeMonths(orders: LiveIncomeOrder[], expenses: Array<Record<string, unknown>>, salesRows: ShopifySalesRow[] = []) {
  const lines = mapOrdersToAccountingLines(orders);
  const grouped = new Map<string, {
    orders: Set<string>;
    income: number;
    cogs: number;
    operatingExpenses: number;
    inventoryPurchasesExcluded: number;
  }>();

  function ensureMonth(month: string) {
    const existing = grouped.get(month);
    if (existing) return existing;
    const created = {
      orders: new Set<string>(),
      income: 0,
      cogs: 0,
      operatingExpenses: 0,
      inventoryPurchasesExcluded: 0,
    };
    grouped.set(month, created);
    return created;
  }

  for (const line of lines) {
    const current = ensureMonth(line.month);
    current.orders.add(line.orderId);
    current.income += line.netRevenue;
    current.cogs += line.cogsSold;
  }

  for (const expense of expenses) {
    const month = String(expense.month ?? '');
    if (!month) continue;
    const current = ensureMonth(month);
    const amount = getExpenseAmount(expense);
    const classification = classifyExpense(expense);
    if (classification === 'inventory' || classification === 'capex') {
      current.inventoryPurchasesExcluded += amount;
    } else {
      current.operatingExpenses += amount;
    }
  }
  for (const row of salesRows) {
    const month = row.period.slice(0, 7);
    if (month) ensureMonth(month);
  }
  const salesByMonth = new Map(salesRows.map(row => [row.period.slice(0, 7), row]));
  return Array.from(grouped.entries()).map(([month, row]) => {
    const sales = salesByMonth.get(month);
    const income = sales?.totalSales ?? row.income;
    const orderCount = sales?.orders ?? row.orders.size;
    return {
    month,
    label: monthLabel(month),
    income,
    cogs: row.cogs,
    grossProfit: income - row.cogs,
    grossMargin: income ? (income - row.cogs) / income : 0,
    expenses: row.operatingExpenses,
    profit: income - row.cogs - row.operatingExpenses,
    netMargin: income ? (income - row.cogs - row.operatingExpenses) / income : 0,
    inventoryPurchasesExcluded: row.inventoryPurchasesExcluded,
    partial: month === todayInReportTimeZone().slice(0, 7),
    note: `${orderCount} órdenes ShopifyQL; ingreso = total_sales Analytics; COGS vendido por BOM MM; gastos operativos reales. Compras de inventario/capex excluidas: ${Math.round(row.inventoryPurchasesExcluded).toLocaleString('es-CO')} COP.`,
    };
  }).sort((a, b) => a.month.localeCompare(b.month));
}

function summarizeChannels(orders: LiveIncomeOrder[]) {
  const lines = mapOrdersToAccountingLines(orders);
  const grouped = new Map<string, { orders: Set<string>; revenue: number }>();
  let totalRevenue = 0;
  for (const line of lines) {
    totalRevenue += line.netRevenue;
    const current = grouped.get(line.channel) ?? { orders: new Set<string>(), revenue: 0 };
    current.orders.add(line.orderId);
    current.revenue += line.netRevenue;
    grouped.set(line.channel, current);
  }
  return Array.from(grouped.entries()).map(([name, row]) => ({
    name,
    orders: row.orders.size,
    revenue: row.revenue,
    share: totalRevenue ? row.revenue / totalRevenue : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

function summarizeBomCoverage(lines: AccountingLine[]) {
  const soldLines = lines.filter(line => line.qty > 0 && line.netRevenue !== 0);
  const missing = soldLines.filter(line => !line.hasBom);
  const grouped = new Map<string, {
    product: string;
    sku: string;
    variantId: string;
    units: number;
    revenue: number;
    lines: number;
    orders: Set<string>;
  }>();
  for (const line of missing) {
    const key = `${line.variantId || line.sku || 'sin-variante'}::${line.product}`;
    const current = grouped.get(key) ?? {
      product: line.product,
      sku: line.sku,
      variantId: line.variantId,
      units: 0,
      revenue: 0,
      lines: 0,
      orders: new Set<string>(),
    };
    current.units += line.qty;
    current.revenue += line.netRevenue;
    current.lines += 1;
    current.orders.add(line.orderName);
    grouped.set(key, current);
  }
  return {
    totalSoldLines: soldLines.length,
    matchedSoldLines: soldLines.length - missing.length,
    coverage: soldLines.length ? (soldLines.length - missing.length) / soldLines.length : 1,
    missingRevenue: missing.reduce((sum, line) => sum + line.netRevenue, 0),
    missingUnits: missing.reduce((sum, line) => sum + line.qty, 0),
    missingSkus: Array.from(grouped.values())
      .map(row => ({
        product: row.product,
        sku: row.sku,
        variantId: row.variantId,
        units: row.units,
        revenue: row.revenue,
        lines: row.lines,
        orders: row.orders.size,
      }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

function addSalesToProducts(productRows: Product[], lines: AccountingLine[]): Product[] {
  const bySku = new Map<string, { units: number; revenue: number; cogs: number; missingBomSales: number }>();
  const byTitle = new Map<string, { units: number; revenue: number; cogs: number; missingBomSales: number }>();
  const add = (map: Map<string, { units: number; revenue: number; cogs: number; missingBomSales: number }>, key: string, line: AccountingLine) => {
    if (!key || key === '—') return;
    const current = map.get(key) ?? { units: 0, revenue: 0, cogs: 0, missingBomSales: 0 };
    current.units += line.qty;
    current.revenue += line.netRevenue;
    current.cogs += line.cogsSold;
    if (!line.hasBom) current.missingBomSales += line.netRevenue;
    map.set(key, current);
  };
  for (const line of lines) {
    add(bySku, line.sku, line);
    add(byTitle, normalizeProductMatchKey(line.product), line);
  }
  return productRows.map(product => {
    const skuSummary = product.sku ? bySku.get(product.sku) : undefined;
    const titleKey = normalizeProductMatchKey(product.name.split(' · ')[0] ?? product.name);
    const titleSummary = byTitle.get(titleKey)
      ?? Array.from(byTitle.entries()).find(([key]) => key.includes(titleKey) || titleKey.includes(key))?.[1];
    const summary = skuSummary ?? titleSummary;
    const missingBomSales = summary?.missingBomSales ?? 0;
    const bomCoverage = product.cogsSource === 'material_manager'
      ? missingBomSales > 0 ? 'partial' : 'complete'
      : 'missing';
    const warnings = [
      product.cogsSource !== 'material_manager' ? 'Sin BOM MM para costo desglosado' : '',
      product.cogsBreakdown.some(item => item.source === 'manual') ? 'Incluye mano de obra manual/no automatizada' : '',
      product.cogsShopify === null ? 'Sin Shopify unitCost' : '',
      product.cogsBreakdown.length === 0 || product.cogsBreakdown.every(item => item.amount === 0) ? 'Sin materiales clave en BOM' : '',
    ].filter(Boolean);
    return {
      ...product,
      unitsSold: summary?.units ?? 0,
      revenue: summary?.revenue ?? 0,
      missingBomSales,
      bomCoverage,
      missingLabor: !product.cogsBreakdown.some(item => /obra|producci|ensamble|qa|control|labor/i.test(item.label)),
      missingShopifyCost: product.cogsShopify === null,
      keyMaterialWarnings: warnings,
    };
  });
}

function buildDashboardKpis(orders: LiveIncomeOrder[], expenses: Array<Record<string, unknown>>, salesSummary?: ShopifySalesSummary) {
  const lines = mapOrdersToAccountingLines(orders);
  const orderIds = new Set(lines.map(line => line.orderId));
  const ingresos = salesSummary?.totalSales ?? lines.reduce((sum, line) => sum + line.netRevenue, 0);
  const cogsVendido = lines.reduce((sum, line) => sum + line.cogsSold, 0);
  const { operatingExpenses, inventoryPurchases, capex, uncategorized } = splitOperatingAndInventoryExpenses(expenses);
  const utilidadBruta = ingresos - cogsVendido;
  const utilidadNeta = utilidadBruta - operatingExpenses;
  const recurrentOrderIds = new Set(lines.filter(line => line.customerType === 'recurrente').map(line => line.orderId));
  const familyRevenue = lines.reduce((map, line) => {
    map.set(line.productFamily, (map.get(line.productFamily) ?? 0) + line.netRevenue);
    return map;
  }, new Map<string, number>());
  const topProductFamily = Array.from(familyRevenue.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const bomCoverage = lines.length ? lines.filter(line => line.hasBom).length / lines.length : 0;
  const coverageText = `${(bomCoverage * 100).toFixed(1)}%`;
  const qualityPrefix = bomCoverage >= 0.999 ? 'Real' : 'Real/parcial';

  return {
    ingresos,
    cogsVendido,
    utilidadBruta,
    margenBruto: ingresos ? utilidadBruta / ingresos : 0,
    gastos: operatingExpenses,
    gastosOperativos: operatingExpenses,
    comprasInventarioExcluidas: inventoryPurchases + capex,
    utilidadNeta,
    margenEstimado: ingresos ? utilidadNeta / ingresos : 0,
    aov: (salesSummary?.orders ?? orderIds.size) ? ingresos / (salesSummary?.orders ?? orderIds.size) : 0,
    ordenes: salesSummary?.orders ?? orderIds.size,
    clientesRecurrentes: recurrentOrderIds.size,
    clientesRecurrentesPct: orderIds.size ? recurrentOrderIds.size / orderIds.size : 0,
    topProductFamily,
    alertasActivas: buildRealAlerts(lines, expenses).length,
    asOf: new Date().toISOString().slice(0, 10),
    dataQualityNote: `${qualityPrefix}: ingresos = ShopifyQL total_sales Analytics (${REPORT_TIME_ZONE}); productos/unidades desde órdenes Shopify; MM BOM/COGS + gastos sheet/manual. Cobertura BOM en líneas vendidas: ${coverageText}; líneas sin BOM (incluye productos custom/personalizados sin BOM definido) quedan en COGS 0 — pendiente costo manual o corregir matching MM. Compras inventario/capex excluidas de gastos operativos: ${Math.round(inventoryPurchases + capex).toLocaleString('es-CO')} COP. Gastos sin categoría incluidos como operativos y alertados: ${Math.round(uncategorized).toLocaleString('es-CO')} COP.`,
  };
}

function buildRealAlerts(lines: AccountingLine[], expenses: Array<Record<string, unknown>>): Alert[] {
  const coverage = summarizeBomCoverage(lines);
  const expenseRows = expenses.map(withExpenseClassification);
  const uncategorized = expenseRows.filter(expense => expense.classification === 'uncategorized');
  const operatingByCategory = expenseRows
    .filter(expense => expense.classification === 'operating' || expense.classification === 'uncategorized')
    .reduce((map, expense) => {
      const category = expense.classification === 'uncategorized'
        ? 'Sin categoría'
        : (String(expense.category ?? '').trim() || 'Sin categoría');
      map.set(category, (map.get(category) ?? 0) + getExpenseAmount(expense));
      return map;
    }, new Map<string, number>());
  const topExpense = Array.from(operatingByCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  const alertsOut: Alert[] = [];
  if (coverage.missingSkus.length > 0) {
    alertsOut.push({
      id: 'real-missing-bom',
      level: coverage.coverage < 0.9 ? 'critical' : 'warn',
      title: `${coverage.missingSkus.length} SKU/líneas vendidas sin BOM`,
      description: `Cobertura BOM vendida ${(coverage.coverage * 100).toFixed(1)}%. Ingresos sin COGS reconocido: ${Math.round(coverage.missingRevenue).toLocaleString('es-CO')} COP. Incluye productos custom/personalizados sin BOM definido — esos quedan pendientes de costo manual y NO se les asigna COGS automático.`,
      recommendation: 'Abrir Productos & Márgenes: corregir Variant ID/SKU/handle en Material Manager para productos catálogo; cargar costo real manual para custom/personalizados. No inventar costo; cargar BOM real.',
      area: 'productos',
      href: '/productos',
      source: 'real',
      metric: 'bom_coverage',
      skus: coverage.missingSkus.slice(0, 8).map(item => item.sku && item.sku !== '—' ? item.sku : item.product),
    });
  }
  if (uncategorized.length > 0) {
    const amount = uncategorized.reduce((sum, expense) => sum + getExpenseAmount(expense), 0);
    alertsOut.push({
      id: 'real-uncategorized-expenses',
      level: amount > 1_000_000 ? 'critical' : 'warn',
      title: `${uncategorized.length} gastos sin categoría contable útil`,
      description: `Hay ${Math.round(amount).toLocaleString('es-CO')} COP clasificados como sin categoría/Otros. Se incluyen como gasto operativo para no inflar utilidad.`,
      recommendation: 'Revisar Gastos y reclasificar en operación, inventario o capex antes de usar el cierre mensual.',
      area: 'gastos',
      href: '/gastos',
      source: 'real',
      metric: 'uncategorized_expenses',
    });
  }
  if (topExpense) {
    const totalRevenue = lines.reduce((sum, line) => sum + line.netRevenue, 0);
    alertsOut.push({
      id: 'real-top-expense-drag',
      level: topExpense[1] > totalRevenue * 0.2 ? 'warn' : 'info',
      title: `Mayor presión sobre utilidad: ${topExpense[0]}`,
      description: `${topExpense[0]} suma ${Math.round(topExpense[1]).toLocaleString('es-CO')} COP en gastos operativos reales.`,
      recommendation: 'Auditar esta categoría primero: buscar gastos recurrentes, duplicados, descuentos de proveedor o pagos que deban capitalizarse como inventario.',
      area: 'gastos',
      href: '/gastos',
      source: 'real',
      metric: 'top_operating_expense',
    });
  }
  alertsOut.push({
    id: 'real-phase1-scope',
    level: 'info',
    title: 'Phase 2 será reemplazar Material Manager',
    description: 'Inventario, BOM, órdenes de compra, costos por material y batch costing siguen como roadmap de Phase 2. Dataico queda Phase 3.',
    recommendation: 'Cerrar Phase 1 con métricas confiables y después diseñar el módulo interno que sustituye MM.',
    area: 'sistema',
    href: '/integracion',
    source: 'real',
  });
  return alertsOut;
}

function buildRealSuggestions(lines: AccountingLine[], expenses: Array<Record<string, unknown>>) {
  const monthsSummary = summarizeMonths([], expenses);
  const byCategory = expenses.map(withExpenseClassification)
    .filter(expense => expense.classification === 'operating' || expense.classification === 'uncategorized')
    .reduce((map, expense) => {
      const category = String(expense.category ?? 'Sin categoría') || 'Sin categoría';
      map.set(category, (map.get(category) ?? 0) + getExpenseAmount(expense));
      return map;
    }, new Map<string, number>());
  const topExpense = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  const byProduct = lines.reduce((map, line) => {
    const current = map.get(line.product) ?? { revenue: 0, cogs: 0, units: 0 };
    current.revenue += line.netRevenue;
    current.cogs += line.cogsSold;
    current.units += line.qty;
    map.set(line.product, current);
    return map;
  }, new Map<string, { revenue: number; cogs: number; units: number }>());
  const topMargin = Array.from(byProduct.entries())
    .filter(([, row]) => row.revenue > 0 && row.cogs > 0)
    .map(([product, row]) => ({ product, ...row, grossProfit: row.revenue - row.cogs, margin: (row.revenue - row.cogs) / row.revenue }))
    .sort((a, b) => b.grossProfit - a.grossProfit)[0];
  const bomCoverage = summarizeBomCoverage(lines);
  return [
    topExpense ? {
      id: 'real-save-top-expense',
      type: 'sugerencia' as const,
      priority: 'alta' as const,
      title: `Ahorro: auditar ${topExpense[0]}`,
      description: `${topExpense[0]} es la categoría operativa más pesada con ${Math.round(topExpense[1]).toLocaleString('es-CO')} COP.`,
      whyItMatters: 'Cada peso reducido aquí mejora utilidad neta sin tocar precio ni calidad.',
      suggestedAction: 'Exportar gastos del mes/año, revisar recurrencias, renegociar proveedor y reclasificar lo que sea inventario/capex.',
      phase: 1 as const,
    } : null,
    {
      id: 'real-bom-coverage-action',
      type: 'analisis' as const,
      priority: bomCoverage.coverage < 0.95 ? 'alta' as const : 'media' as const,
      title: `COGS: cobertura BOM ${(bomCoverage.coverage * 100).toFixed(1)}%`,
      description: `${bomCoverage.missingSkus.length} SKU/líneas vendidas todavía no reconocen COGS desde MM.`,
      whyItMatters: 'La utilidad se sobreestima donde el COGS queda en 0.',
      suggestedAction: 'Corregir Variant ID/SKU en Material Manager para los SKUs listados en Alertas antes de decidir descuentos fuertes.',
      phase: 1 as const,
    },
    topMargin ? {
      id: 'real-push-margin-winners',
      type: 'sugerencia' as const,
      priority: 'media' as const,
      title: `Empujar ganador rentable: ${topMargin.product}`,
      description: `Este SKU/familia aporta ${Math.round(topMargin.grossProfit).toLocaleString('es-CO')} COP de utilidad bruta con margen ${(topMargin.margin * 100).toFixed(1)}%.`,
      whyItMatters: 'Subir volumen en SKUs con margen real positivo mejora caja sin depender solo de más tráfico.',
      suggestedAction: 'Usarlo en bundles, campañas de recompra y cross-sell con productos de baja rotación.',
      phase: 1 as const,
    } : null,
    {
      id: 'real-monthly-close',
      type: 'recordatorio' as const,
      priority: 'media' as const,
      title: 'Cierre mensual: exportar ingresos y gastos',
      description: `${monthsSummary.length} meses tienen P&L calculado con Shopify + MM + gastos reales.`,
      whyItMatters: 'Mantiene el archivo del contador consistente y reduce ajustes manuales.',
      suggestedAction: 'Al cierre, exportar ingresos y gastos del mes desde el OS y revisar alertas de categorías antes de enviar al contador.',
      phase: 1 as const,
    },
  ].filter(Boolean);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sendCsv(res: Response, filename: string, rows: Array<Record<string, unknown>>, headersOverride?: string[]) {
  const headers = headersOverride ?? (rows[0] ? Object.keys(rows[0]) : ['empty']);
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}

async function loadLiveShopifyProducts() {
  type LiveVariant = {
    id: string;
    legacyResourceId: string;
    title: string;
    sku: string | null;
    price: string;
    inventoryQuantity: number;
    inventoryItem: { id: string; tracked: boolean; unitCost: { amount: string; currencyCode: string } | null };
  };
  type LiveProduct = {
    id: string;
    title: string;
    status: string;
    handle: string;
    variants: { edges: Array<{ node: LiveVariant }> };
  };

  const query = `
    query LiveProducts($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            status
            handle
            variants(first: 100) {
              edges {
                node {
                  id
                  legacyResourceId
                  title
                  sku
                  price
                  inventoryQuantity
                  inventoryItem { id tracked unitCost { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }
  `;

  const allProducts: LiveProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await shopifyGraphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: LiveProduct }>;
      };
    }>(query, { cursor });
    allProducts.push(...data.products.edges.map(edge => edge.node));
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return allProducts.flatMap(product => {
    const variants = product.variants.edges.map(edge => edge.node);
    const variantGroups = shouldSplitProductVariants(product.title)
      ? Array.from(
          variants.reduce((map, item) => {
            const key = getVariantPresentation(item.title);
            map.set(key, [...(map.get(key) ?? []), item]);
            return map;
          }, new Map<string, LiveVariant[]>())
        ).map(([presentation, items]) => ({ presentation, variants: items }))
      : variantsHaveSameEconomics(variants)
      ? [{ presentation: null, variants }]
      : variants.map(item => ({ presentation: item.title === 'Default Title' ? null : item.title, variants: [item] }));

    return variantGroups.map(group => {
    const variant = group.variants[0];
    const price = Number(variant.price) || 0;
    const shopifyCost = variant.inventoryItem.unitCost ? Number(variant.inventoryItem.unitCost.amount) : null;
    const bom = buildGroupedBomBreakdown(group.variants.map(item => String(item.legacyResourceId)));
    const cogsUsed = bom?.total ?? shopifyCost ?? 0;
    const packaging = defaultPackaging(product.title);
    const fees = 0.035;
    const shippingSubsidy = 0;
    const idealPrice = cogsUsed > 0 ? Math.ceil((cogsUsed + packaging + shippingSubsidy) / (1 - fees - 0.45) / 100) * 100 : price;
    const maxProfitableDiscount = price > 0
      ? Math.max(0, Math.min(0.7, 1 - ((cogsUsed + packaging + shippingSubsidy) / (price * (1 - fees))) / 0.30))
      : 0;
    const flavorOptions = group.variants
      .map(item => item.title)
      .filter(title => title && title !== 'Default Title');
    const inventoryQuantity = group.variants.reduce((sum, item) => sum + (item.inventoryQuantity || 0), 0);
    const name = group.presentation ? `${product.title} · ${group.presentation}` : product.title;

    return {
      id: group.presentation ? `${product.id}-${group.presentation}` : product.id,
      name,
      family: inferProductFamily(product.title),
      sku: group.variants.find(item => item.sku)?.sku ?? undefined,
      active: product.status === 'ACTIVE',
      unitsSold: 0,
      unitPrice: price,
      revenue: 0,
      cogsShopify: shopifyCost,
      cogsFallback: 0,
      cogsBreakdown: bom?.breakdown ?? [
        {
          label: 'Costo unitario Shopify',
          amount: cogsUsed,
          source: shopifyCost === null ? 'fallback' : 'shopify',
          note: shopifyCost === null
            ? 'Sin unitCost en Shopify; cargar costo para margen real.'
            : `Costo base tomado de Shopify. ${flavorOptions.length || group.variants.length} variantes agrupadas en esta fila.`,
        },
      ],
      packaging,
      fees,
      shippingSubsidy,
      cogsUsed,
      cogsSource: bom ? 'material_manager' : cogsUsed === 0 ? 'fallback' : 'shopify',
      marginSource: bom ? 'material_manager' : 'shopify',
      dataCompleteness: bom || shopifyCost !== null ? 'real' : 'partial',
      idealPrice,
      competitorPrice: price,
      maxProfitableDiscount,
      grossMargin: price > 0 ? (price - cogsUsed) / price : 0,
      contributionMargin: price > 0 ? (price - cogsUsed - packaging - price * fees - shippingSubsidy) / price : 0,
      alert: cogsUsed === 0 ? 'warn' : 'ok',
      alertReason: cogsUsed === 0 ? 'Falta BOM/costo unitario en Material Manager y Shopify.' : undefined,
      inventoryQuantity,
      variantCount: group.variants.length,
      flavorOptions,
      presentation: group.presentation,
      shopifyProductId: product.id,
      shopifyHandle: product.handle,
      variantLegacyIds: group.variants.map(item => ({ id: String(item.legacyResourceId), title: item.title })),
    };
    });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPIs / dashboard
  app.get('/api/kpis', async (req, res) => {
    try {
      const period = getPeriodParams(req.query);
      const [orders, salesSummary, allExpenses] = await Promise.all([
        loadLiveShopifyIncomeOrders(period),
        loadShopifySalesSummary(period),
        loadAllExpenses().then(expenses => expenses.filter(expense => expenseInPeriod(expense, period))),
      ]);
      res.json(buildDashboardKpis(orders, allExpenses, salesSummary));
    } catch (error) {
      console.error('[kpis] failed to calculate real dashboard metrics', error);
      res.json({
        ...kpis,
        topProductFamily: `${kpis.topProductFamily} (seed/prototipo)`,
        dataQualityNote: 'Seed/prototipo: Shopify o Material Manager no respondieron al calcular KPIs reales.',
      });
    }
  });
  app.get('/api/channels', async (_req, res) => {
    try {
      res.json(summarizeChannels(await loadLiveShopifyIncomeOrders()));
    } catch (error) {
      console.error('[months] failed to calculate real monthly metrics', error);
      res.json([]);
    }
  });
  app.get('/api/years', async (_req, res) => {
    try {
      const [orders, salesRows] = await Promise.all([
        loadLiveShopifyIncomeOrders(),
        loadShopifySalesRows('year'),
      ]);
      res.json(summarizeYears(orders, salesRows));
    } catch {
      res.json([]);
    }
  });
  app.get('/api/months', async (req, res) => {
    try {
      const period = getPeriodParams(req.query);
      const [orders, salesRows, allExpenses] = await Promise.all([
        loadLiveShopifyIncomeOrders(period),
        loadShopifySalesRows('month', period),
        loadAllExpenses().then(expenses => expenses.filter(expense => expenseInPeriod(expense, period))),
      ]);
      res.json(summarizeMonths(orders, allExpenses, salesRows));
    } catch {
      res.json([]);
    }
  });
  app.get('/api/ceo-metrics', async (_req, res) => {
    const accounts = await storage.listCashAccounts();
    const netCash = accounts.reduce((sum, account) => {
      if (account.type === 'liability') return sum - account.amount;
      return sum + account.amount;
    }, 0);
    res.json(ceoMetrics.map(metric => metric.id === 'cash' ? { ...metric, value: netCash } : metric));
  });

  // Tabs
  app.get('/api/products', async (_req, res) => {
    try {
      const [productRows, orders] = await Promise.all([
        loadLiveShopifyProducts(),
        loadLiveShopifyIncomeOrders(),
      ]);
      res.json(addSalesToProducts(productRows, mapOrdersToAccountingLines(orders)));
    } catch {
      res.json(products);
    }
  });
  app.get('/api/materials', (_req, res) => res.json(materials));
  // Real MM purchase orders — replaces the legacy seed POs entirely.
  app.get('/api/purchase-orders', (_req, res) => {
    const real = listMmPurchaseOrders(sqlite).map(po => {
      const detail = getMmPurchaseOrder(sqlite, po.poNumber);
      return mmPoToLegacy(detail ?? po);
    });
    res.json(real);
  });

  app.get('/api/material-manager/purchase-orders', (_req, res) => {
    res.json(listMmPurchaseOrders(sqlite));
  });

  app.get('/api/material-manager/purchase-orders/status', (_req, res) => {
    res.json(getMmPurchaseOrdersStatus(sqlite));
  });

  app.get('/api/material-manager/purchase-orders/:idOrNumber', (req, res) => {
    const po = getMmPurchaseOrder(sqlite, req.params.idOrNumber);
    if (!po) return res.status(404).json({ error: 'po_not_found' });
    res.json(po);
  });

  app.post('/api/material-manager/purchase-orders/import', (_req, res) => {
    const result = importMmPurchaseOrders(sqlite);
    res.json({ ...result, status: getMmPurchaseOrdersStatus(sqlite) });
  });

  app.post('/api/material-manager/purchase-orders', (req, res) => {
    try {
      const body = req.body ?? {};
      const created = createMmPurchaseOrder(sqlite, {
        poNumber: typeof body.poNumber === 'string' ? body.poNumber : undefined,
        date: String(body.date ?? ''),
        supplier: String(body.supplier ?? ''),
        shipTo: typeof body.shipTo === 'string' ? body.shipTo : '',
        currency: typeof body.currency === 'string' ? body.currency : 'COP',
        referenceNumber: typeof body.referenceNumber === 'string' && body.referenceNumber ? body.referenceNumber : null,
        notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
        shipping: typeof body.shipping === 'number' ? body.shipping : 0,
        taxes: typeof body.taxes === 'number' ? body.taxes : 0,
        lines: Array.isArray(body.lines) ? body.lines.map((line: Record<string, unknown>) => ({
          product: String(line.product ?? ''),
          sku: typeof line.sku === 'string' ? line.sku : '',
          quantity: Number(line.quantity ?? 0),
          unitCost: Number(line.unitCost ?? 0),
          taxPct: typeof line.taxPct === 'number' ? line.taxPct : 0,
        })) : [],
      });
      res.json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'create_failed';
      res.status(400).json({ error: message });
    }
  });
  app.get('/api/income-details', async (req, res) => {
    try {
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const year = typeof req.query.year === 'string' ? req.query.year : undefined;
      res.json(mapOrdersToIncomeDetails(await loadLiveShopifyIncomeOrders({ month, year })));
    } catch {
      res.json([]);
    }
  });
  app.get('/api/expenses', async (_req, res) => {
    res.json((await loadAllExpenses()).map(withExpenseClassification));
  });
  app.get('/api/export/income.csv', async (req, res) => {
    try {
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const year = typeof req.query.year === 'string' ? req.query.year : undefined;
      const rows = mapOrdersToIncomeDetails(await loadLiveShopifyIncomeOrders({ month, year })).map(row => ({
        orden: row.orderName,
        fecha: row.date,
        mes: row.month,
        canal: row.channel,
        producto: row.product,
        sku: row.sku,
        cantidad: row.qty,
        bruto_cop: Math.round(row.grossRevenue),
        descuentos_cop: Math.round(row.discounts),
        envio_cobrado_cop: Math.round(row.shipping),
        devoluciones_cop: Math.round(row.refunds),
        neto_cop: Math.round(row.netRevenue),
        estado_pago: row.paymentStatus,
        estado_fulfillment: row.fulfillmentStatus,
      }));
      sendCsv(res, `connabis-ingresos-${month ?? year ?? 'all-time'}.csv`, rows, [
        'orden', 'fecha', 'mes', 'canal', 'producto', 'sku', 'cantidad', 'bruto_cop',
        'descuentos_cop', 'envio_cobrado_cop', 'devoluciones_cop', 'neto_cop',
        'estado_pago', 'estado_fulfillment',
      ]);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'shopify_income_export_failed' });
    }
  });
  app.get('/api/export/expenses.csv', async (req, res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const year = typeof req.query.year === 'string' ? req.query.year : undefined;
      const rows = ((await loadAllExpenses()).map(withExpenseClassification) as Array<{
      date: string;
      month: string;
      category: string;
      description: string;
      paidTo?: string;
      paidWith?: string;
      paidBy?: string;
      currency?: 'COP' | 'USD';
      originalAmount?: number;
      fxRate?: number;
      tax?: number;
      amount: number;
      source: 'sheet' | 'manual' | 'shopify';
      notes?: string;
      classification: ExpenseClassification;
    }>)
      .filter(expense => !month || expense.month === month)
      .filter(expense => !year || expense.month.startsWith(`${year}-`))
      .map(expense => ({
        fecha: expense.date,
        mes: expense.month,
        categoria: expense.category,
        descripcion: expense.description,
        pagado_a: expense.paidTo ?? '',
        pagado_con: expense.paidWith ?? '',
        pagado_por: expense.paidBy ?? '',
        moneda: expense.currency ?? 'COP',
        monto_original: expense.originalAmount ?? expense.amount,
        trm: expense.fxRate ?? '',
        impuesto_cop: expense.tax ?? '',
        monto_cop: Math.round(expense.amount * 100) / 100,
        clasificacion: expense.classification,
        origen: expense.source,
        notas: expense.notes ?? '',
      }));
    sendCsv(res, `connabis-gastos-${month ?? year ?? 'all-time'}.csv`, rows, [
      'fecha', 'mes', 'categoria', 'descripcion', 'pagado_a', 'pagado_con',
      'pagado_por', 'moneda', 'monto_original', 'trm', 'impuesto_cop', 'monto_cop', 'clasificacion', 'origen', 'notas',
    ]);
  });
  app.post('/api/expenses', async (req, res) => {
    const parsed = insertExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid expense', details: parsed.error.flatten() });
    }
    try {
      const created = await storage.createManualExpense(parsed.data);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'expense_create_failed' });
    }
  });
  app.put('/api/expenses/:id', async (req, res) => {
    const parsed = updateExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid expense update', details: parsed.error.flatten() });
    }
    try {
      const existing = (await loadAllExpenses()).find(expense => String(expense.id) === req.params.id);
      if (!existing) return res.status(404).json({ error: 'expense_not_found' });
      const updated = req.params.id.startsWith('manual-')
        ? await storage.updateManualExpense(req.params.id, parsed.data)
        : await storage.upsertExpenseOverride(req.params.id, parsed.data, existing.source);
      if (!updated) return res.status(404).json({ error: 'expense_not_found' });
      res.json(withExpenseClassification(updated));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'expense_update_failed' });
    }
  });
  app.delete('/api/expenses/:id', async (req, res) => {
    if (!req.params.id.startsWith('manual-')) {
      return res.status(400).json({ error: 'Solo se pueden eliminar gastos manuales antes de conectar contabilidad.' });
    }
    const deleted = await storage.deleteManualExpense(req.params.id);
    res.json({ deleted });
  });
  app.get('/api/daily-performance', async (_req, res) => {
    try {
      res.json(await buildDailyPerformanceRows());
    } catch {
      res.json(dailyPerformance);
    }
  });
  app.get('/api/day-details', async (req, res) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date inválida' });
      const orders = await loadLiveShopifyIncomeOrders({ start: date, end: date });
      const income = mapOrdersToAccountingLines(orders).filter(line => line.date === date);
      const expenses = (await loadAllExpenses())
        .map(withExpenseClassification)
        .filter(expense => String(expense.date) === date && expense.classification !== 'inventory' && expense.classification !== 'capex');
      res.json({ date, income, expenses });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'day_details_failed' });
    }
  });
  app.get('/api/bom-coverage', async (_req, res) => {
    try {
      const lines = mapOrdersToAccountingLines(await loadLiveShopifyIncomeOrders());
      res.json(summarizeBomCoverage(lines));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'bom_coverage_failed' });
    }
  });
  app.get('/api/alerts', async (_req, res) => {
    try {
      const orders = await loadLiveShopifyIncomeOrders();
      const allExpenses = await loadAllExpenses();
      res.json(buildRealAlerts(mapOrdersToAccountingLines(orders), allExpenses));
    } catch {
      res.json(alerts.map(alert => ({ ...alert, source: 'seed' })));
    }
  });
  app.get('/api/integration-phases', (_req, res) => res.json(integrationPhases));
  app.get('/api/glossary', (_req, res) => res.json(glossaryTerms));
  app.get('/api/accounting-suggestions', async (_req, res) => {
    try {
      const orders = await loadLiveShopifyIncomeOrders();
      const allExpenses = await loadAllExpenses();
      res.json(buildRealSuggestions(mapOrdersToAccountingLines(orders), allExpenses));
    } catch {
      res.json(accountingSuggestions);
    }
  });
  app.get('/api/restock-plan', (_req, res) => res.json(restockRecommendations));
  app.get('/api/pnl', (_req, res) => res.json(pnlRows));
  app.get('/api/cash-accounts', async (_req, res) => res.json(await storage.listCashAccounts()));
  app.patch('/api/cash-accounts/:id', async (req, res) => {
    const parsed = updateCashAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid cash account amount', details: parsed.error.flatten() });
    }
    const updated = await storage.updateCashAccount(req.params.id as never, parsed.data.amount);
    if (!updated) return res.status(404).json({ error: 'Cash account not found' });
    res.json(updated);
  });
  app.get('/api/cash-flow', async (_req, res) => {
    const accounts = await storage.listCashAccounts();
    const netCash = accounts.reduce((sum, account) => account.type === 'liability' ? sum - account.amount : sum + account.amount, 0);
    const usableCash = accounts
      .filter(account => account.type === 'asset')
      .reduce((sum, account) => sum + account.amount, 0);
    const pendingCash = accounts
      .filter(account => account.type === 'pending_asset')
      .reduce((sum, account) => sum + account.amount, 0);
    res.json(cashFlowSnapshots.map(item => {
      if (item.id === 'cash-on-hand') {
        return {
          ...item,
          amount: netCash,
          explanation: `Caja neta editable. Disponible hoy: ${usableCash.toLocaleString('es-CO')} COP; pendiente Mercado Pago: ${pendingCash.toLocaleString('es-CO')} COP.`,
        };
      }
      return item;
    }));
  });
  app.get('/api/inventory-accounting', (_req, res) => res.json(inventoryAccountingRows));
  app.get('/api/close-checklist', async (_req, res) => {
    res.json(await storage.mergeCloseChecklist(closeChecklist));
  });
  app.patch('/api/close-checklist/:id', async (req, res) => {
    const parsed = updateCloseChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid checklist status', details: parsed.error.flatten() });
    }
    await storage.updateCloseChecklistStatus(req.params.id, parsed.data.status);
    const merged = await storage.mergeCloseChecklist(closeChecklist);
    res.json(merged.find(item => item.id === req.params.id));
  });

  app.get('/api/shopify/status', async (_req, res) => {
    try {
      const data = await shopifyGraphql<{
        shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string; url: string } };
        currentAppInstallation: { accessScopes: Array<{ handle: string }> };
      }>(`
        query ShopifyStatus {
          shop { name myshopifyDomain primaryDomain { host url } }
          currentAppInstallation { accessScopes { handle } }
        }
      `);
      const scopes = data.currentAppInstallation.accessScopes.map(scope => scope.handle);
      res.json({
        connected: true,
        mode: 'live-read-only',
        shopName: data.shop.name,
        shopDomain: data.shop.myshopifyDomain,
        primaryDomain: data.shop.primaryDomain.host,
        apiVersion: SHOPIFY_API_VERSION,
        lastSync: new Date().toISOString(),
        scopes,
        hasReadProducts: scopes.includes('read_products'),
        hasReadOrders: scopes.includes('read_orders'),
        note: 'Shopify Admin API conectado en modo solo lectura. Ingresos y productos salen de Shopify live; gastos históricos salen del sheet Expenses y nuevos gastos de registros manuales.',
      });
    } catch (error) {
      res.json({
        connected: false,
        mode: 'mock-seed',
        shopDomain: null,
        apiVersion: null,
        lastSync: null,
        scopes: [],
        note: error instanceof Error && error.message === 'missing_shopify_credentials'
          ? 'Faltan variables Shopify en el servidor. El MVP usa datos sembrados.'
          : 'Shopify no respondió correctamente. El MVP usa datos sembrados.',
      });
    }
  });

  app.get('/api/shopify/products-live', async (_req, res) => {
    try {
      res.json(await loadLiveShopifyProducts());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'shopify_products_failed' });
    }
  });

  app.get('/api/shopify/orders-live', async (_req, res) => {
    try {
      const data = await shopifyGraphql<{
        orders: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              createdAt: string;
              displayFinancialStatus: string;
              totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
              lineItems: { edges: Array<{ node: { title: string; quantity: number; variant: { id: string; sku: string | null; price: string } | null } }> };
            };
          }>;
        };
      }>(`
        query LiveOrders {
          orders(first: 20, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                lineItems(first: 25) {
                  edges { node { title quantity variant { id sku price } } }
                }
              }
            }
          }
        }
      `);
      res.json(data.orders.edges.map(edge => edge.node));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'shopify_orders_failed' });
    }
  });

  app.get('/api/shopify/install', (req, res) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const rawShop = typeof req.query.shop === 'string' ? req.query.shop : '';
    const shop = rawShop.endsWith('.myshopify.com') ? rawShop : `${rawShop}.myshopify.com`;

    if (!clientId || !clientSecret) {
      return res.status(500).send('Shopify OAuth no está configurado en el servidor. Falta SHOPIFY_CLIENT_ID o SHOPIFY_CLIENT_SECRET.');
    }

    if (!/^[-a-z0-9]+\.myshopify\.com$/i.test(shop)) {
      return res.status(400).send('Shopify shop inválido. Usa /api/shopify/install?shop=2f979e-24.myshopify.com');
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const redirectUri = `${protocol}://${host}/api/shopify/callback`;
    const scopes = [
      'read_products',
      'read_inventory',
      'read_locations',
      'read_orders',
      'read_draft_orders',
      'read_customers',
      'read_reports',
    ].join(',');
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  });

  app.get('/api/shopify/callback', async (req, res) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const shop = typeof req.query.shop === 'string' ? req.query.shop : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const hmac = typeof req.query.hmac === 'string' ? req.query.hmac : '';

    if (!clientId || !clientSecret) {
      return res.status(500).send('Shopify OAuth no está configurado en el servidor.');
    }

    if (!/^[-a-z0-9]+\.myshopify\.com$/i.test(shop) || !code || !hmac) {
      return res.status(400).send('Callback Shopify incompleto.');
    }

    const message = Object.entries(req.query)
      .filter(([key]) => key !== 'hmac' && key !== 'signature')
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
      .sort()
      .join('&');
    const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
    const isValid = crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
    if (!isValid) {
      return res.status(401).send('Firma Shopify inválida.');
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; scope?: string; error?: string; error_description?: string };

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).send(`Shopify no completó instalación: ${tokenData.error_description || tokenData.error || 'error desconocido'}`);
    }

    res.send(`
      <main style="font-family: Inter, system-ui, sans-serif; padding: 32px; max-width: 720px; margin: auto;">
        <h1>Connabis Accounting OS conectado</h1>
        <p>Shop instalado: <strong>${shop}</strong></p>
        <p>Scopes concedidos: <code>${tokenData.scope || 'sin scopes reportados'}</code></p>
        <p>Ya puedes volver a Perplexity para validar productos, órdenes e inventario en modo solo lectura.</p>
      </main>
    `);
  });

  // ---------- Phase 2.1: Material Manager read-only mirror ----------
  // Shadow mode. No Shopify or inventory writes happen here.
  app.get('/api/material-manager/status', (_req, res) => {
    res.json(getMirrorStatus(sqlite));
  });

  app.post('/api/material-manager/import', (_req, res) => {
    try {
      const result = importMaterialManagerMirror(sqlite);
      // Invalidate the legacy CSV cache so Phase 1 lookups pick up fresh data too.
      materialManagerCache = null;
      res.json({
        ...getMirrorStatus(sqlite),
        warnings: result.warnings,
      });
    } catch (error) {
      console.error('[mm-mirror] import failed', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'import_failed' });
    }
  });

  app.get('/api/material-manager/materials', (req, res) => {
    // Effective view = MM mirror + local overrides. Pristine mirror is only
    // read by the round-trip export/QA endpoints.
    const materials = listMmMaterialsEffective(sqlite);
    const filter = String(req.query.category ?? '').toLowerCase();
    const filtered = filter ? materials.filter(m => m.category.toLowerCase().includes(filter)) : materials;
    res.json(filtered);
  });

  app.get('/api/material-manager/bom', (req, res) => {
    res.json(listMmBomComponents(sqlite, {
      materialId: req.query.materialId ? String(req.query.materialId) : undefined,
      variantId: req.query.variantId ? String(req.query.variantId) : undefined,
    }));
  });

  // Returns the set of variant legacy IDs that belong to ACTIVE Shopify
  // products. Used by the BOM/Productos tab to hide rows for archived /
  // unpublished SKUs. Returns an empty list (with `connected: false`) when
  // Shopify is not connected — the UI then falls back to showing all rows so
  // dev/mock data still works.
  app.get('/api/material-manager/active-variant-ids', async (_req, res) => {
    try {
      const live = await loadLiveShopifyProducts();
      const ids = new Set<string>();
      live.forEach(product => {
        (product.variantLegacyIds ?? []).forEach(v => v.id && ids.add(v.id));
      });
      res.json({ connected: true, variantIds: Array.from(ids), productCount: live.length });
    } catch {
      res.json({ connected: false, variantIds: [], productCount: 0 });
    }
  });

  app.get('/api/material-manager/cost-history', (req, res) => {
    res.json(listMmCostHistory(sqlite, {
      materialKey: req.query.materialKey ? String(req.query.materialKey) : undefined,
      sourceSheet: req.query.sourceSheet ? String(req.query.sourceSheet) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }));
  });

  app.get('/api/material-manager/export/materials.csv', (_req, res) => {
    const csv = exportMmMaterialsCsv(sqlite);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="material-manager-export.csv"');
    res.send(csv);
  });

  app.get('/api/material-manager/export/bom.csv', (_req, res) => {
    const csv = exportMmBomCsv(sqlite);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="material-manager-export-material-product.csv"');
    res.send(csv);
  });

  app.post('/api/material-manager/qa', (_req, res) => {
    try {
      res.json(runRoundTripQa(sqlite));
    } catch (error) {
      console.error('[mm-mirror] qa failed', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'qa_failed' });
    }
  });

  // Material detail (dashboard view)
  app.get('/api/material-manager/materials/:id', (req, res) => {
    const detail = getMaterialDetail(sqlite, req.params.id);
    if (!detail) return res.status(404).json({ error: 'material_not_found' });
    res.json(detail);
  });

  // Product BOM detail by variant id (legacy/numeric Shopify variant id)
  app.get('/api/material-manager/variants/:variantId/bom', (req, res) => {
    res.json(getProductBomDetail(sqlite, req.params.variantId));
  });

  // Draft BOM CRUD — local-only edits, never written into the MM mirror tables.
  app.get('/api/material-manager/bom-drafts', (req, res) => {
    res.json(listMmBomDrafts(sqlite, {
      materialId: req.query.materialId ? String(req.query.materialId) : undefined,
      variantId: req.query.variantId ? String(req.query.variantId) : undefined,
    }));
  });

  app.post('/api/material-manager/bom-drafts', (req, res) => {
    const parsed = insertBomDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_draft', details: parsed.error.flatten() });
    }
    try {
      const created = createBomDraft(sqlite, parsed.data);
      res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'create_failed';
      res.status(message === 'material_not_found' ? 404 : 400).json({ error: message });
    }
  });

  app.patch('/api/material-manager/bom-drafts/:id', (req, res) => {
    const parsed = updateBomDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_draft_update', details: parsed.error.flatten() });
    }
    const updated = updateBomDraft(sqlite, Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ error: 'draft_not_found' });
    res.json(updated);
  });

  app.delete('/api/material-manager/bom-drafts/:id', (req, res) => {
    res.json({ deleted: deleteBomDraft(sqlite, Number(req.params.id)) });
  });

  // ---------- Material overrides (local-only edits) ----------
  // The MM mirror table is never mutated. PATCH writes/updates an override row
  // keyed by materialId; DELETE clears the override so the pristine MM value
  // shows again.
  app.patch('/api/material-manager/materials/:id/override', (req, res) => {
    const parsed = updateMaterialOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_override', details: parsed.error.flatten() });
    }
    const override = upsertMaterialOverride(sqlite, req.params.id, parsed.data);
    if (!override) return res.status(404).json({ error: 'material_not_found' });
    const effective = getMmMaterialEffective(sqlite, req.params.id);
    res.json({ override, effective });
  });

  app.delete('/api/material-manager/materials/:id/override', (req, res) => {
    const deleted = deleteMaterialOverride(sqlite, req.params.id);
    const effective = getMmMaterialEffective(sqlite, req.params.id);
    res.json({ deleted, effective });
  });

  // ---------- BOM imported-row overrides ----------
  // Upsert (PATCH): override quantity/unit, or set `removed=true` to hide a MM
  // BOM row locally. Pristine MM rows are preserved for the round-trip export.
  app.get('/api/material-manager/bom-overrides', (req, res) => {
    res.json(listMmBomOverrides(sqlite, {
      variantId: req.query.variantId ? String(req.query.variantId) : undefined,
      materialId: req.query.materialId ? String(req.query.materialId) : undefined,
    }));
  });

  app.patch('/api/material-manager/variants/:variantId/bom-overrides/:materialId', (req, res) => {
    const parsed = updateBomOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_override', details: parsed.error.flatten() });
    }
    const updated = upsertMmBomOverride(sqlite, req.params.variantId, req.params.materialId, parsed.data);
    if (!updated) return res.status(404).json({ error: 'mm_bom_row_not_found' });
    res.json(updated);
  });

  app.delete('/api/material-manager/variants/:variantId/bom-overrides/:materialId', (req, res) => {
    res.json({ deleted: deleteMmBomOverride(sqlite, req.params.variantId, req.params.materialId) });
  });

  // Cart Calculator — recipes + packaging seeded from the accounting sheet
  // `Calculadora Carts`. Per-ingredient cost is taken from the live MM mirror
  // when an ingredient name matches; otherwise we fall back to the seed value
  // and mark it `source: 'sheet'`.
  app.get('/api/material-manager/cart-calculator', (_req, res) => {
    res.json({
      recipes: buildRecipesWithMmCosts(sqlite),
      packaging: buildPackagingWithMmCosts(sqlite),
      bagCost: CLEAR_BUBBLE_BAG_COST,
    });
  });

  // ---------- Terpene Rotation Manager (Phase 2 · draft-only) ----------
  // Local-only canonical rotation slots + draft replacement plan. No mutation
  // here is ever propagated to MM/BOM/Shopify — those are Phase 2.3+ tasks.
  app.get('/api/terpene-rotation/slots', (_req, res) => {
    res.json(listTerpeneSlots(sqlite));
  });
  app.post('/api/terpene-rotation/slots', (req, res) => {
    try {
      const body = req.body ?? {};
      const saved = upsertTerpeneSlot(sqlite, {
        id: typeof body.id === 'number' ? body.id : undefined,
        slotIndex: Number(body.slotIndex),
        displayName: String(body.displayName ?? ''),
        materialIdHint: typeof body.materialIdHint === 'string' && body.materialIdHint ? body.materialIdHint : null,
        status: body.status,
        notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
      });
      res.json(saved);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'slot_save_failed' });
    }
  });
  app.delete('/api/terpene-rotation/slots/:id', (req, res) => {
    res.json({ deleted: deleteTerpeneSlot(sqlite, Number(req.params.id)) });
  });
  app.get('/api/terpene-rotation/drafts', (_req, res) => {
    res.json(listTerpeneDrafts(sqlite));
  });
  app.post('/api/terpene-rotation/drafts', (req, res) => {
    try {
      const body = req.body ?? {};
      const saved = upsertTerpeneDraft(sqlite, {
        id: typeof body.id === 'number' ? body.id : undefined,
        fromName: String(body.fromName ?? '').trim(),
        toName: String(body.toName ?? '').trim(),
        affectedVariantPattern: typeof body.affectedVariantPattern === 'string' && body.affectedVariantPattern ? body.affectedVariantPattern : null,
        containerVariants: typeof body.containerVariants === 'string' ? body.containerVariants : '',
        status: body.status,
        notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
      });
      res.json(saved);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'draft_save_failed' });
    }
  });
  app.delete('/api/terpene-rotation/drafts/:id', (req, res) => {
    res.json({ deleted: deleteTerpeneDraft(sqlite, Number(req.params.id)) });
  });

  return httpServer;
}
