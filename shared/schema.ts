import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Kept for the template — not used by the dashboard.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ---------- Domain types (returned by API, served from in-memory seed) ----------

export type Channel = {
  name: string;
  share: number;       // 0..1
  revenue: number;     // COP
  orders: number;
};

export type MonthlyRow = {
  month: string;       // 'YYYY-MM'
  label: string;       // 'Ene 2026'
  income: number;
  cogs?: number;
  grossProfit?: number;
  grossMargin?: number;
  expenses: number;
  profit: number;
  netMargin?: number;
  inventoryPurchasesExcluded?: number;
  partial?: boolean;
  note?: string;
};

export type YearSummary = {
  year: number;
  orders: number;
  revenue: number;
  aov: number;
  projected?: number;
  note?: string;
};

export type DashboardKPIs = {
  ingresos: number;
  cogsVendido?: number;
  utilidadBruta?: number;
  margenBruto?: number;    // 0..1
  gastos: number;
  gastosOperativos?: number;
  comprasInventarioExcluidas?: number;
  utilidadNeta: number;
  margenEstimado: number;   // 0..1
  aov: number;
  ordenes: number;
  clientesRecurrentes: number;
  clientesRecurrentesPct: number;
  topProductFamily: string;
  alertasActivas: number;
  asOf: string;
  dataQualityNote?: string;
};

export type CeoMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: 'COP' | 'pct' | 'count' | 'text';
  status: 'ok' | 'watch' | 'risk';
  subtitle: string;
  action: string;
};

export type Product = {
  id: string;
  name: string;
  family: string;
  sku?: string;
  active: boolean;
  unitsSold: number;
  unitPrice: number;        // COP - from Shopify
  revenue: number;          // COP
  cogsShopify: number | null; // COP - Shopify variant cost; null = no cost in Shopify
  cogsFallback: number;     // estimated landed cost (used only if Shopify cost missing)
  cogsBreakdown: CostBreakdownItem[];
  packaging: number;        // COP
  fees: number;             // % of revenue
  shippingSubsidy: number;  // COP
  // computed
  cogsUsed: number;
  cogsSource: 'shopify' | 'material_manager' | 'fallback' | 'manual_override';
  marginSource: 'shopify' | 'material_manager' | 'seed' | 'manual_override';
  dataCompleteness: 'real' | 'partial' | 'placeholder';
  idealPrice: number;
  competitorPrice: number;
  maxProfitableDiscount: number;
  grossMargin: number;      // 0..1
  contributionMargin: number;  // 0..1
  alert: 'ok' | 'warn' | 'danger';
  alertReason?: string;
  bomCoverage?: 'complete' | 'partial' | 'missing';
  missingBomSales?: number;
  missingLabor?: boolean;
  missingShopifyCost?: boolean;
  keyMaterialWarnings?: string[];
  inventoryQuantity?: number;
  variantCount?: number;
  flavorOptions?: string[];
  presentation?: string | null;
  shopifyProductId?: string;
  shopifyHandle?: string;
  variantLegacyIds?: Array<{ id: string; title: string }>;
};

export type CostBreakdownItem = {
  label: string;
  amount: number;
  source: 'shopify' | 'bom' | 'manual' | 'fallback';
  note?: string;
};

export type MaterialCost = {
  id: string;
  name: string;
  unit: string;
  lastCost: number;
  category: 'hardware' | 'distillate';
  source: string;
};

export type PurchaseOrder = {
  id: string;
  date: string;
  supplier: string;
  category: string;
  qty: number;
  unitCost: number;
  shipping: number;
  tax: number;
  landedCost: number;
  status: 'recibido' | 'en_transito' | 'pendiente';
  currency: 'COP' | 'USD';
  paymentMethod: string;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  items: PurchaseOrderItem[];
};

export type PurchaseOrderItem = {
  material: string;
  sku?: string;
  category: string;
  qty: number;
  unitCost: number;
  subtotal: number;
  expectedUse?: string;
};

export type IncomeDetail = {
  id: string;
  orderName: string;
  date: string;
  month: string;
  channel: string;
  customerType: 'nuevo' | 'recurrente' | 'vip' | 'b2b';
  product: string;
  sku: string;
  qty: number;
  grossRevenue: number;
  discounts: number;
  shipping: number;
  refunds: number;
  netRevenue: number;
  paymentStatus: 'paid' | 'pending' | 'refunded' | 'partially_refunded';
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'partial';
};

