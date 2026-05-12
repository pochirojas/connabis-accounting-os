# Connabis Accounting OS — METRICS

Última actualización: 2026-05-12

## Fuentes oficiales

- Shopify es la fuente oficial para órdenes, ventas totales, productos activos, variantes, SKUs, cantidades vendidas, descuentos, refunds y shipping cobrado al cliente.
- Material Manager es la fuente oficial para BOM, proporciones de materiales, costo unitario por material y COGS por producto/variante.
- Gastos reales vienen del histórico del sheet contable `Expenses` y de gastos manuales creados en la app.
- Seed/prototipo no debe mezclarse silenciosamente con métricas reales. Si una pantalla todavía usa seed, debe estar marcada como `seed`, `prototipo` o `Phase 2 model`.

## Ingresos

### Base oficial: ventas totales Shopify

Connabis usa siempre `ventas totales` de Shopify como base de ingresos. En KPIs, P&L mensual/anual y performance diaria, el backend consulta ShopifyQL `FROM sales SHOW ... total_sales`, que es el mismo motor de Analytics de Shopify.

Regla práctica:

`ingreso base período = ShopifyQL total_sales del período`

Esto incluye lo que Shopify Analytics considera ventas totales del período: ventas brutas, descuentos, returns/refunds registrados por Analytics, net sales y shipping cobrado. El timezone operativo del OS para cortes diarios es `America/Bogota`.

### Asignación por línea/SKU

Para poder calcular margen por producto/SKU, COGS y drilldowns de órdenes, el OS sigue leyendo órdenes y líneas del Admin API. En esos detalles, la venta total de cada orden se asigna a sus líneas proporcionalmente al valor descontado de cada línea:

`ingreso línea = currentTotalPriceSet orden × (discountedTotalSet línea / suma(discountedTotalSet líneas de la orden))`

Si una orden no tiene base de líneas usable, se reparte en partes iguales entre líneas.

Importante: el P&L usa ShopifyQL `total_sales` como total oficial del período. Los drilldowns por producto/línea son explicativos y pueden no sumar exactamente al total oficial cuando Shopify Analytics registra returns/refunds en una fecha distinta a la fecha de creación de la orden.

### Campos informativos

- `ingreso bruto productos`: suma de `originalTotalSet` de líneas.
- `descuentos`: `originalTotalSet - discountedTotalSet`.
- `shipping cobrado`: `totalShippingPriceSet`.
- `refunds`: `totalRefundedSet`.

Estos campos ayudan a explicar diferencias, pero el KPI principal de ingresos usa ventas totales Shopify.

## Órdenes incluidas y excluidas

Incluidas:

- Órdenes Shopify con fecha operacional Colombia (`createdAt` convertido a `America/Bogota`) dentro del período seleccionado.
- Líneas de orden con cantidad vendida.
- Órdenes con estado financiero reconocido como venta pagada o parcialmente ajustada.

Exclusiones/pendientes:

- Órdenes `pending` o `refunded` se excluyen del detalle por líneas.
- Órdenes `test` y órdenes canceladas se excluyen del detalle por líneas.
- Para totales oficiales de ingreso, prevalece ShopifyQL `total_sales`, no la suma manual de órdenes.
- Refunds/returns se tratan según Shopify Analytics. Esto corrige casos donde un refund de una orden anterior cae dentro del período actual.

## COGS vendido

Fuente oficial: Material Manager.

Para cada línea de orden Shopify:

1. Se identifica la variante vendida por `variantId`, SKU o nombre normalizado.
2. Se busca el BOM correspondiente en Material Manager.
3. Se calcula costo unitario BOM:

`costo unitario BOM = suma(cantidad componente × costo unitario material)`

4. Se calcula COGS vendido de la línea:

`COGS vendido línea = cantidad vendida × costo unitario BOM`

5. Se suma por período:

`COGS vendido período = suma(COGS vendido línea)`

Supuestos Phase 1:

- Si una línea vendida no tiene BOM, su COGS queda en 0 y se marca como alerta de datos.
- La cobertura BOM se mide como líneas vendidas con costo real dividido por líneas vendidas totales.
- El costo usado viene del export actual de Material Manager, no de costo histórico por lote.
- No hay FIFO, promedio ponderado ni batch costing histórico en Phase 1.

## Gastos operativos

Fuente oficial: sheet `Expenses` + gastos manuales OS.

Clasificación:

- `operating`: gasto real del período que reduce utilidad neta.
- `inventory`: compra de inventario/materiales; no se lleva como gasto directo mensual.
- `capex`: compra de activos/equipos; no se lleva como gasto operativo mensual.
- `uncategorized`: gasto real sin categoría clara; se incluye conservadoramente en gasto operativo y se alerta.

Regla:

`gastos operativos período = operating + uncategorized`

`compras inventario/capex excluidas = inventory + capex`

Proveedores que se tratan como inventario/capex para evitar doble conteo con COGS vendido:

- HAU
- Floraplex
- MC
- Gilded Extracts
- Amazon
- Imprenta

Si un gasto de esos proveedores corresponde claramente a equipo/activo, se clasifica como `capex`; de lo contrario se clasifica como `inventory`.

Regla anti doble conteo:

- Las compras de materiales/insumos se mantienen visibles en `Compras de inventario / Capex`.
- Esas compras no entran en `gastos operativos`.
- El costo de venta del P&L viene solo de `COGS vendido` calculado desde BOM/MM por línea vendida.
- Esto evita contar el mismo material dos veces: primero como compra del mes y luego como COGS cuando se vende el producto.

## Utilidad y márgenes

### Utilidad bruta

`utilidad bruta = ventas totales Shopify - COGS vendido MM`

### Margen bruto

`margen bruto = utilidad bruta / ventas totales Shopify`

### Utilidad neta

`utilidad neta = utilidad bruta - gastos operativos reales`

### Margen neto

`margen neto = utilidad neta / ventas totales Shopify`

## Caja operativa

Cuentas Phase 1:

- Nequi
- Nu débito
- Nu crédito
- Mercado Pago liberado
- Mercado Pago no liberado
- Efectivo/Otro cuando aplique

Cuando se agrega un gasto manual:

- Si se paga con cuenta de activo, el balance baja.
- Si se paga con Nu crédito, sube la deuda de tarjeta.
- Si se borra un gasto manual, se revierte el efecto de caja.

## KPIs confiables en Phase 1

- Ventas totales por período desde Shopify.
- Órdenes y AOV basado en ventas totales.
- COGS vendido para líneas con BOM en Material Manager.
- Cobertura BOM y lista de SKUs/líneas sin costo.
- Gastos operativos reales clasificados.
- Utilidad bruta y neta con advertencia cuando BOM coverage sea menor a 100%.
- Unidades e ingresos por SKU cuando hay match Shopify ↔ MM/SKU.

## Elementos todavía prototipo/Phase 2

- Inventario y órdenes de compra como reemplazo completo de Material Manager.
- Restock planner automático basado en inventario de materiales, lead times y calendario de compras.
- Batch costing histórico, FIFO/promedio ponderado y trazabilidad por lote.
- Calculadora de blends/carts integrada.
- Dataico, facturación/fiscal y declaraciones automáticas: Phase 3, no implementado.
