import type {
  Channel, MonthlyRow, YearSummary, DashboardKPIs,
  Product, MaterialCost, PurchaseOrder, Expense, Alert, IntegrationPhase,
} from '@shared/schema';

// ----- Channel split (Shopify) -----
export const channels: Channel[] = [
  { name: 'Online Store', share: 0.815, revenue: 76_697_417, orders: 540 },
  { name: 'Draft Orders', share: 0.146, revenue: 13_739_660, orders: 97 },
  { name: 'Shopify Mobile', share: 0.039, revenue: 3_670_184, orders: 26 },
];

// ----- Yearly summaries -----
export const years: YearSummary[] = [
  { year: 2024, orders: 83,  revenue:  9_800_000,  aov: 118_072 },
  { year: 2025, orders: 345, revenue: 57_100_000,  aov: 165_507 },
  { year: 2026, orders: 235, revenue: 36_900_000,  aov: 157_021, projected: 96_500_000, note: 'YTD a mayo' },
];

// ----- Monthly accounting (from updated sheet) -----
export const months: MonthlyRow[] = [
  { month: '2026-01', label: 'Ene 2026', income:  6_128_490, expenses:  3_725_029, profit:  2_403_461 },
  { month: '2026-02', label: 'Feb 2026', income:  8_410_795, expenses:  3_925_599, profit:  4_485_196 },
  { month: '2026-03', label: 'Mar 2026', income:  6_978_909, expenses:  4_209_417, profit:  2_769_492 },
  { month: '2026-04', label: 'Abr 2026', income: 11_704_507, expenses: 14_007_583, profit: -2_303_076, note: 'Récord en ventas, pérdida contable por timing de compras' },
  { month: '2026-05', label: 'May 2026', income:          0, expenses:  1_004_370, profit: -1_004_370, partial: true, note: 'Ingresos parciales / no cargados aún' },
];

// ----- Dashboard KPIs (all-time, gold standard = Shopify) -----
export const kpis: DashboardKPIs = {
  ingresos: 94_107_261,
  gastos: 92_090_654,
  utilidadNeta: 2_016_607,
  margenEstimado: 0.0214,
  aov: 130_328,
  ordenes: 663,
  clientesRecurrentes: 91,        // estimate — replaced by Shopify customer report later
  clientesRecurrentesPct: 0.198,
  topProductFamily: 'Recargas en Jeringa',
  alertasActivas: 5,
  asOf: '2026-05-07',
};

// ----- Top products (Shopify revenue all-time) -----
export const products: Product[] = [
  mkProduct({ id: 'p1', name: 'Recarga XXX en Jeringa Uso Diurno', family: 'Recargas en Jeringa', revenue: 11_905_325, unitPrice: 230_000, cogsShopify: 78_500, cogsFallback: 82_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000 }),
  mkProduct({ id: 'p2', name: 'Recarga THCO ULTRA en Jeringa Uso Diurno', family: 'Recargas en Jeringa', revenue: 7_090_691, unitPrice: 245_000, cogsShopify: 92_000, cogsFallback: 95_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000 }),
  mkProduct({ id: 'p3', name: 'Cartucho Reutilizable Cerámica 2.25mL XXX', family: 'Cartuchos', revenue: 4_781_949, unitPrice: 165_000, cogsShopify: null, cogsFallback: 64_500, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000 }),
  mkProduct({ id: 'p4', name: 'Desechable Cerámica 4mL XXX', family: 'Desechables', revenue: 4_125_309, unitPrice: 195_000, cogsShopify: 88_000, cogsFallback: 90_500, packaging: 3_800, fees: 0.043, shippingSubsidy: 5_000 }),
  mkProduct({ id: 'p5', name: 'Cartucho Reutilizable Cerámica 1mL XXX', family: 'Cartuchos', revenue: 3_813_973, unitPrice: 110_000, cogsShopify: 38_500, cogsFallback: 41_000, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000 }),
  mkProduct({ id: 'p6', name: 'Desechable Cerámica 4mL THCO ULTRA', family: 'Desechables', revenue: 3_019_573, unitPrice: 215_000, cogsShopify: 102_500, cogsFallback: 105_000, packaging: 3_800, fees: 0.043, shippingSubsidy: 5_000 }),
  mkProduct({ id: 'p7', name: 'Melena de León Orgánica', family: 'Hongos & Wellness', revenue: 2_643_248, unitPrice: 95_000, cogsShopify: null, cogsFallback: 38_000, packaging: 2_800, fees: 0.043, shippingSubsidy: 5_000 }),
  mkProduct({ id: 'p8', name: 'Recarga THCO MAX en Jeringa', family: 'Recargas en Jeringa', revenue: 2_468_065, unitPrice: 260_000, cogsShopify: 98_000, cogsFallback: 100_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000 }),
  mkProduct({ id: 'p9', name: 'Cartucho Reutilizable Cerámica 2.25mL THCO ULTRA', family: 'Cartuchos', revenue: 1_920_684, unitPrice: 175_000, cogsShopify: null, cogsFallback: 72_000, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000 }),
];

