# Phase 1 QA — 2026

Última actualización: 2026-05-15

Este documento es la fuente única de verdad del estado de calidad de datos de Phase 1 en 2026. Si una pantalla del OS difiere de lo descrito aquí, gana este reporte.

## 1. Estado actual de la verdad de los datos

| Capa | Fuente oficial | Estado |
| --- | --- | --- |
| Ingresos / órdenes | Shopify (ShopifyQL `FROM sales SHOW total_sales, ... GROUP BY month`) | Real |
| Productos / variantes | Shopify Admin API | Real |
| COGS vendido | Material Manager CSV (BOM por variante) | Real con cobertura parcial — ver §4 |
| Gastos operativos | Sheet contable histórico + gastos manuales OS | Real, clasificado por `classifyExpense` |
| Compras inventario/capex | Mismas fuentes de gasto, segregadas vía clasificación explícita | Real, **excluidas** de gasto operativo, visibles aparte |
| Caja / cuentas | `cash_accounts` (manual) | Real (editable) |

Timezone operativo: `America/Bogota`. Fechas se convierten con `Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE })` antes de extraer mes/día.

## 2. Lógica de ingresos validada

- `/api/months?year=2026` y `/api/kpis` usan **ShopifyQL `total_sales`** como ingreso oficial del período. Es el mismo motor de Shopify Analytics; incluye ventas brutas, descuentos, returns/refunds atribuidos por Analytics, net sales y shipping cobrado al cliente.
- La lectura de órdenes (`loadLiveShopifyIncomeOrders`) sigue alimentando el detalle por línea/SKU para drilldown, BOM y `summarizeBomCoverage`, pero **no reemplaza** la cifra de ingresos.
- `summarizeMonths` ahora marca como `partial: true` el mes corriente usando `todayInReportTimeZone()` (timezone Bogotá) en lugar de UTC, evitando que durante las primeras 5 horas del día UTC un mes nuevo apareciera marcado como cerrado.
- Allocación por línea: `netRevenue = currentTotalPrice × (discountedTotalLine / Σ discountedTotalLines)`; si una orden no tiene base válida se reparte uniformemente. **Esto es solo para drilldowns**: el P&L oficial sigue siendo `total_sales` ShopifyQL.

### Reconciliación mes-a-mes 2026

La fuente de verdad es la API. Para reproducir:

```bash
npm run dev                 # otra terminal
tsx script/qa-reconcile-2026.ts   # imprime tabla mes-a-mes contra ShopifyQL
```

El script:
- Llama `/api/months?year=2026` (Shopify total_sales).
- Llama `/api/bom-coverage` (líneas vendidas con/sin BOM MM).
- Llama `/api/expenses` (clasificación operating/inventory/capex/uncategorized).
- Recalcula `utilidad_bruta = income − cogs` y `utilidad_neta = utilidad_bruta − expenses` y compara contra los campos devueltos por la API. Cualquier desviación >1 COP se imprime con `!`.

No se incluyen totales fijos aquí porque cambian cada vez que Shopify cierra un día. El script imprime la cifra real cuando lo corras.

## 3. P&L mensual — checks de consistencia

Definiciones validadas (ver `METRICS.md` y `server/routes.ts:summarizeMonths`):

```
ingreso_mes        = ShopifyQL total_sales del mes (mismo motor que Shopify Analytics)
cogs_mes           = Σ líneas vendidas del mes × costo BOM unitario MM
utilidad_bruta     = ingreso_mes − cogs_mes
gastos_operativos  = Σ gastos clasificados operating/uncategorized del mes
utilidad_neta      = utilidad_bruta − gastos_operativos
inv_capex_excluido = Σ gastos clasificados inventory/capex del mes (visibles aparte, NO en operativos)
```

Reglas que el código respeta (verificado en `splitOperatingAndInventoryExpenses` y `classifyExpense`):

1. Categoría explícita Capex/Equipment/Equipo/Activo fijo → `capex`.
2. Categoría explícita Inventario/Materials/Supplies/Insumos/Empaque/Hardware → `inventory`.
3. paidTo coincide con proveedor inventario/capex (`HAU`, `Floraplex`, `MC`, `Gilded Extracts`, `Amazon`, `Imprenta`, `Dashmile`) → `inventory` (o `capex` si la categoría lo sugiere).
4. Sin categoría / `.` / `-` / `Otros` / `Sin categoría` → `uncategorized` (cuenta en operativos pero alertado).
5. Fallback heurístico por keyword en texto libre.
6. Default → `operating`.

