# Connabis Accounting OS — Definiciones de métricas

Última actualización: 2026-05-12

## Fuentes oficiales

- Shopify es la fuente oficial para órdenes, ingresos, productos activos, variantes, cantidades vendidas, descuentos, refunds y shipping cobrado al cliente.
- Material Manager es la fuente oficial para BOM y COGS por producto/variante. Cuando existe BOM en Material Manager, el costo se calcula desde sus componentes.
- Gastos reales vienen del histórico del sheet contable `Expenses` y de gastos manuales creados en la app.
- Seed/prototipo no debe mezclarse silenciosamente con métricas reales. Si una pantalla todavía usa seed, debe estar marcada como prototipo.

## Ingresos

### Ingreso bruto de productos

Suma de `originalTotalSet` de cada línea de orden Shopify.

No incluye shipping.

### Descuentos

Por línea:

`descuento = originalTotalSet - discountedTotalSet`

### Shipping cobrado

Shipping cobrado al cliente en Shopify, tomado desde `totalShippingPriceSet`.

Regla de Connabis: el shipping cobrado sí hace parte del ingreso neto porque es valor pagado por el usuario. El costo de recargar Skydropx se registra como gasto operativo cuando aparece en gastos reales.

### Refunds

Refunds tomados desde `totalRefundedSet` de la orden.

### Ingreso neto

Definición oficial usada por Dashboard y resúmenes mensuales:

`ingreso neto = productos descontados + shipping cobrado - refunds`

Equivalente:

`ingreso neto = suma(discountedTotalSet de líneas) + totalShippingPriceSet - totalRefundedSet`

Nota técnica: en vistas por línea, el shipping y los refunds de la orden se asignan a la primera línea de la orden para evitar duplicarlos. En totales por orden/mes, esto suma correctamente.

## COGS vendido

Fuente oficial: Material Manager.

Para cada línea de orden Shopify:

1. Se identifica la variante Shopify vendida.
2. Se toma el BOM de Material Manager asociado al `Variant ID`.
3. Si una orden histórica trae variante borrada/null o un `Variant ID` que no está en el export actual de MM, se intenta match por nombre de producto contra el BOM promedio de ese producto en Material Manager.
4. Se calcula el costo unitario como:

`costo unitario BOM = suma(cantidad de material usada × costo unitario del material)`

5. Se calcula COGS vendido de la línea:

`COGS vendido línea = cantidad vendida × costo unitario BOM`

6. Se suma por período:

`COGS vendido período = suma(COGS vendido línea)`

Supuestos actuales:

- Si una línea no tiene BOM asociado, su COGS vendido queda en 0 y debe tratarse como problema de calidad de datos.
- El Dashboard muestra la cobertura BOM de líneas vendidas. Si la cobertura es menor a 100%, COGS y utilidad neta son parciales y probablemente sobreestiman utilidad.
- El costo usado es el costo actual exportado desde Material Manager, no costo histórico por batch.
- No hay FIFO, promedio ponderado ni costo por lote en esta fase.

## Gastos operativos

Fuente oficial: sheet contable `Expenses` + gastos manuales.

Los gastos operativos son gastos reales del período que no corresponden a compra/capitalización de inventario.

Actualmente se excluyen de gasto operativo las filas que parecen compra de inventario o capital por categoría, descripción, proveedor o nota con palabras como:

- `Gilded Extracts`
- `Materials`
- `Microingredients`
- `Supplies`
- `Equipment`
- cartuchos, destilado, terpenos, insumos, materia prima, hardware, empaque, imprenta

Estas compras se muestran como `comprasInventarioExcluidas` y no se llevan a gasto directo del mes.

Pendiente: normalizar categorías del histórico para separar con más precisión gasto operativo, inventario y activos/capex.

## Utilidad y márgenes

### Utilidad bruta

`utilidad bruta = ingreso neto - COGS vendido`

### Margen bruto

`margen bruto = utilidad bruta / ingreso neto`

### Utilidad neta

`utilidad neta = utilidad bruta - gastos operativos reales`

### Margen neto

`margen neto = utilidad neta / ingreso neto`

## Dashboard actual

KPIs reales en Dashboard:

- Ingresos netos
- COGS vendido
- Utilidad bruta
- Gastos operativos
- Utilidad neta
- Órdenes
- AOV neto
- Compras de inventario/capital excluidas del gasto operativo

Elementos todavía prototipo/seed:

- Panel CEO secundario excepto caja editable.
- Alertas.
- Predicciones/restock.
- Inventario y compras.
- P&L financiero detallado.

## Pendientes de calidad de datos

- Validar timezone Shopify vs Colombia para fechas de órdenes.
- Normalizar categorías de gastos históricos.
- Definir exclusiones de órdenes Shopify: canceladas, test, pendientes o parcialmente refunded.
- Implementar COGS histórico por batch/lote en Phase 2.
- Implementar ingresos y COGS por SKU agrupando variantes según reglas de negocio.
