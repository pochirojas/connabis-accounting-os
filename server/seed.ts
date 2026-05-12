import type {
  Channel, MonthlyRow, YearSummary, DashboardKPIs,
  Product, MaterialCost, PurchaseOrder, Expense, Alert, IntegrationPhase,
  DailyPerformance, GlossaryTerm, CostBreakdownItem, AccountingSuggestion,
  IncomeDetail, RestockRecommendation, CeoMetric, PnlRow,
  CashFlowSnapshot, InventoryAccountingRow, CloseChecklistItem,
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

// ----- CEO daily control panel (seed until live Shopify + bank sync) -----
export const ceoMetrics: CeoMetric[] = [
  {
    id: 'cash',
    label: 'Caja disponible',
    value: 8_850_000,
    unit: 'COP',
    status: 'watch',
    subtitle: 'Seed: caja operativa estimada después de POs abiertas',
    action: 'No aprobar compras nuevas >1.5M sin revisar calendario de restock.',
  },
  {
    id: 'month-sales',
    label: 'Ventas del mes',
    value: 690_000,
    unit: 'COP',
    status: 'risk',
    subtitle: 'Mayo incompleto: ingresos reales deben venir de Shopify Orders',
    action: 'Sincronizar mayo antes de decidir pauta o compras.',
  },
  {
    id: 'month-profit',
    label: 'Utilidad mayo parcial',
    value: -314_370,
    unit: 'COP',
    status: 'risk',
    subtitle: 'No es utilidad all-time: es una lectura de mayo con ingresos incompletos',
    action: 'Cerrar mayo cargando ventas, fees, COGS y gastos reales antes de decidir.',
  },
  {
    id: 'gross-margin',
    label: 'Margen bruto SKU',
    value: 0.57,
    unit: 'pct',
    status: 'ok',
    subtitle: 'Promedio seed de catálogo activo cargado',
    action: 'Reemplazar con Shopify cost + BOM real antes de pricing.',
  },
  {
    id: 'critical-stock',
    label: 'Inventario crítico',
    value: 3,
    unit: 'count',
    status: 'watch',
    subtitle: 'Materiales en riesgo alto/crítico por días de cobertura',
    action: 'Comprar primero lo que evita ruptura sin descuadrar caja.',
  },
  {
    id: 'profit-product',
    label: 'Producto más rentable',
    value: 'Recarga D8 ULTRA',
    unit: 'text',
    status: 'ok',
    subtitle: 'Seed por margen de contribución, no por revenue',
    action: 'Usarlo para bundles y campañas de margen sano.',
  },
];

// ----- Top products (Shopify revenue all-time) -----
export const products: Product[] = [
  mkProduct({ id: 'p1', sku: 'REC-XXX-DIA', name: 'Recarga XXX en Jeringa Uso Diurno', family: 'Recargas en Jeringa', revenue: 11_905_325, unitPrice: 230_000, cogsShopify: 78_500, cogsFallback: 82_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000, cogsBreakdown: recargaBreakdown(78_500, 'XXX blend', 61_800), competitorPrice: 225_000 }),
  mkProduct({ id: 'p2', sku: 'REC-THCO-ULTRA-DIA', name: 'Recarga THCO ULTRA en Jeringa Uso Diurno', family: 'Recargas en Jeringa', revenue: 7_090_691, unitPrice: 245_000, cogsShopify: 92_000, cogsFallback: 95_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000, cogsBreakdown: recargaBreakdown(92_000, 'THCO Ultra blend', 73_400), competitorPrice: 250_000 }),
  mkProduct({ id: 'p3', sku: 'CART-225-XXX', name: 'Cartucho Reutilizable Cerámica 2.25mL XXX', family: 'Cartuchos', revenue: 4_781_949, unitPrice: 165_000, cogsShopify: null, cogsFallback: 64_500, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: cartBreakdown(64_500, 'XXX blend 2.25mL', 41_300, 6_356), competitorPrice: 170_000 }),
  mkProduct({ id: 'p4', sku: 'DISP-4ML-XXX', name: 'Desechable Cerámica 4mL XXX', family: 'Desechables', revenue: 4_125_309, unitPrice: 195_000, cogsShopify: 88_000, cogsFallback: 90_500, packaging: 3_800, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: disposableBreakdown(88_000, 'XXX blend 4mL', 55_900), competitorPrice: 205_000 }),
  mkProduct({ id: 'p5', sku: 'CART-1ML-XXX', name: 'Cartucho Reutilizable Cerámica 1mL XXX', family: 'Cartuchos', revenue: 3_813_973, unitPrice: 110_000, cogsShopify: 38_500, cogsFallback: 41_000, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: cartBreakdown(38_500, 'XXX blend 1mL', 22_800, 5_968), competitorPrice: 135_000 }),
  mkProduct({ id: 'p6', sku: 'DISP-4ML-THCO-ULTRA', name: 'Desechable Cerámica 4mL THCO ULTRA', family: 'Desechables', revenue: 3_019_573, unitPrice: 215_000, cogsShopify: 102_500, cogsFallback: 105_000, packaging: 3_800, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: disposableBreakdown(102_500, 'THCO Ultra blend 4mL', 70_400), competitorPrice: 225_000 }),
  mkProduct({ id: 'p7', sku: 'WELL-LION-MANE', name: 'Melena de León Orgánica', family: 'Hongos & Wellness', revenue: 2_643_248, unitPrice: 95_000, cogsShopify: null, cogsFallback: 38_000, packaging: 2_800, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: wellnessBreakdown(38_000, 'Melena de León orgánica', 27_500), competitorPrice: 90_000 }),
  mkProduct({ id: 'p8', sku: 'REC-THCO-MAX', name: 'Recarga THCO MAX en Jeringa', family: 'Recargas en Jeringa', revenue: 2_468_065, unitPrice: 260_000, cogsShopify: 98_000, cogsFallback: 100_000, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000, cogsBreakdown: recargaBreakdown(98_000, 'THCO Max blend', 78_100), competitorPrice: 270_000 }),
  mkProduct({ id: 'p9', sku: 'CART-225-THCO-ULTRA', name: 'Cartucho Reutilizable Cerámica 2.25mL THCO ULTRA', family: 'Cartuchos', revenue: 1_920_684, unitPrice: 175_000, cogsShopify: null, cogsFallback: 72_000, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: cartBreakdown(72_000, 'THCO Ultra blend 2.25mL', 48_800, 6_356), competitorPrice: 185_000 }),
  mkProduct({ id: 'p10', sku: 'REC-D8-ULTRA', name: 'Recarga D8 ULTRA en Jeringa', family: 'Recargas en Jeringa', revenue: 1_480_000, unitPrice: 210_000, cogsShopify: 62_000, cogsFallback: 64_500, packaging: 4_200, fees: 0.043, shippingSubsidy: 6_000, cogsBreakdown: recargaBreakdown(62_000, 'D8 Ultra blend', 46_100), competitorPrice: 215_000 }),
  mkProduct({ id: 'p11', sku: 'CART-1ML-HHC-MAX', name: 'Cartucho Reutilizable Cerámica 1mL HHC MAX', family: 'Cartuchos', revenue: 1_190_000, unitPrice: 130_000, cogsShopify: 44_000, cogsFallback: 46_000, packaging: 3_500, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: cartBreakdown(44_000, 'HHC Max blend 1mL', 27_900, 5_968), competitorPrice: 145_000 }),
  mkProduct({ id: 'p12', sku: 'WS-CBD', name: 'Water Soluble CBD', family: 'Water Soluble', revenue: 960_000, unitPrice: 85_000, cogsShopify: 27_500, cogsFallback: 29_000, packaging: 2_900, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: wellnessBreakdown(27_500, 'WS CBD', 18_600), competitorPrice: 88_000 }),
  mkProduct({ id: 'p13', sku: 'WS-HHC', name: 'Water Soluble HHC', family: 'Water Soluble', revenue: 820_000, unitPrice: 98_000, cogsShopify: 36_000, cogsFallback: 38_000, packaging: 2_900, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: wellnessBreakdown(36_000, 'WS HHC', 25_900), competitorPrice: 105_000 }),
  mkProduct({ id: 'p14', sku: 'WELL-REISHI', name: 'Ganoderma Reishi Rojo Orgánico', family: 'Hongos & Wellness', revenue: 760_000, unitPrice: 90_000, cogsShopify: 34_000, cogsFallback: 35_500, packaging: 2_800, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: wellnessBreakdown(34_000, 'Ganoderma/Reishi', 24_800), competitorPrice: 92_000 }),
  mkProduct({ id: 'p15', sku: 'GUMMY-DELTA', name: 'Gomitas cannabinoides edición piloto', family: 'Edibles', revenue: 540_000, unitPrice: 70_000, cogsShopify: null, cogsFallback: 31_000, packaging: 3_200, fees: 0.043, shippingSubsidy: 5_000, cogsBreakdown: wellnessBreakdown(31_000, 'Base gomita + cannabinoide', 21_300), competitorPrice: 75_000 }),
];

function recargaBreakdown(total: number, active: string, activeCost: number): CostBreakdownItem[] {
  return [
    { label: active, amount: activeCost, source: 'shopify', note: 'Costo del cannabinoide/blend desde variante Shopify o BOM sincronizado' },
    { label: 'Jeringa 1mL + tapa', amount: 2_900, source: 'bom' },
    { label: 'Terpenos / formulación', amount: Math.max(0, total - activeCost - 2_900 - 4_200 - 3_500), source: 'bom' },
    { label: 'Caja y etiqueta', amount: 4_200, source: 'bom' },
    { label: 'Producción y control', amount: 3_500, source: 'manual' },
  ];
}

function cartBreakdown(total: number, active: string, activeCost: number, hardware: number): CostBreakdownItem[] {
  return [
    { label: active, amount: activeCost, source: 'shopify' },
    { label: 'Hardware cerámico', amount: hardware, source: 'shopify', note: 'Último costo de inventario/hardware' },
    { label: 'Caja y etiqueta', amount: 3_500, source: 'bom' },
    { label: 'Ensamble, llenado y QA', amount: Math.max(0, total - activeCost - hardware - 3_500), source: 'manual' },
  ];
}

function disposableBreakdown(total: number, active: string, activeCost: number): CostBreakdownItem[] {
  return [
    { label: active, amount: activeCost, source: 'shopify' },
    { label: 'Desechable cerámico 4mL', amount: 23_273.81, source: 'shopify' },
    { label: 'Caja, etiqueta y sello', amount: 3_800, source: 'bom' },
    { label: 'Ensamble, carga y QA', amount: Math.max(0, total - activeCost - 23_273.81 - 3_800), source: 'manual' },
  ];
}

function wellnessBreakdown(total: number, active: string, activeCost: number): CostBreakdownItem[] {
  return [
    { label: active, amount: activeCost, source: 'shopify' },
    { label: 'Envase / empaque', amount: 2_800, source: 'bom' },
    { label: 'Etiqueta y lote', amount: 1_100, source: 'bom' },
    { label: 'Manipulación / preparación', amount: Math.max(0, total - activeCost - 2_800 - 1_100), source: 'manual' },
  ];
}

function mkProduct(p: Omit<Product, 'active' | 'unitsSold' | 'cogsUsed' | 'cogsSource' | 'marginSource' | 'dataCompleteness' | 'idealPrice' | 'maxProfitableDiscount' | 'grossMargin' | 'contributionMargin' | 'alert' | 'alertReason'>): Product {
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
  const minContributionMargin = 0.45;
  const idealPrice = Math.ceil(variableCost / (1 - minContributionMargin) / 1000) * 1000;
  const maxProfitableDiscount = Math.max(0, Math.min(0.6, 1 - (variableCost / (p.unitPrice * (1 - minContributionMargin)))));
  return {
    active: true,
    marginSource: cogsSource === 'shopify' ? 'shopify' : 'seed',
    dataCompleteness: 'placeholder',
    idealPrice,
    maxProfitableDiscount,
    ...p,
    unitsSold,
    cogsUsed,
    cogsSource,
    grossMargin,
    contributionMargin,
    alert,
    alertReason,
  };
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
// DEPRECATED (Phase 2.2): no longer served by any API. Real POs come from the
// MM purchase order CSVs imported by `material-manager-purchase-orders.ts`.
// Kept here only to avoid a structural change to seed.ts in this PR — nothing
// imports this constant.
const _deprecatedSeedPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po1', date: '2026-04-08', supplier: 'Noids Hardware MX', category: 'Cartuchos 2.25mL', qty: 200,
    unitCost: 6_356.26, shipping: 350_000, tax: 241_538, landedCost: 1_862_790, status: 'recibido',
    currency: 'COP', paymentMethod: 'Transferencia bancaria', expectedDate: '2026-04-17', receivedDate: '2026-04-18',
    notes: 'Seed basado en estructura Material Manager. En Phase 2 se copiarán estados, adjuntos e invoice real.',
    items: [
      { material: 'Cartucho Cerámico 2.25mL', sku: 'MAT-CART-225', category: 'hardware', qty: 200, unitCost: 6_356.26, subtotal: 1_271_252, expectedUse: 'Cartuchos reutilizables XXX / THCO 2.25mL' },
    ],
  },
  {
    id: 'po2', date: '2026-04-12', supplier: 'Noids Hardware MX', category: 'Desechables 4mL', qty: 120,
    unitCost: 23_273.81, shipping: 480_000, tax: 530_563, landedCost: 3_803_420, status: 'recibido',
    currency: 'COP', paymentMethod: 'Transferencia bancaria', expectedDate: '2026-04-22', receivedDate: '2026-04-23',
    notes: 'Hardware más sensible para margen; revisar mínimo rentable antes de campañas.',
    items: [
      { material: 'Desechable Cerámico 4mL', sku: 'MAT-DISP-4ML', category: 'hardware', qty: 120, unitCost: 23_273.81, subtotal: 2_792_857, expectedUse: 'Desechables XXX / THCO ULTRA' },
    ],
  },
  {
    id: 'po3', date: '2026-04-15', supplier: 'EU Distillates Ltd', category: 'THCO 100g', qty: 1,
    unitCost: 309_674, shipping: 220_000, tax: 60_335, landedCost: 590_009, status: 'recibido',
    currency: 'USD', paymentMethod: 'Wise / USD', expectedDate: '2026-04-26', receivedDate: '2026-04-28',
    notes: 'Registrar TRM y costo aterrizado por gramo para variant.cost.',
    items: [
      { material: 'Distilado THCO', sku: 'MAT-THCO-100G', category: 'distillate', qty: 100, unitCost: 3_096.74, subtotal: 309_674, expectedUse: 'Recargas THCO ULTRA / THCO MAX / cartuchos THCO' },
    ],
  },
  {
    id: 'po4', date: '2026-04-22', supplier: 'EU Distillates Ltd', category: 'HHC 250g', qty: 1,
    unitCost: 556_133, shipping: 220_000, tax: 90_341, landedCost: 866_474, status: 'recibido',
    currency: 'USD', paymentMethod: 'Wise / USD', expectedDate: '2026-05-03', receivedDate: '2026-05-04',
    notes: 'Compra grande que puede verse como gasto del mes si no se capitaliza a inventario.',
    items: [
      { material: 'Distilado HHC', sku: 'MAT-HHC-250G', category: 'distillate', qty: 250, unitCost: 2_224.53, subtotal: 556_133, expectedUse: 'HHC MAX y formulaciones base' },
    ],
  },
  {
    id: 'po5', date: '2026-05-02', supplier: 'Empaque & Etiqueta CO', category: 'Empaque jeringas', qty: 500,
    unitCost: 4_200, shipping: 60_000, tax: 199_500, landedCost: 2_359_500, status: 'en_transito',
    currency: 'COP', paymentMethod: 'Bancolombia débito', expectedDate: '2026-05-12',
    notes: 'Debe conectarse a BOM de recargas para que el costo por unidad suba automáticamente.',
    items: [
      { material: 'Caja + etiqueta jeringa', sku: 'MAT-PACK-SYR', category: 'packaging', qty: 500, unitCost: 4_200, subtotal: 2_100_000, expectedUse: 'Todas las recargas en jeringa' },
    ],
  },
  {
    id: 'po6', date: '2026-05-05', supplier: 'Noids Hardware MX', category: 'Cartuchos 1mL', qty: 250,
    unitCost: 5_968.28, shipping: 320_000, tax: 195_469, landedCost: 2_007_539, status: 'pendiente',
    currency: 'COP', paymentMethod: 'Pendiente aprobación', expectedDate: '2026-05-20',
    notes: 'Aprobar solo si forecast de ventas justifica caja y no descuadra cierre mensual.',
    items: [
      { material: 'Cartucho Cerámico 1mL', sku: 'MAT-CART-1ML', category: 'hardware', qty: 250, unitCost: 5_968.28, subtotal: 1_492_070, expectedUse: 'Cartuchos reutilizables 1mL activos' },
    ],
  },
];