Compras de materiales/insumos quedan **visibles** en KPIs (`comprasInventarioExcluidas`) y en el campo `inventoryPurchasesExcluded` por mes en `/api/months`. **No** se suman al gasto operativo, evitando doble conteo contra el COGS vendido (que ya viene del consumo por línea vía BOM MM).

## 4. BOM coverage — auditoría 2026

`/api/bom-coverage` (handler `summarizeBomCoverage` en `server/routes.ts`) reporta:

- `totalSoldLines` — líneas vendidas con `qty > 0 && netRevenue !== 0`.
- `matchedSoldLines` — de las anteriores, las que matchean BOM por `variantId` (preferido) o por nombre de producto normalizado (`normalizeProductMatchKey`).
- `missingRevenue` y `missingUnits` — ingresos/unidades atribuidas a líneas sin BOM. Esto **no reduce** el ingreso oficial, pero **sí** subestima COGS (queda en 0 para esas líneas) y por tanto **sobreestima utilidad bruta y neta** hasta que se complete BOM en MM.
- `missingSkus[]` — listado de SKUs/productos sin match, con ingresos, unidades, líneas y órdenes afectadas.

Para extraer la lista exacta de SKUs problemáticos en 2026, correr `tsx script/qa-reconcile-2026.ts`. La sección "BOM coverage" lista hasta 20 productos sin match ordenados por ingresos.

Heurística de matching (`getBomUnitCostByVariantId`):

1. Match exacto por `Variant ID` legacy contra `bomByVariantId` (más confiable).
2. Si no, match exacto por nombre de producto normalizado contra `bomAverageCostByProductKey` (`normalizeProductMatchKey` aplica NFD, lowercase, sinónimos `cart→cartucho`, `cbd doble→cbdoble`, `thc-o→thco`, `blend→recarga`, `pxxx→pineapple xxx`).
3. Si no, match fuzzy por substring (`titleKey.includes(productKey) || productKey.includes(titleKey)`).
4. Si no, alias histórico explícito (`HISTORICAL_PRODUCT_ALIASES` en `server/routes.ts`) — sólo para títulos de Shopify vendidos en el pasado cuyo SKU ya no existe en el catálogo Shopify pero cuyo BOM real sí está cargado en MM bajo otro nombre. El alias **debe** resolver a un `Variant ID` MM específico (`kind: 'variant'`) o a un `unitCost` fijo confirmado por negocio (`kind: 'fixed'`). **Nunca** se permite aliasear a un nombre de producto MM cuyos variantes tengan tamaños/costos distintos, porque eso usaría el promedio multi-variante y sobreestimaría COGS.
5. Si nada matchea → `hasBom: false`, `unitCost: 0`, marcado como alerta. **Productos custom/personalizados (líneas custom de Shopify sin BOM definido) caen aquí intencionalmente**: NO se les asigna costo automático; quedan flagged como "pendiente costo manual" en `/api/alerts` (`real-missing-bom`) y en el `dataQualityNote` de los KPIs.

### Aliases históricos vigentes

Actualmente **no hay aliases activos** (lista vacía). Ver §5 "Auditoría 2026-05-15 — alias `Delta-8-THC-O Destilado` desactivado por tamaño ambiguo" para el caso histórico, su impacto medido y cómo re-activarlo correctamente.

Política de aliases (para evitar abuso del mecanismo):

- Sólo agregar aliases **confirmados por negocio** donde el producto físico es el mismo **y** la equivalencia es a un `Variant ID` específico o a un `unitCost` fijo. Nunca aliasear a un nombre de producto cuyos variantes difieran en tamaño/costo.
- Nunca usar el alias para forzar COGS sobre productos custom/personalizados o variantes nuevas — esos quedan en COGS 0 hasta cargar BOM real.
- Documentar fecha y fuente de la confirmación junto al alias.

Causas comunes de "missing" en el listado (priorizadas):

- **Variant ID nuevo en Shopify pero todavía no exportado a MM** → solución: re-exportar `material-manager-export-material-product.csv`.
- **Nombre de variante con `/` o sabor que no aparece en MM como variante separada** → fuzzy puede no matchear si el `Product name` MM es genérico. Revisar BOM por flavor en MM.
- **Producto nuevo sin BOM cargado todavía** → cargar BOM real, no inventar costo (regla `METRICS.md`).

No se inventan costos: una línea sin BOM queda en COGS 0 y aparece en `/api/alerts` (`real-missing-bom`).