export type Expense = {
  id: string;
  date: string;
  month: string;       // 'YYYY-MM'
  category: string;
  description: string;
  amount: number;
  paidTo?: string;
  paidWith?: string;
  paidBy?: string;
  currency?: 'COP' | 'USD';
  originalAmount?: number;
  fxRate?: number;
  tax?: number;
  notes?: string;
  classification?: 'operating' | 'inventory' | 'capex' | 'uncategorized';
  source: 'shopify' | 'sheet' | 'manual';
};

export const insertExpenseSchema = z.object({
  date: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive().max(500_000_000),
  paidTo: z.string().optional(),
  paidWith: z.string().optional(),
  currency: z.enum(['COP', 'USD']).default('COP'),
  originalAmount: z.number().positive().optional(),
  fxRate: z.number().positive().optional(),
  notes: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.currency === 'USD' && (!value.fxRate || !value.originalAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fxRate'],
      message: 'Los gastos en USD requieren monto original y TRM.',
    });
  }
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export const updateExpenseSchema = insertExpenseSchema;
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;

export type DailyPerformance = {
  date: string;
  month: string;
  orders: number;
  revenue: number;
  cogs?: number;
  grossProfit?: number;
  expenses: number;
  profit: number;
  netMargin?: number;
  aov: number;
  topProduct: string;
  topProductRevenue: number;
  topProductUnits: number;
  note?: string;
};

export type GlossaryTerm = {
  id: string;
  term: string;
  category: 'finanzas' | 'shopify' | 'margen' | 'inventario' | 'crecimiento';
  short: string;
  formula?: string;
  connabisExample: string;
  action: string;
  referenceLabel?: string;
  referenceUrl?: string;
};

export type AccountingSuggestion = {
  id: string;
  type: 'prediccion' | 'analisis' | 'sugerencia' | 'recordatorio';
  priority: 'alta' | 'media' | 'baja';
  title: string;
  description: string;
  whyItMatters: string;
  suggestedAction: string;
  phase: 1 | 2;
};

export type Alert = {
  id: string;
  level: 'critical' | 'warn' | 'info';
  title: string;
  description: string;
  recommendation: string;
  area: 'ingresos' | 'gastos' | 'productos' | 'inventario' | 'sistema';
  skus?: string[];
  href?: string;
  source?: 'real' | 'seed';
  metric?: string;
};

export type IntegrationPhase = {
  phase: number;
  title: string;
  status: 'planificado' | 'en_progreso' | 'completado';
  bullets: string[];
  requiresCredentials?: string[];
};

export type RestockRecommendation = {
  id: string;
  material: string;
  category: 'hardware' | 'distillate' | 'packaging';
  currentStock: number;
  unit: string;
  avgDailyUsage: number;
  daysOnHand: number;
  leadTimeDays: number;
  reorderPoint: number;
  targetCoverDays: number;
  recommendedQty: number;
  estimatedUnitCost: number;
  estimatedCost: number;
  suggestedOrderDate: string;
  latestSafeOrderDate: string;
  monthCashImpact: number;
  risk: 'crítico' | 'alto' | 'medio' | 'bajo';
  balanceNote: string;
  productsImpacted: string[];
};

export type PnlRow = {
  month: string;
  label: string;
  revenue: number;
  refunds: number;
  discounts: number;
  netRevenue: number;
  cogsRecognized: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  inventoryPurchases: number;
  inventoryCapitalized: number;
  netIncomeAccounting: number;
  cashProfitNaive: number;
  note?: string;
};

export type CashFlowSnapshot = {
  id: string;
  label: string;
  amount: number;
  status: 'ok' | 'watch' | 'risk';
  explanation: string;
};

export type CashAccount = {
  id: 'nequi' | 'nu_debit' | 'mercado_pago_released' | 'mercado_pago_unreleased' | 'nu_credit_card_debt';
  label: string;
  type: 'asset' | 'pending_asset' | 'liability';
  amount: number;
  description: string;
};

export const updateCashAccountSchema = z.object({
  amount: z.number().min(0),
});

export type UpdateCashAccount = z.infer<typeof updateCashAccountSchema>;

export type InventoryAccountingRow = {
  id: string;
  month: string;
  purchaseOrder: string;
  material: string;
  cashPaid: number;
  capitalizedToInventory: number;
  cogsRecognized: number;
  remainingInventoryValue: number;
  accountingTreatment: string;
};

export type CloseChecklistItem = {
  id: string;
  area: 'shopify' | 'gastos' | 'inventario' | 'impuestos' | 'reconciliacion';
  task: string;
  owner: 'CEO' | 'Contador' | 'Operaciones';
  dueTiming: string;
  status: 'pendiente' | 'en_progreso' | 'listo' | 'bloqueado';
  whyItMatters: string;
};