// ----- Income detail (Shopify orders seed until Admin API sync) -----
export const incomeDetails: IncomeDetail[] = [
  { id: 'o1', orderName: '#CC-1841', date: '2026-04-20', month: '2026-04', channel: 'Online Store', customerType: 'recurrente', product: 'Recarga XXX en Jeringa Uso Diurno', sku: 'REC-XXX-DIA', qty: 2, grossRevenue: 460_000, discounts: 46_000, shipping: 12_000, refunds: 0, netRevenue: 426_000, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o2', orderName: '#CC-1846', date: '2026-04-20', month: '2026-04', channel: 'Draft Orders', customerType: 'vip', product: 'Cartucho Reutilizable Cerámica 2.25mL XXX', sku: 'CART-225-XXX', qty: 1, grossRevenue: 165_000, discounts: 0, shipping: 0, refunds: 0, netRevenue: 165_000, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o3', orderName: '#CC-1872', date: '2026-04-26', month: '2026-04', channel: 'Online Store', customerType: 'recurrente', product: 'Recarga THCO ULTRA en Jeringa Uso Diurno', sku: 'REC-THCO-ULTRA-DIA', qty: 3, grossRevenue: 735_000, discounts: 73_500, shipping: 12_000, refunds: 0, netRevenue: 673_500, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o4', orderName: '#CC-1888', date: '2026-04-29', month: '2026-04', channel: 'Online Store', customerType: 'nuevo', product: 'Recarga XXX en Jeringa Uso Diurno', sku: 'REC-XXX-DIA', qty: 3, grossRevenue: 690_000, discounts: 103_500, shipping: 12_000, refunds: 0, netRevenue: 598_500, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o5', orderName: '#CC-1894', date: '2026-04-30', month: '2026-04', channel: 'Shopify Mobile', customerType: 'recurrente', product: 'Desechable Cerámica 4mL THCO ULTRA', sku: 'DISP-4ML-THCO-ULTRA', qty: 3, grossRevenue: 645_000, discounts: 64_500, shipping: 0, refunds: 0, netRevenue: 580_500, paymentStatus: 'paid', fulfillmentStatus: 'partial' },
  { id: 'o6', orderName: '#CC-1902', date: '2026-05-03', month: '2026-05', channel: 'Online Store', customerType: 'nuevo', product: 'Water Soluble CBD', sku: 'WS-CBD', qty: 2, grossRevenue: 170_000, discounts: 0, shipping: 12_000, refunds: 0, netRevenue: 182_000, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o7', orderName: '#CC-1905', date: '2026-05-03', month: '2026-05', channel: 'Draft Orders', customerType: 'b2b', product: 'Recarga D8 ULTRA en Jeringa', sku: 'REC-D8-ULTRA', qty: 4, grossRevenue: 840_000, discounts: 126_000, shipping: 0, refunds: 0, netRevenue: 714_000, paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' },
  { id: 'o8', orderName: '#CC-1908', date: '2026-03-22', month: '2026-03', channel: 'Online Store', customerType: 'recurrente', product: 'Desechable Cerámica 4mL XXX', sku: 'DISP-4ML-XXX', qty: 3, grossRevenue: 585_000, discounts: 0, shipping: 12_000, refunds: 0, netRevenue: 597_000, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
  { id: 'o9', orderName: '#CC-1761', date: '2026-03-09', month: '2026-03', channel: 'Online Store', customerType: 'nuevo', product: 'Melena de León Orgánica', sku: 'WELL-LION-MANE', qty: 3, grossRevenue: 285_000, discounts: 28_500, shipping: 12_000, refunds: 0, netRevenue: 268_500, paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
];

// ----- Expenses (sample, sourced from sheet bridge) -----
export const expenses: Expense[] = [
  { id: 'e1',  date: '2026-04-08', month: '2026-04', category: 'Inventario', description: 'PO Cartuchos 2.25mL — Noids', amount: 1_862_790, paidTo: 'Noids Hardware MX', paidWith: 'Transferencia', currency: 'COP', source: 'sheet' },
  { id: 'e2',  date: '2026-04-12', month: '2026-04', category: 'Inventario', description: 'PO Desechables 4mL — Noids', amount: 3_803_420, paidTo: 'Noids Hardware MX', paidWith: 'Transferencia', currency: 'COP', source: 'sheet' },
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

// ----- Daily performance drilldown (seeded until Shopify live sync) -----
export const dailyPerformance: DailyPerformance[] = [
  { date: '2026-01-12', month: '2026-01', orders: 9, revenue: 1_120_000, expenses: 420_000, profit: 700_000, aov: 124_444, topProduct: 'Recarga XXX en Jeringa Uso Diurno', topProductRevenue: 460_000, topProductUnits: 2 },
  { date: '2026-01-23', month: '2026-01', orders: 11, revenue: 1_480_000, expenses: 380_000, profit: 1_100_000, aov: 134_545, topProduct: 'Recarga THCO ULTRA en Jeringa Uso Diurno', topProductRevenue: 490_000, topProductUnits: 2 },
  { date: '2026-02-05', month: '2026-02', orders: 14, revenue: 1_860_000, expenses: 510_000, profit: 1_350_000, aov: 132_857, topProduct: 'Cartucho Reutilizable Cerámica 1mL XXX', topProductRevenue: 440_000, topProductUnits: 4 },
  { date: '2026-02-18', month: '2026-02', orders: 18, revenue: 2_450_000, expenses: 620_000, profit: 1_830_000, aov: 136_111, topProduct: 'Recarga XXX en Jeringa Uso Diurno', topProductRevenue: 690_000, topProductUnits: 3 },
  { date: '2026-03-09', month: '2026-03', orders: 13, revenue: 1_540_000, expenses: 440_000, profit: 1_100_000, aov: 118_462, topProduct: 'Melena de León Orgánica', topProductRevenue: 285_000, topProductUnits: 3 },
  { date: '2026-03-22', month: '2026-03', orders: 16, revenue: 2_180_000, expenses: 730_000, profit: 1_450_000, aov: 136_250, topProduct: 'Desechable Cerámica 4mL XXX', topProductRevenue: 585_000, topProductUnits: 3 },
  { date: '2026-04-20', month: '2026-04', orders: 9, revenue: 1_320_000, expenses: 1_100_000, profit: 220_000, aov: 146_667, topProduct: 'Recarga XXX en Jeringa Uso Diurno', topProductRevenue: 460_000, topProductUnits: 2, note: '4/20: awareness alto, conversión moderada' },
  { date: '2026-04-26', month: '2026-04', orders: 12, revenue: 1_980_000, expenses: 1_360_000, profit: 620_000, aov: 165_000, topProduct: 'Recarga THCO ULTRA en Jeringa Uso Diurno', topProductRevenue: 735_000, topProductUnits: 3 },
  { date: '2026-04-29', month: '2026-04', orders: 13, revenue: 1_860_000, expenses: 940_000, profit: 920_000, aov: 143_077, topProduct: 'Recarga XXX en Jeringa Uso Diurno', topProductRevenue: 690_000, topProductUnits: 3, note: 'Urgencia por cierre de oferta' },
  { date: '2026-04-30', month: '2026-04', orders: 14, revenue: 1_970_000, expenses: 4_620_000, profit: -2_650_000, aov: 140_714, topProduct: 'Desechable Cerámica 4mL THCO ULTRA', topProductRevenue: 645_000, topProductUnits: 3, note: 'Mejor día comercial; pérdida contable por carga de gastos/POs' },
  { date: '2026-05-03', month: '2026-05', orders: 5, revenue: 690_000, expenses: 1_004_370, profit: -314_370, aov: 138_000, topProduct: 'Water Soluble CBD', topProductRevenue: 170_000, topProductUnits: 2, note: 'Ingresos de mayo aún no reconciliados en Sheet' },
];

// ----- Restock recommendations (seeded model for Phase 2 purchasing logic) -----
export const restockRecommendations: RestockRecommendation[] = [
  {
    id: 'rs1', material: 'Cartucho Cerámico 1mL', category: 'hardware', currentStock: 46, unit: 'unidades',
    avgDailyUsage: 4.8, daysOnHand: 9.6, leadTimeDays: 14, reorderPoint: 82, targetCoverDays: 45,
    recommendedQty: 175, estimatedUnitCost: 5_968.28, estimatedCost: 1_044_449, suggestedOrderDate: '2026-05-08',
    latestSafeOrderDate: '2026-05-10', monthCashImpact: 1_364_449, risk: 'crítico',
    balanceNote: 'Comprar antes del 10-may evita ruptura, pero conviene partir pago/anticipo si mayo sigue con ingresos incompletos.',
    productsImpacted: ['Cartucho Reutilizable Cerámica 1mL XXX', 'Cartucho Reutilizable Cerámica 1mL HHC MAX'],
  },
  {
    id: 'rs2', material: 'Caja + etiqueta jeringa', category: 'packaging', currentStock: 118, unit: 'sets',
    avgDailyUsage: 7.2, daysOnHand: 16.4, leadTimeDays: 8, reorderPoint: 88, targetCoverDays: 50,
    recommendedQty: 300, estimatedUnitCost: 4_200, estimatedCost: 1_260_000, suggestedOrderDate: '2026-05-13',
    latestSafeOrderDate: '2026-05-19', monthCashImpact: 1_320_000, risk: 'alto',
    balanceNote: 'Mejor comprar después de registrar ingresos reales de mayo; afecta todas las recargas.',
    productsImpacted: ['Recarga XXX', 'Recarga THCO ULTRA', 'Recarga THCO MAX', 'Recarga D8 ULTRA'],
  },
  {
    id: 'rs3', material: 'Distilado THCO', category: 'distillate', currentStock: 68, unit: 'gramos',
    avgDailyUsage: 3.1, daysOnHand: 21.9, leadTimeDays: 18, reorderPoint: 86, targetCoverDays: 60,
    recommendedQty: 120, estimatedUnitCost: 3_096.74, estimatedCost: 371_609, suggestedOrderDate: '2026-05-14',
    latestSafeOrderDate: '2026-05-17', monthCashImpact: 591_609, risk: 'alto',
    balanceNote: 'Costo unitario bajo frente a hardware, pero lead time largo; aprobar si THCO mantiene velocidad de abril.',
    productsImpacted: ['Recarga THCO ULTRA', 'Recarga THCO MAX', 'Desechable Cerámica 4mL THCO ULTRA'],
  },
  {
    id: 'rs4', material: 'Desechable Cerámico 4mL', category: 'hardware', currentStock: 72, unit: 'unidades',
    avgDailyUsage: 2.2, daysOnHand: 32.7, leadTimeDays: 15, reorderPoint: 55, targetCoverDays: 45,
    recommendedQty: 40, estimatedUnitCost: 23_273.81, estimatedCost: 930_952, suggestedOrderDate: '2026-05-24',
    latestSafeOrderDate: '2026-06-02', monthCashImpact: 1_250_952, risk: 'medio',
    balanceNote: 'No comprar antes de validar margen por SKU; es el hardware que más presiona descuento máximo rentable.',
    productsImpacted: ['Desechable Cerámica 4mL XXX', 'Desechable Cerámica 4mL THCO ULTRA'],
  },
  {
    id: 'rs5', material: 'Distilado HHC', category: 'distillate', currentStock: 142, unit: 'gramos',
    avgDailyUsage: 2.4, daysOnHand: 59.2, leadTimeDays: 18, reorderPoint: 73, targetCoverDays: 60,
    recommendedQty: 0, estimatedUnitCost: 2_224.53, estimatedCost: 0, suggestedOrderDate: '2026-06-18',
    latestSafeOrderDate: '2026-06-28', monthCashImpact: 0, risk: 'bajo',
    balanceNote: 'Stock sano; no inmovilizar caja en mayo salvo que una campaña HHC suba la velocidad diaria.',
    productsImpacted: ['Cartucho Reutilizable Cerámica 1mL HHC MAX'],
  },
  {
    id: 'rs6', material: 'Cartucho Cerámico 2.25mL', category: 'hardware', currentStock: 91, unit: 'unidades',
    avgDailyUsage: 2.9, daysOnHand: 31.4, leadTimeDays: 14, reorderPoint: 58, targetCoverDays: 45,
    recommendedQty: 50, estimatedUnitCost: 6_356.26, estimatedCost: 317_813, suggestedOrderDate: '2026-05-28',
    latestSafeOrderDate: '2026-06-05', monthCashImpact: 667_813, risk: 'medio',
    balanceNote: 'Puede esperar al cierre de mes si no hay campaña agresiva de cartuchos.',
    productsImpacted: ['Cartucho Reutilizable Cerámica 2.25mL XXX', 'Cartucho Reutilizable Cerámica 2.25mL THCO ULTRA'],
  },
];

// ----- CEO / contador financial control -----
export const pnlRows: PnlRow[] = [
  {
    month: '2026-01', label: 'Ene 2026', revenue: 6_128_490, refunds: 0, discounts: 380_000,
    netRevenue: 5_748_490, cogsRecognized: 2_410_000, grossProfit: 3_338_490, grossMargin: 0.581,
    operatingExpenses: 1_315_029, inventoryPurchases: 1_240_000, inventoryCapitalized: 1_240_000,
    netIncomeAccounting: 2_023_461, cashProfitNaive: 2_403_461,
    note: 'Mes sano; inventario comprado no debe mezclarse con gasto operativo.',
  },
  {
    month: '2026-02', label: 'Feb 2026', revenue: 8_410_795, refunds: 120_000, discounts: 510_000,
    netRevenue: 7_780_795, cogsRecognized: 2_950_000, grossProfit: 4_830_795, grossMargin: 0.621,
    operatingExpenses: 1_485_599, inventoryPurchases: 980_000, inventoryCapitalized: 980_000,
    netIncomeAccounting: 3_345_196, cashProfitNaive: 4_485_196,
    note: 'Buen margen; revisar si el AOV subió por mix o por descuentos controlados.',
  },
  {
    month: '2026-03', label: 'Mar 2026', revenue: 6_978_909, refunds: 0, discounts: 420_000,
    netRevenue: 6_558_909, cogsRecognized: 2_610_000, grossProfit: 3_948_909, grossMargin: 0.602,
    operatingExpenses: 1_599_417, inventoryPurchases: 1_120_000, inventoryCapitalized: 1_120_000,
    netIncomeAccounting: 2_349_492, cashProfitNaive: 2_769_492,
    note: 'Marzo queda rentable aun separando inventario; buen mes base para forecast.',
  },
  {
    month: '2026-04', label: 'Abr 2026', revenue: 11_704_507, refunds: 0, discounts: 930_000,
    netRevenue: 10_774_507, cogsRecognized: 4_215_000, grossProfit: 6_559_507, grossMargin: 0.609,
    operatingExpenses: 4_479_373, inventoryPurchases: 7_303_210, inventoryCapitalized: 7_303_210,
    netIncomeAccounting: 2_080_134, cashProfitNaive: -2_303_076,
    note: 'Abril parece pérdida si todo inventario se gasta; contablemente puede ser rentable si se capitaliza inventario.',
  },
  {
    month: '2026-05', label: 'May 2026', revenue: 690_000, refunds: 0, discounts: 126_000,
    netRevenue: 564_000, cogsRecognized: 226_000, grossProfit: 338_000, grossMargin: 0.599,
    operatingExpenses: 314_370, inventoryPurchases: 1_004_370, inventoryCapitalized: 1_004_370,
    netIncomeAccounting: 23_630, cashProfitNaive: -1_004_370,
    note: 'Mayo es parcial. No usar para decisión hasta traer ingresos Shopify completos.',
  },
];

export const cashFlowSnapshots: CashFlowSnapshot[] = [
  {
    id: 'cash-on-hand', label: 'Caja operativa estimada', amount: 8_850_000, status: 'watch',
    explanation: 'Caja seed después de compras abiertas. En versión real debe venir de bancos/pagos o input manual validado.',
  },
  {
    id: 'inventory-cash-locked', label: 'Caja inmovilizada en inventario', amount: 9_643_580, status: 'watch',
    explanation: 'Valor aproximado en inventario comprado que todavía no se ha reconocido como COGS.',
  },
  {
    id: 'open-restock-need', label: 'Restock recomendado 30 días', amount: 3_924_823, status: 'risk',
    explanation: 'Compras sugeridas para no romper stock; idealmente dividir por fecha y payout.',
  },
  {
    id: 'safe-spend', label: 'Gasto libre seguro', amount: 2_100_000, status: 'ok',
    explanation: 'Caja disponible estimada después de reservar inventario crítico, fees y operación básica.',
  },
];

export const inventoryAccountingRows: InventoryAccountingRow[] = [
  {
    id: 'ia1', month: '2026-04', purchaseOrder: 'PO1', material: 'Cartuchos 2.25mL',
    cashPaid: 1_862_790, capitalizedToInventory: 1_862_790, cogsRecognized: 381_000, remainingInventoryValue: 1_481_790,
    accountingTreatment: 'Capitalizar como inventario; reconocer costo por unidad cuando el cartucho se venda.',
  },
  {
    id: 'ia2', month: '2026-04', purchaseOrder: 'PO2', material: 'Desechables 4mL',
    cashPaid: 3_803_420, capitalizedToInventory: 3_803_420, cogsRecognized: 698_000, remainingInventoryValue: 3_105_420,
    accountingTreatment: 'No tratar el total como gasto de abril; el costo se libera contra ventas futuras.',
  },
  {
    id: 'ia3', month: '2026-04', purchaseOrder: 'PO3', material: 'THCO 100g',
    cashPaid: 590_009, capitalizedToInventory: 590_009, cogsRecognized: 186_000, remainingInventoryValue: 404_009,
    accountingTreatment: 'Costo aterrizado por gramo debe alimentar BOM y Shopify variant.cost.',
  },
  {
    id: 'ia4', month: '2026-04', purchaseOrder: 'PO4', material: 'HHC 250g',
    cashPaid: 866_474, capitalizedToInventory: 866_474, cogsRecognized: 112_000, remainingInventoryValue: 754_474,
    accountingTreatment: 'Compra grande; mantener como activo hasta consumo en producción/venta.',
  },
  {
    id: 'ia5', month: '2026-05', purchaseOrder: 'PO5', material: 'Empaque jeringas',
    cashPaid: 1_004_370, capitalizedToInventory: 1_004_370, cogsRecognized: 0, remainingInventoryValue: 1_004_370,
    accountingTreatment: 'Mientras no se venda producto terminado, el empaque sigue siendo inventario.',
  },
];

export const closeChecklist: CloseChecklistItem[] = [
  {
    id: 'cc1', area: 'shopify', task: 'Sincronizar órdenes del mes, refunds, descuentos, shipping y payouts',
    owner: 'CEO', dueTiming: 'Día 1 de cierre', status: 'pendiente',
    whyItMatters: 'Sin esto, ingresos y fees del mes quedan incompletos.',
  },
  {
    id: 'cc2', area: 'gastos', task: 'Cargar gastos manuales con fecha, proveedor, método de pago, moneda y soporte',
    owner: 'Operaciones', dueTiming: 'Antes del día 3', status: 'en_progreso',
    whyItMatters: 'Permite separar gasto real de compra de inventario.',
  },
  {
    id: 'cc3', area: 'inventario', task: 'Capitalizar compras de inventario y reconocer solo COGS vendido',
    owner: 'Contador', dueTiming: 'Antes del P&L final', status: 'pendiente',
    whyItMatters: 'Evita que meses con compras grandes parezcan pérdidas falsas.',
  },
  {
    id: 'cc4', area: 'reconciliacion', task: 'Conciliar Shopify total net sales vs depósitos/payouts y fees',
    owner: 'Contador', dueTiming: 'Día 4 de cierre', status: 'pendiente',
    whyItMatters: 'Detecta diferencias entre ventas, efectivo recibido, devoluciones y comisiones.',
  },
  {
    id: 'cc5', area: 'impuestos', task: 'Revisar retefuente, IVA/consumo si aplica, ICA y renta con contador',
    owner: 'Contador', dueTiming: 'Según calendario tributario', status: 'bloqueado',
    whyItMatters: 'Debe configurarse con RUT/actividad económica antes de automatizar alertas.',
  },
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
    phase: 1, status: 'completado',
    title: 'Phase 1: OS interno con métricas reales',
    bullets: [
      'Shopify es fuente oficial de ingresos, órdenes, line items, productos activos, variantes, SKU, refunds, descuentos y shipping cobrado.',
      'Material Manager es fuente oficial de BOM y COGS vendido por línea. Líneas sin BOM se alertan y no reciben costo inventado.',
      'Expenses sheet + gastos manuales son fuente oficial de gastos reales. Seed no se mezcla silenciosamente con contabilidad real.',
      'P&L mensual separa gasto operativo de compras de inventario/capex para no castigar el mes de compra.',
      'Exportación CSV de ingresos y gastos por mes/año/all-time para cierre y revisión con contador.',
    ],
    requiresCredentials: ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
  },
  {
    phase: 2, status: 'planificado',
    title: 'Phase 2: reemplazar Material Manager dentro del OS',
    bullets: [
      'Crear módulos internos de materiales, inventario, BOM, órdenes de compra, proveedores, costos aterrizados y consumo por producción.',
      'Copiar la lógica crítica de Material Manager antes de apagarlo: proporciones, stock, costo unitario, variantes afectadas y trazabilidad.',
      'Calculadora de blends/carts: ingresar proporciones por blend y cantidad objetivo para generar receta exacta por ingrediente, costo por lote y costo por unidad.',
      'Restock planner real con ventas por SKU, lead time, cash impact y calendario de compra sin desequilibrar caja.',
      'Batch costing/personalización: costear lotes reales, variaciones de receta y productos custom.',
    ],
  },
  {
    phase: 3, status: 'planificado',
    title: 'Phase 3: Dataico y capa fiscal/contable futura',
    bullets: [
      'Dataico queda explícitamente NO implementado en Phase 1 ni Phase 2.',
      'Evaluar facturación electrónica, impuestos, documentos soporte, conciliación bancaria y reportes fiscales con contador.',
      'Conectar Dataico solo después de que OS interno tenga productos, BOM, inventario y gastos consistentes.',
      'La integración fiscal no debe reescribir ventas, COGS o BOM: debe consumir el ledger limpio del OS.',
    ],
  },
];

// ----- Glossary / help center -----
export const glossaryTerms: GlossaryTerm[] = [
  {
    id: 'g1', category: 'finanzas', term: 'Ingreso bruto',
    short: 'Valor original de productos vendidos antes de descuentos, refunds y ajustes. Sirve para ver demanda comercial, no utilidad.',
    formula: 'Suma Shopify lineItems.originalTotalSet',
    connabisExample: 'Una orden puede tener 230K COP brutos de producto pero terminar menor si aplica descuento o refund.',
    action: 'Úsalo para analizar tracción y pricing, no para P&L final.',
    referenceLabel: 'Shopify reports',
    referenceUrl: 'https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports',
  },
  {
    id: 'g2', category: 'finanzas', term: 'Ingreso neto',
    short: 'Ingreso usado por el OS para KPIs y P&L. Incluye shipping cobrado porque el cliente lo paga y Skydropx se maneja como gasto aparte.',
    formula: 'Productos con descuento + shipping cobrado - refunds',
    connabisExample: 'Si Shopify muestra producto descontado por 180K, shipping 12K y refund 0, ingreso neto OS = 192K COP.',
    action: 'Este es el ingreso que debes usar para decisiones de negocio y comparación mensual.',
    referenceLabel: 'Shopify reports',
    referenceUrl: 'https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports',
  },
  {
    id: 'g3', category: 'margen', term: 'COGS',
    short: 'Costo directo de las unidades vendidas. En Phase 1 viene de BOM real de Material Manager, no de seed.',
    formula: 'Cantidad vendida × Σ(cantidad material BOM × costo unitario material)',
    connabisExample: 'Una recarga reconoce el costo de blend/cannabinoide, jeringa, empaque y materiales definidos en MM.',
    action: 'Si un SKU no tiene BOM, corrígelo en Material Manager antes de confiar en utilidad.',
    referenceLabel: 'Investopedia COGS',
    referenceUrl: 'https://www.investopedia.com/terms/c/cogs.asp',
  },
  {
    id: 'g4', category: 'margen', term: 'Margen bruto',
    short: 'Porcentaje que queda después de restar COGS vendido del ingreso neto.',
    formula: '(Ingreso neto - COGS vendido) / Ingreso neto',
    connabisExample: 'Si un período vendió 10M netos y COGS fue 4M, margen bruto = 60%.',
    action: 'Úsalo para decidir qué productos empujar y si un descuento todavía tiene espacio.',
    referenceLabel: 'Investopedia gross margin',
    referenceUrl: 'https://www.investopedia.com/terms/g/grossmargin.asp',
  },
  {
    id: 'g5', category: 'finanzas', term: 'Utilidad neta',
    short: 'Resultado después de ingreso neto, COGS vendido y gastos operativos reales del período.',
    formula: 'Ingreso neto - COGS vendido - gastos operativos',
    connabisExample: 'Las compras de inventario no se restan como gasto directo del mes; se reconocen como COGS cuando se vende producto.',
    action: 'Este número sirve para saber si el mes realmente ganó o perdió, siempre revisando cobertura BOM.',
    referenceLabel: 'Investopedia net income',
    referenceUrl: 'https://www.investopedia.com/terms/n/netincome.asp',
  },
  {
    id: 'g6', category: 'inventario', term: 'Inventario vs gasto',
    short: 'Compra de inventario es activo/capitalizado hasta que se vende. Gasto operativo se consume en el período.',
    formula: 'Inventario comprado ≠ gasto operativo; COGS se reconoce al vender',
    connabisExample: 'Comprar cartuchos o destilado en abril no debe destruir abril completo; el costo sale contra ventas futuras.',
    action: 'Clasifica compras de materiales como inventario/capex y no como gasto operativo.',
    referenceLabel: 'Investopedia FIFO',
    referenceUrl: 'https://www.investopedia.com/terms/f/fifo.asp',
  },
  {
    id: 'g7', category: 'inventario', term: 'Batch costing',
    short: 'Costear un lote específico según receta, cantidades reales, mermas y costo de materiales usados. Es concepto futuro de Phase 2.',
    formula: 'Costo lote / unidades producidas = costo unitario real',
    connabisExample: 'Un blend de 100 unidades puede tener costo distinto si cambia proporción de terpenos, cannabinoide o merma.',
    action: 'Phase 2 debe convertir recetas/blends en BOM, consumo de inventario y costo por unidad.',
    referenceLabel: 'Investopedia process costing',
    referenceUrl: 'https://www.investopedia.com/terms/p/process-costing.asp',
  },
  {
    id: 'g8', category: 'shopify', term: 'AOV',
    short: 'Ticket promedio por orden.',
    formula: 'Ingreso neto / número de órdenes',
    connabisExample: 'Abril subió el AOV porque la oferta empujó más cantidad por compra, no solo rebaja de precio.',
    action: 'Súbelo con bundles y kits; no con descuentos que maten margen.',
  },
  {
    id: 'g9', category: 'crecimiento', term: 'Precio mínimo rentable',
    short: 'Precio más bajo que puedes cobrar sin romper el margen objetivo.',
    formula: '(COGS + costos variables) / (1 - margen objetivo)',
    connabisExample: 'Si quieres 45% de contribución, el descuento máximo depende del COGS real de ese SKU.',
    action: 'Crea reglas para bloquear descuentos en SKUs con margen delicado.',
  },
  {
    id: 'g10', category: 'shopify', term: 'Draft Orders',
    short: 'Órdenes creadas manualmente, usualmente WhatsApp, VIP o B2B.',
    formula: 'Ingresos de Draft Orders / ingresos totales',
    connabisExample: 'Si Draft Orders crece, puede indicar canal B2B/VIP que conviene formalizar.',
    action: 'Formaliza catálogo VIP/B2B con precios y reglas de margen.',
  },
];

// ----- Phase 2 accounting intelligence -----
export const accountingSuggestions: AccountingSuggestion[] = [
  {
    id: 'as1',
    type: 'analisis',
    priority: 'alta',
    phase: 1,
    title: 'Data actual incompleta por diseño',
    description: 'Este MVP todavía no está sincronizado con todos los productos activos de Shopify ni con Material Manager. Los precios y márgenes son placeholders para probar UI y flujo.',
    whyItMatters: 'Evita tomar decisiones de precio o descuento usando números provisionales.',
    suggestedAction: 'Conectar Shopify active products, variant cost y el dataset de Material Manager antes de usar márgenes como fuente operativa.',
  },
  {
    id: 'as2',
    type: 'sugerencia',
    priority: 'alta',
    phase: 1,
    title: 'Sincronizar solo productos activos',
    description: 'Productos & Márgenes debe traer únicamente productos activos de Shopify para que el tablero refleje lo que realmente se puede vender hoy.',
    whyItMatters: 'Productos archivados, draft o inactivos distorsionan margen, inventario y pricing.',
    suggestedAction: 'Filtrar Shopify Products por status ACTIVE y mapear variant.cost, price, SKU y inventory item.',
  },
  {
    id: 'as3',
    type: 'prediccion',
    priority: 'media',
    phase: 2,
    title: 'Forecast de utilidad mensual',
    description: 'Cuando entren órdenes y gastos diarios, el sistema podrá proyectar utilidad de cierre mensual con base en run-rate real.',
    whyItMatters: 'Permite frenar gastos o ajustar campañas antes de cerrar el mes en pérdida.',
    suggestedAction: 'Crear forecast: ventas promedio diario x días restantes menos gastos fijos/variables esperados.',
  },
  {
    id: 'as4',
    type: 'recordatorio',
    priority: 'alta',
    phase: 2,
    title: 'Recordatorios tributarios Colombia',
    description: 'Añadir calendario para retefuente, IVA/consumo si aplica, declaración de renta, industria y comercio, pagos a proveedores y cierres mensuales.',
    whyItMatters: 'Los recordatorios reducen multas, intereses y cierres contables incompletos.',
    suggestedAction: 'Configurar fechas según RUT/actividad económica y validarlas con contador antes de automatizar alertas.',
  },
  {
    id: 'as5',
    type: 'sugerencia',
    priority: 'media',
    phase: 2,
    title: 'Reemplazo gradual de Material Manager',
    description: 'Inventario y órdenes de compra deberían copiar exactamente la lógica de Material Manager antes de reemplazarlo.',
    whyItMatters: 'Material Manager ya contiene el modelo mental correcto para insumos, producción, compras y costos.',
    suggestedAction: 'Phase 2: clonar vistas, campos, cálculos y estados de MM; después migrar datos y apagar duplicados.',
  },
  {
    id: 'as6',
    type: 'sugerencia',
    priority: 'alta',
    phase: 2,
    title: 'Calculadora de blends y carts',
    description: 'Ingresar proporciones de cada blend/cannabinoide/terpeno y una cantidad objetivo para calcular receta total, gramos o ml por ingrediente, costo del lote y costo por cart/recarga.',
    whyItMatters: 'Evita errores de producción, permite cotizar antes de producir y alimenta el BOM, el inventario de materiales y el costo Shopify de cada producto terminado.',
    suggestedAction: 'Phase 2: replicar la calculadora de carts del Sheet original y conectarla a materiales, costos aterrizados, inventario y productos terminados.',
  },
];