function mkProduct(p: Omit<Product, 'unitsSold' | 'cogsUsed' | 'cogsSource' | 'grossMargin' | 'contributionMargin' | 'alert' | 'alertReason'>): Product {
  const unitsSold = Math.max(1, Math.round(p.revenue / p.unitPrice));
  const cogsSource: 'shopify' | 'fallback' = p.cogsShopify == null ? 'fallback' : 'shopify';
  const cogsUsed = cogsSource === 'shopify' ? (p.cogsShopify as number) : p.cogsFallback;
  const feesAmt = p.unitPrice * p.fees;
  const variableCost = cogsUsed + p.packaging + feesAmt + p.shippingSubsidy;
  const grossMargin = (p.unitPrice - cogsUsed) / p.unitPrice;
  const contributionMargin = (p.unitPrice - variableCost) / p.unitPrice;
  let alert: Product['alert'] = 'ok';
  let alertReason: string | undefined;
  if (cogsSource === 'fallback') { alert = 'warn'; alertReason = 'Costo Shopify ausente — usando estimación'; }
  if (contributionMargin < 0.30) { alert = 'warn'; alertReason = 'Margen de contribución por debajo de 30%'; }
  if (contributionMargin < 0.10) { alert = 'danger'; alertReason = 'Margen crítico — riesgo con descuentos'; }
  return { ...p, unitsSold, cogsUsed, cogsSource, grossMargin, contributionMargin, alert, alertReason };
}

// ----- Material cost insights (Noids Costo Dash) -----
export const materials: MaterialCost[] = [
  { id: 'm1', name: 'Cartucho Cerámico 1mL',     unit: 'unidad', lastCost:  5_968.28, category: 'hardware',   source: 'Noids Costo Dash' },
  { id: 'm2', name: 'Cartucho Cerámico 2.25mL',  unit: 'unidad', lastCost:  6_356.26, category: 'hardware',   source: 'Noids Costo Dash' },
  { id: 'm3', name: 'Desechable Cerámico 4mL',   unit: 'unidad', lastCost: 23_273.81, category: 'hardware',   source: 'Noids Costo Dash' },
  { id: 'm4', name: 'Distilado HHC',             unit: 'gramo',  lastCost:  2_224.53, category: 'distillate', source: 'Noids Costo Dash' },
  { id: 'm5', name: 'Distilado THCO',            unit: 'gramo',  lastCost:  3_096.74, category: 'distillate', source: 'Noids Costo Dash' },
  { id: 'm6', name: 'Distilado D8',              unit: 'gramo',  lastCost:  1_617.70, category: 'distillate', source: 'Noids Costo Dash' },
];