export const updateCloseChecklistSchema = z.object({
  status: z.enum(['pendiente', 'en_progreso', 'listo', 'bloqueado']),
});

export type UpdateCloseChecklist = z.infer<typeof updateCloseChecklistSchema>;

// ---------- Phase 2: Material Manager read-only mirror ----------
// CSV 1 headers (exact order). Must round-trip for emergency MM rollback.
export const MM_MATERIALS_CSV_HEADERS = [
  'ID',
  'Name',
  'Description',
  'Measurement',
  'SKU',
  'Barcode',
  'Category',
  'Supplier',
  'Cost',
  'Currency Code',
  'Update Shopify Inventory',
  'Limit Shopify Inventory',
  'Materials used in all orders',
  'Calle 36 #22a-108 (4bf83698-ff9e-4857-9da3-e4f44bc3b447)',
] as const;
export type MmMaterialsCsvHeader = typeof MM_MATERIALS_CSV_HEADERS[number];

// CSV 2 headers (exact order).
export const MM_BOM_CSV_HEADERS = [
  'Material ID',
  'Variant ID',
  'Quantity of material used',
  'Material name',
  'Product name',
  'Variant name',
] as const;
export type MmBomCsvHeader = typeof MM_BOM_CSV_HEADERS[number];

export type MmMaterialRow = {
  id: string;
  name: string;
  description: string;
  measurement: string;
  sku: string;
  barcode: string;
  category: string;
  supplier: string;
  cost: number;
  currencyCode: string;
  updateShopifyInventory: boolean;
  limitShopifyInventory: boolean;
  materialsUsedInAllOrders: string;
  stock: number;
  // Derived flags
  isInsumo: boolean;     // tools/equipment — not inventory-trackable BOM/COGS
  isNoid: boolean;       // carts/disposables for cannabinoids stay in Noids
  // Origin marker — 'mm' = pristine MM mirror, 'local' = created in this OS
  // (never round-tripped back to MM CSV export). Always present on the
  // effective view; omitted from the raw MM mirror reads to keep older code
  // forward-compatible.
  origin?: 'mm' | 'local';
  archived?: boolean;    // soft-delete flag — hidden from default lists/dashes
};

export type MmBomRow = {
  materialId: string;
  variantId: string;
  quantity: number;
  materialName: string;
  productName: string;
  variantName: string;
};

export type MmCostHistoryRow = {
  id: number;
  date: string;          // ISO date
  materialKey: string;   // normalized name used for matching
  material: string;      // raw label from Excel
  unitCostCop: number;
  qty: number | null;
  currency: string | null;
  fxRate: number | null;
  sourceSheet: string;
  description: string | null;
};

export type MmImportRun = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'success' | 'partial' | 'error';
  materialsImported: number;
  bomImported: number;
  costHistoryImported: number;
  conflicts: number;
  notes: string | null;
};

export type MmRoundTripQa = {
  headersMatch: boolean;
  materialsRowCount: { imported: number; exported: number };
  bomRowCount: { imported: number; exported: number };
  materialIdsMatch: boolean;
  variantIdsMatch: boolean;
  bomQuantitiesMatch: boolean;
  stockMatch: boolean;
  mismatches: string[];
  status: 'pass' | 'fail';
  ranAt: string;
};

export type MmMirrorStatus = {
  materialsImported: number;
  bomImported: number;
  variantsWithBom: number;
  costHistoryRows: number;
  conflicts: number;
  lastRun: MmImportRun | null;
  lastQa: MmRoundTripQa | null;
  draftBomCount?: number;
};