## 5. Bugs encontrados y resueltos

### Resueltos en este commit

- `summarizeMonths` calculaba `partial` con `new Date().toISOString().slice(0, 7)` (UTC). Entre 00:00 y 05:00 UTC del primer día del mes, esto marcaba el mes recién comenzado como cerrado en Bogotá. Cambiado a `todayInReportTimeZone().slice(0, 7)`. Impacto: bajo, pero el flag `partial` se consume en la UI de meses; mejor que coincida con el resto del corte Bogotá.
- **Alias histórico `Delta-8-THC-O Destilado` → `THC-O Destilado en Jeringa`**: la línea histórica `Delta-8-THC-O Destilado` (~6.18M COP / 145 unidades vendidas en 2026, sin BOM hasta el commit `a851e4a`) no matcheaba con ningún producto MM por exact/fuzzy. Usuario confirmó (2026-05-15) que es el mismo producto que `THC-O Destilado en Jeringa` y que el SKU original ya no existe en Shopify. Agregado en `HISTORICAL_PRODUCT_ALIASES` (`server/routes.ts`) como paso 4 del matching (post-fuzzy). Resultado **inicial**: cobertura BOM 2026 subió de **91.3% → 97.5%** (1012/1038 líneas), ingresos sin COGS bajaron de **8.65M → 2.47M COP**, COGS vendido 2026 YTD subió ~950K COP. **Auditoría 2026-05-15 reveló que el alias estaba sobreestimando COGS** — ver §5 abajo. Hoy el alias está desactivado en código y la cobertura BOM 2026 vuelve a ~91.3%; los productos restantes sin BOM son legítimamente custom/personalizados (Carts + custom blend, Blend Hongos, tinturas one-off, etc.) además del `Delta-8-THC-O Destilado` histórico — todos quedan en COGS 0 pendientes de costo manual y aparecen en la alerta `real-missing-bom`. La alerta y el `dataQualityNote` dicen explícitamente que las líneas sin BOM incluyen productos custom y que **no se les asigna COGS automático**.

### Auditoría 2026-05-15 — alias `Delta-8-THC-O Destilado` desactivado por tamaño ambiguo

**Síntoma reportado por usuario**: tras el commit `a851e4a` la utilidad neta cayó ~4M COP en Dashboard (vista all-time). El commit reportaba un impacto esperado de ~950K COP en 2026 YTD; la magnitud real era mucho mayor a nivel all-time.

**Root cause**: el alias usaba `bomAverageCostByProductKey` (promedio no ponderado de todas las variantes MM del producto destino). El producto MM `THC-O Destilado en Jeringa` tiene cinco variantes con costos por unidad muy distintos:

| Variant ID | Tamaño | Costo unitario (COP) |
| --- | --- | --- |
| 42845811507277 | Jeringa 1ml | 13.474 |
| 42845811540045 | Jeringa 5ml | 65.613 |
| 42845811572813 | Jeringa 10ml | 131.665 |
| 42855131021389 | Tarro 5ml | 25.751 |
| 42855131086925 | Tarro 10ml | 41.800 |
| **Promedio** | — | **55.661** |

El alias aplicaba **55.661 COP/unidad** a todas las líneas históricas tituladas `Delta-8-THC-O Destilado`, sin manera de saber qué tamaño se vendió. Si la realidad histórica era 1ml, eso sobreestimaba COGS ~42K/unidad; en all-time (más años con esta SKU) el impacto medido vs `/api/kpis` pre-alias fue ~**8.35M COP** de COGS extra (utilidad neta ~-4M). En 2026 YTD el impacto medido fue ~**946K COP**.

**Decisión**: desactivar el alias hasta que negocio confirme el tamaño exacto o entregue un costo unitario. La estructura `HISTORICAL_PRODUCT_ALIASES` se rediseñó para forzar alias **inequívocos**:

```ts
type HistoricalAlias = {
  shopifyKey: string;
  target:
    | { kind: 'variant'; variantId: string; note: string }   // usa el costo BOM del variante MM exacto
    | { kind: 'fixed';   unitCost: number; note: string };   // usa un costo manual confirmado
};
```

Ya **no se permite** aliasear a un nombre de producto MM cuyos variantes tengan costos distintos (el alias `kind` requerido elimina esa opción tipo-safe). Cuando negocio confirme tamaño/costo del histórico `Delta-8-THC-O Destilado`, agregar una entrada nueva (ej.: `{ kind: 'variant', variantId: '42845811507277', note: '... confirmado YYYY-MM-DD' }` si fuera Jeringa 1ml).