// ----- Purchase orders -----
export const purchaseOrders: PurchaseOrder[] = [
  { id: 'po1', date: '2026-04-08', supplier: 'Noids Hardware MX',     category: 'Cartuchos 2.25mL',  qty: 200, unitCost: 6_356.26, shipping: 350_000, tax: 241_538, landedCost: 1_862_790, status: 'recibido' },
  { id: 'po2', date: '2026-04-12', supplier: 'Noids Hardware MX',     category: 'Desechables 4mL',   qty: 120, unitCost: 23_273.81, shipping: 480_000, tax: 530_563, landedCost: 3_803_420, status: 'recibido' },
  { id: 'po3', date: '2026-04-15', supplier: 'EU Distillates Ltd',    category: 'THCO 100g',         qty: 1,   unitCost: 309_674,   shipping: 220_000, tax:  60_335, landedCost:    590_009, status: 'recibido' },
  { id: 'po4', date: '2026-04-22', supplier: 'EU Distillates Ltd',    category: 'HHC 250g',          qty: 1,   unitCost: 556_133,   shipping: 220_000, tax:  90_341, landedCost:    866_474, status: 'recibido' },
  { id: 'po5', date: '2026-05-02', supplier: 'Empaque & Etiqueta CO', category: 'Empaque jeringas',  qty: 500, unitCost: 4_200,     shipping:  60_000, tax: 199_500, landedCost:  2_359_500, status: 'en_transito' },
  { id: 'po6', date: '2026-05-05', supplier: 'Noids Hardware MX',     category: 'Cartuchos 1mL',     qty: 250, unitCost: 5_968.28,  shipping: 320_000, tax: 195_469, landedCost:  2_007_539, status: 'pendiente' },
];

// ----- Expenses (sample, sourced from sheet bridge) -----
export const expenses: Expense[] = [
  { id: 'e1',  date: '2026-04-08', month: '2026-04', category: 'Inventario', description: 'PO Cartuchos 2.25mL — Noids', amount: 1_862_790, source: 'sheet' },
  { id: 'e2',  date: '2026-04-12', month: '2026-04', category: 'Inventario', description: 'PO Desechables 4mL — Noids', amount: 3_803_420, source: 'sheet' },
  { id: 'e3',  date: '2026-04-15', month: '2026-04', category: 'Inventario', description: 'PO THCO 100g — EU Distillates', amount:   590_009, source: 'sheet' },
  { id: 'e4',  date: '2026-04-22', month: '2026-04', category: 'Inventario', description: 'PO HHC 250g — EU Distillates', amount:    866_474, source: 'sheet' },
  { id: 'e5',  date: '2026-04-30', month: '2026-04', category: 'Marketing',  description: 'Meta Ads abril', amount: 1_450_000, source: 'sheet' },
  { id: 'e6',  date: '2026-04-30', month: '2026-04', category: 'Logística',  description: 'Domicilios + envíos abril', amount:   980_500, source: 'shopify' },
  { id: 'e7',  date: '2026-04-30', month: '2026-04', category: 'Comisiones', description: 'Shopify Payments fees abril', amount:   503_000, source: 'shopify' },
  { id: 'e8',  date: '2026-04-30', month: '2026-04', category: 'Operación',  description: 'Servicios y software', amount: 3_951_390, source: 'sheet' },
  { id: 'e9',  date: '2026-05-02', month: '2026-05', category: 'Inventario', description: 'PO Empaque', amount:  1_004_370, source: 'sheet' },
  { id: 'e10', date: '2026-03-30', month: '2026-03', category: 'Marketing',  description: 'Meta Ads marzo', amount:    920_000, source: 'sheet' },
  { id: 'e11', date: '2026-03-30', month: '2026-03', category: 'Logística',  description: 'Envíos marzo', amount:    640_000, source: 'shopify' },
  { id: 'e12', date: '2026-03-31', month: '2026-03', category: 'Operación',  description: 'Operación marzo', amount: 2_649_417, source: 'sheet' },
];

