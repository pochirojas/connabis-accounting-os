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
  expenses: number;
  profit: number;
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
  gastos: number;
  utilidadNeta: number;
  margenEstimado: number;   // 0..1
  aov: number;
  ordenes: number;
  clientesRecurrentes: number;
  clientesRecurrentesPct: number;
  topProductFamily: string;
  alertasActivas: number;
  asOf: string;
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
  cogsSource: 'shopify' | 'fallback';
  marginSource: 'shopify' | 'material_manager' | 'seed';
  dataCompleteness: 'real' | 'partial' | 'placeholder';
  idealPrice: number;
  competitorPrice: number;
  maxProfitableDiscount: number;
  grossMargin: number;      // 0..1
  contributionMargin: number;  // 0..1
  alert: 'ok' | 'warn' | 'danger';
  alertReason?: string;
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
  currency?: 'COP' | 'USD';
  originalAmount?: number;
  fxRate?: number;
  source: 'shopify' | 'sheet' | 'manual';
};

export const insertExpenseSchema = z.object({
  date: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  paidTo: z.string().optional(),
  paidWith: z.string().optional(),
  currency: z.enum(['COP', 'USD']).default('COP'),
  originalAmount: z.number().positive().optional(),
  fxRate: z.number().positive().optional(),
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type DailyPerformance = {
  date: string;
  month: string;
  orders: number;
  revenue: number;
  expenses: number;
  profit: number;
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
