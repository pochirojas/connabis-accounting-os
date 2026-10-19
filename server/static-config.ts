import type { CloseChecklistItem, GlossaryTerm, IntegrationPhase } from '@shared/schema';


// Static configuration only. All demo/prototype numbers were removed in the
// stage-0 cleanup — the app never shows invented figures as real data.

export const closeChecklist: CloseChecklistItem[] = [
  {
    id: 'cc1', area: 'gastos', task: 'Vaciar la cola "Por revisar": cada gasto con monto, marca, cuenta y soporte',
    owner: 'Operaciones', dueTiming: 'Días 1-3', status: 'pendiente',
    whyItMatters: 'Los gastos sin revisar no entran al P&L ni a Dataico.',
  },
  {
    id: 'cc2', area: 'gastos', task: 'Emitir documento soporte en Dataico para compras a no obligados a facturar',
    owner: 'Operaciones', dueTiming: 'Días 1-3', status: 'pendiente',
    whyItMatters: 'Sin documento soporte el gasto normalmente no es deducible en renta.',
  },
  {
    id: 'cc3', area: 'reconciliacion', task: 'Conciliar cada cuenta (Nequi, Nu, Daviplata, Nequi Wompi, Bancolombia) contra su extracto y actualizar saldos',
    owner: 'CEO', dueTiming: 'Día 4', status: 'pendiente',
    whyItMatters: 'Cada movimiento debe tener un gasto, una venta o una explicación (traslado entre cuentas, aporte de socio).',
  },
  {
    id: 'cc4', area: 'shopify', task: 'Comparar ventas Shopify vs facturas Dataico vs desembolsos Wompi',
    owner: 'CEO', dueTiming: 'Día 4', status: 'pendiente',
    whyItMatters: 'Detecta ventas sin factura, devoluciones y comisiones no registradas.',
  },
  {
    id: 'cc5', area: 'impuestos', task: 'Registrar retenciones que nos practicaron (Wompi / Mercado Pago)',
    owner: 'Operaciones', dueTiming: 'Día 5', status: 'pendiente',
    whyItMatters: 'Son un anticipo que se descuenta en la declaración de renta.',
  },
  {
    id: 'cc6', area: 'impuestos', task: '¿Practicamos retención en la fuente este mes? Si sí: formulario 350 y pago',
    owner: 'Contador', dueTiming: 'Según calendario DIAN', status: 'pendiente',
    whyItMatters: 'Responsabilidad 07 del RUT. Si no hubo retenciones en el mes, normalmente no se presenta (confirmar con contador).',
  },
  {
    id: 'cc7', area: 'inventario', task: 'Revisar compras de inventario vs COGS reconocido (Material Manager)',
    owner: 'CEO', dueTiming: 'Día 5', status: 'pendiente',
    whyItMatters: 'Evita que meses con compras grandes parezcan pérdidas falsas.',
  },
  {
    id: 'cc8', area: 'reconciliacion', task: 'Descargar respaldo de la base de datos y cerrar el mes',
    owner: 'CEO', dueTiming: 'Día 5', status: 'pendiente',
    whyItMatters: 'Deja una foto inmutable del mes para el contador.',
  },
];

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