// ----- Alerts -----
export const alerts: Alert[] = [
  {
    id: 'a1', level: 'critical', area: 'gastos',
    title: 'Abril: récord en ventas pero pérdida contable',
    description: 'Ingresos abril 11.7M COP vs gastos 14.0M COP. Pérdida de 2.3M por concentración de compras de inventario y marketing en el mes.',
    recommendation: 'Capitalizar inventario abril (no contar como gasto del período) y prorratear costo unitario contra futuras ventas.',
  },
  {
    id: 'a2', level: 'warn', area: 'ingresos',
    title: 'Mayo: ingresos parciales / sin cargar',
    description: 'Mayo 2026 muestra 0 COP de ingresos en contabilidad mientras Shopify ya registra órdenes. Falta sincronización.',
    recommendation: 'Sincronizar Shopify orders del mes en curso antes del cierre mensual.',
  },
  {
    id: 'a3', level: 'warn', area: 'sistema',
    title: 'Reconciliar Shopify vs dashboard contable',
    description: 'Ingresos all-time Shopify 94.107.261 COP vs ingresos sheet 94.107.261 COP — coinciden, pero gastos solo registran 92.090.654 (utilidad 2.016.607). Fees y devoluciones de Shopify no están aislados como categoría.',
    recommendation: 'Crear cuentas separadas: Shopify Fees, Shopify Refunds, Shipping Subsidy.',
  },
  {
    id: 'a4', level: 'critical', area: 'productos',
    title: 'Riesgo de margen negativo si se aplican descuentos',
    description: '3 SKUs muestran margen de contribución < 30% sin descuentos. Con 20%+ off pueden volverse negativos.',
    recommendation: 'Bloquear descuentos automáticos en SKUs con CM < 35%. Revisar precios de cartuchos sin costo Shopify.',
  },
  {
    id: 'a5', level: 'info', area: 'ingresos',
    title: 'Draft Orders 14.6% — formalizar B2B/VIP',
    description: 'El 14.6% de los ingresos viene por Draft Orders (manuales). Indica canal mayorista o VIP no formalizado.',
    recommendation: 'Crear segmento B2B/VIP en Shopify con precios y descuentos controlados.',
  },
];

// ----- Integration phases -----
export const integrationPhases: IntegrationPhase[] = [
  {
    phase: 1, status: 'en_progreso',
    title: 'Sincronizar Shopify (gold standard) + bridge temporal de Sheet',
    bullets: [
      'Conectar Shopify Admin API: pedidos, productos, variantes, inventario y campos de costo (variant.cost).',
      'Webhooks: orders/create, orders/updated, products/update, inventory_levels/update.',
      'Importar costos de variantes desde Shopify; usar fallback solo si el campo cost está vacío.',
      'Importar gastos históricos del Google Sheet como puente temporal — solo lo que aún no vive en Shopify.',
      'Mapear Shopify Payments fees, refunds y shipping a categorías de gasto separadas.',
    ],
    requiresCredentials: ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ADMIN_API_TOKEN', 'SHOPIFY_API_VERSION'],
  },
  {
    phase: 2, status: 'planificado',
    title: 'Persistencia y modelo de datos',
    bullets: [
      'SQLite/Postgres con tablas: orders, products, variants, expenses, purchase_orders, materials.',
      'Job de reconciliación diaria Shopify ↔︎ contabilidad.',
      'UI de edición y override por SKU (cuando el costo Shopify no es confiable).',
    ],
  },
  {
    phase: 3, status: 'planificado',
    title: 'Motor de márgenes y alertas',
    bullets: [
      'Cálculo de margen bruto y de contribución por SKU con costos Shopify en vivo.',
      'Reglas de alerta: descuento + CM mínimo, costo desactualizado > 60 días, ruptura de stock.',
      'Reportes: P&L mensual, margen por familia de producto, AOV por canal, recurrencia de clientes.',
    ],
  },
  {
    phase: 4, status: 'planificado',
    title: 'App embebida en Shopify Admin (estilo Material Manager)',
    bullets: [
      'Shopify App Bridge + OAuth flow (custom app o public listing).',
      'Embed en Admin con Polaris para sentirse nativo.',
      'Deprecar dashboard standalone una vez validado.',
    ],
    requiresCredentials: ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_APP_URL'],
  },
];