// Draft BOM overlay — local edits that do NOT mutate MM-imported rows.
// Kept in its own table so the round-trip export of MM remains pristine.
export type MmBomDraftRow = {
  id: number;
  variantId: string;
  materialId: string;
  quantity: number;
  unit: string;
  materialName: string;
  productName: string;
  variantName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export const insertBomDraftSchema = z.object({
  variantId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().min(0).max(10_000),
  unit: z.string().max(40).optional(),
  productName: z.string().max(200).optional(),
  variantName: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export type InsertBomDraft = z.infer<typeof insertBomDraftSchema>;

export const updateBomDraftSchema = z.object({
  quantity: z.number().min(0).max(10_000).optional(),
  unit: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
});

export type UpdateBomDraft = z.infer<typeof updateBomDraftSchema>;

export type MaterialDetail = {
  // Effective (override-merged) view of the material. `baseMaterial` keeps the
  // pristine MM row alongside so the UI can render diff hints if needed.
  material: MmMaterialRow & {
    hasLocalEdit: boolean;
    override: MmMaterialOverrideRow | null;
    baseMaterial: MmMaterialRow;
  };
  bom: MmBomRow[];                       // MM imported BOM rows for this material
  bomDrafts: MmBomDraftRow[];            // local draft additions for this material
  costHistory: MmCostHistoryRow[];
  productsUsing: Array<{
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    isDraft: boolean;
  }>;
  totals: {
    bomVariantCount: number;
    draftVariantCount: number;
    totalQuantityUsed: number;
  };
};

export type ProductBomDetail = {
  variantId: string;
  productName: string;
  variantName: string;
  // imported rows already merged with local quantity/unit overrides AND with
  // removed flags applied. `originalQuantity` is the pristine MM value (for
  // bulletproof rollback). `isModifiedLocal` / `isRemovedLocal` drive the UI
  // badges. The unaltered MM mirror table is still the source of truth for
  // the round-trip export.
  imported: Array<MmBomRow & {
    isModifiedLocal: boolean;
    isRemovedLocal: boolean;
    originalQuantity: number;
    originalUnit?: string | null;
    overrideUnit?: string | null;
  }>;
  drafts: MmBomDraftRow[];
  totalCost: {
    imported: number;
    draftDelta: number;          // sum of drafts only (not synced to MM/Shopify)
    combined: number;
  };
};

// Local override of MM-imported material fields. Never touched by the MM CSV
// importer; never written into the pristine `material_manager_materials`
// mirror table. Round-trip export always reads from the pristine table.
export type MmMaterialOverrideRow = {
  materialId: string;
  name?: string | null;
  description?: string | null;
  measurement?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  supplier?: string | null;
  cost?: number | null;
  currencyCode?: string | null;
  updateShopifyInventory?: boolean | null;
  limitShopifyInventory?: boolean | null;
  materialsUsedInAllOrders?: string | null;
  stock?: number | null;
  note?: string | null;
  archived?: boolean;
  updatedAt: string;
};

// Local override of an MM-imported BOM row. Keyed by (variant_id, material_id)
// — the same primary key MM uses. Same pristine-table rule applies.
export type MmBomOverrideRow = {
  id: number;
  variantId: string;
  materialId: string;
  quantity?: number | null;
  unit?: string | null;
  // When true, the (variant, material) imported BOM row is *locally* removed.
  // The pristine MM row is preserved for rollback.
  removed: boolean;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const updateMaterialOverrideSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  measurement: z.string().max(40).optional().nullable(),
  sku: z.string().max(120).optional().nullable(),
  barcode: z.string().max(120).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  cost: z.number().min(0).max(1_000_000_000).optional().nullable(),
  currencyCode: z.string().max(8).optional().nullable(),
  updateShopifyInventory: z.boolean().optional().nullable(),
  limitShopifyInventory: z.boolean().optional().nullable(),
  materialsUsedInAllOrders: z.string().max(200).optional().nullable(),
  stock: z.number().min(0).max(1_000_000_000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  archived: z.boolean().optional().nullable(),
});
export type UpdateMaterialOverride = z.infer<typeof updateMaterialOverrideSchema>;

// New: payload for creating a from-scratch local material. Local materials are
// never round-tripped to the MM CSV export, so the rollback contract stays
// intact. They surface in the effective list, in cost dashes, and in PO line
// pickers.
export const createLocalMaterialSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  measurement: z.string().max(40).optional(),
  sku: z.string().max(120).optional(),
  barcode: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  supplier: z.string().max(200).optional(),
  cost: z.number().min(0).max(1_000_000_000).optional(),
  currencyCode: z.string().max(8).optional(),
  stock: z.number().min(0).max(1_000_000_000).optional(),
  updateShopifyInventory: z.boolean().optional(),
  limitShopifyInventory: z.boolean().optional(),
  // Inventory bucket override: 'noids' | 'insumos' | 'materials' | 'supplements'.
  // When provided, forces the bucket flags on the new material; when omitted,
  // flags fall back to category hints (the same logic as MM imports).
  bucket: z.enum(['noids', 'insumos', 'materials', 'supplements']).optional(),
  imageUrl: z.string().max(1000).optional(),
});
export type CreateLocalMaterial = z.infer<typeof createLocalMaterialSchema>;

// New: matcher suggestion for a historical PO line.
export type PoLineMatchSuggestion = {
  lineId: number;
  poNumber: string;
  product: string;
  sku: string;
  exactSkuMatch: { materialId: string; name: string; sku: string } | null;
  exactNameMatch: { materialId: string; name: string; sku: string } | null;
  fuzzySuggestions: Array<{ materialId: string; name: string; sku: string; score: number }>;
};

export const updateBomOverrideSchema = z.object({
  quantity: z.number().min(0).max(10_000).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  removed: z.boolean().optional(),
  note: z.string().max(500).optional().nullable(),
});
export type UpdateBomOverride = z.infer<typeof updateBomOverrideSchema>;

// Effective material row = pristine MM row merged with the local override (if
// any). `hasLocalEdit` drives the "Edit local · not synced" badge in the UI.
export type MmMaterialEffective = MmMaterialRow & {
  hasLocalEdit: boolean;
  override: MmMaterialOverrideRow | null;
  baseMaterial: MmMaterialRow;   // pristine MM row (for rollback display)
};

// ---------- Real Material Manager purchase orders (Phase 2.2) ----------
// Imported from the per-PO CSV files exported from Material Manager. The data
// here is the only source of truth for purchase orders in the UI — the legacy
// seed PO list under `seed.ts` is no longer rendered. PO10 is intentionally
// missing from the CSV set (cancelled) and is represented here with status
// `cancelled` so totals/stock are not affected but the gap is visible.
export type MmPoStatus = 'received' | 'cancelled' | 'draft';

export type MmPurchaseOrderLine = {
  id: number;
  purchaseOrderId: number;
  poNumber: string;
  product: string;
  sku: string;
  quantity: number;   // float — never rounded
  unitCost: number;
  taxPct: number;
  totalCop: number;
  lineIndex: number;
  // Phase 2.2 P0: link each line to the canonical Material Manager material so
  // receiving the PO updates the right stock + price. NULL = unmatched/legacy
  // CSV line (rendered with an "unmatched" badge in the UI).
  materialId?: string | null;
  // Optional batch/lot id captured at receive time. Schema is in place for the
  // upcoming production batch costing work — receive flow auto-generates one
  // when not supplied.
  batchId?: string | null;
};

export type MmPurchaseOrder = {
  id: number;
  poNumber: string;          // e.g. "PO1"
  date: string;              // ISO date
  supplier: string;
  shipTo: string;
  currency: string;
  referenceNumber: string | null;
  notes: string | null;
  subtotal: number;
  taxes: number;
  shipping: number;
  total: number;
  status: MmPoStatus;
  sourceFile: string | null;
  importedAt: string;
  lineCount: number;
  lines?: MmPurchaseOrderLine[];
};

export type MmPurchaseOrdersStatus = {
  totalPos: number;
  cancelledPos: number;
  receivedPos: number;
  draftPos?: number;
  totalAmount: number;       // sum of received POs only
  totalLines: number;
  suppliers: number;
  lastImportedAt: string | null;
};

// ---------- Inventory movements (Phase 2.2 P0) ----------
// Append-only ledger of stock changes triggered by receiving a purchase order.
// Each movement points back to its source PO/line so the receive flow is
// idempotent (cannot insert twice for the same line) and reversible by
// inserting a compensating negative-qty movement.
export type InventoryMovement = {
  id: number;
  materialKey: string;       // canonical MM material ID
  materialName: string;
  poId: number | null;
  poNumber: string | null;
  poLineId: number | null;
  qtyDelta: number;
  unitCostCop: number;
  date: string;              // ISO date (PO date or now())
  supplier: string;
  currency: string;
  fxRate: number | null;
  batchId: string | null;
  note: string | null;
  createdAt: string;
};

export type ReceivePoResult = {
  poNumber: string;
  status: MmPoStatus;
  movementsCreated: number;
  movementsSkipped: number;
  matchedLines: number;
  unmatchedLines: number;
};

// Cost breakdown dash row — one per material in a class/category bucket. Used
// to render Noids / Materials / Supplements / Insumos costos dashboards.
export type CostBreakdownRow = {
  materialId: string;
  material: string;
  category: string;
  bucket: 'noids' | 'materials' | 'supplements' | 'insumos' | 'uncategorized';
  unit: string;
  latestUnitCostCop: number;
  latestSource: 'po' | 'cost_history' | 'material' | 'none';
  latestSupplier: string;
  latestDate: string | null;
  latestPoNumber: string | null;
  currency: string;
  fxRate: number | null;
  stock: number;
};

export type CostBreakdownBucketSummary = {
  bucket: 'noids' | 'materials' | 'supplements' | 'insumos' | 'uncategorized';
  label: string;
  materialCount: number;
  totalInventoryValue: number;
  rows: CostBreakdownRow[];
};
