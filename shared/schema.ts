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

export type Product = {
  id: string;
  name: string;
  family: string;
  sku?: string;
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
};

export type Expense = {
  id: string;
  date: string;
  month: string;       // 'YYYY-MM'
  category: string;
  description: string;
  amount: number;
  source: 'shopify' | 'sheet' | 'manual';
};

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