**Antes/después medido (vista Dashboard all-time `/api/kpis` sin filtro)**:

| Métrica | Antes alias (esperado) | Con alias multi-variante (bug) | Después fix |
| --- | --- | --- | --- |
| COGS vendido | ~43.080.629 | ~51.431.214 | ~43.080.629 |
| Utilidad neta | ~6.513.135 | ~-1.217.230 | ~6.513.135 |

2026 YTD vuelve a COGS ~14.96M y utilidad neta ~7.35M (línea `Delta-8-THC-O Destilado` queda en COGS 0 y aparece en alerta hasta cargar costo real).

**Archivos cambiados**:

- `server/routes.ts`: `HISTORICAL_PRODUCT_ALIASES` rediseñado a `variant | fixed`, entrada Delta-8 retirada (queda como comentario con plantilla para re-activar). `getBomUnitCostByVariantId` ahora resuelve `variant` contra `bomByVariantId` (no contra el promedio).
- `PHASE1_QA_2026.md`: este reporte.

### Conocidos, NO resueltos en este round (requieren decisión de producto o cambio mayor)

- **Órdenes con `displayFinancialStatus === 'PARTIALLY_PAID'`**: `normalizePaymentStatus` las marca como `pending` y `orderInPeriod` las excluye. Sin embargo Shopify Analytics probablemente las incluya en `total_sales`. Resultado: ingreso oficial las cuenta, pero su COGS no se computa (BOM no se aplica). Mismo problema, en menor escala, para órdenes totalmente refunded en el mes (ShopifyQL las atribuye al mes de la venta original; `orderInPeriod` las excluye al ver `refunded`).
  - Impacto práctico: si existen, BOM coverage se ve correcta pero COGS subestimado → utilidad bruta sobreestimada. Mitigación actual: alertas BOM marcan estos casos solo si el variantId no aparece en órdenes incluidas. Decisión pendiente: ¿queremos incluir `partially_paid` y `partially_refunded` en accounting lines? METRICS.md hoy dice "se excluyen del detalle por líneas".

- **`/api/channels` y `/api/products` ignoran el filtro de período** (`loadLiveShopifyIncomeOrders()` sin args). Para Phase 1 esto es esperado (vista all-time); documentado aquí por completitud.

- **`buildRealSuggestions` invoca `summarizeMonths([], expenses)`** con cero órdenes, así que la sugerencia "${monthsSummary.length} meses tienen P&L calculado..." cuenta meses con gasto registrado, no meses con P&L real. Cosmético; se corrige cuando se rediseñen sugerencias en Phase 2.

- **Hard-coded year en `summarizeYears`**: el campo `projected` solo se calcula para year 2026. Cuando arranque 2027 hay que tocarlo. Fuera del scope de esta QA.

## 6. Cómo correr esta QA

Requisitos: `npm run dev` corriendo con las env vars de Shopify cargadas (mismas que usa la app — no se necesitan secrets nuevos).

```bash
# default: año 2026, API en localhost:5000
tsx script/qa-reconcile-2026.ts

# año arbitrario
tsx script/qa-reconcile-2026.ts 2025

# API en otra base
API_BASE=http://localhost:3000 tsx script/qa-reconcile-2026.ts
```

El script es read-only, no imprime tokens, no toca SQLite, no envía nada a Shopify.

## 7. Próximos fixes recomendados (orden sugerido)

1. **BOM coverage**: correr el script, llevar la lista `missingSkus` al CSV de MM y completar variantes/BOM. Repetir hasta `coverage >= 99%`. Esto es el lever #1 para que utilidad bruta refleje realidad.
2. Decidir tratamiento de `partially_paid` / `partially_refunded` en accounting lines y reflejarlo en `METRICS.md` + `orderInPeriod`. Sin decisión, mantener excluido.
3. Cuando Phase 2 reemplace Material Manager, mover la lógica de `getBomUnitCostByVariantId` a leer del módulo interno en lugar del CSV exportado, manteniendo la misma firma para no romper consumidores.
4. Phase 2: revisar `/api/channels`, `/api/products` para aceptar filtro de período y dejar de leer all-time.

Hasta entonces, los KPIs de ingresos/órdenes son confiables; COGS y utilidad bruta son confiables **dentro de la cobertura BOM**; gastos operativos son reales con clasificación explícita; inventario/capex permanecen visibles y excluidos del operativo.
