# Phase 2 — Reemplazo controlado de Material Manager

> **Overlay de prioridad (2026-05-20)** · ver `ROADMAP.md` § *Modelo de prioridades*.
>
> - **P0** dentro de Phase 2: core MM replacement — crear/editar materiales locales, PO receiving → stock movements, adjustment history real, batch costing / landed cost básico, promote drafts.
> - **P1** dentro de Phase 2: Phase 2.6 Terpene Rotation Manager y Phase 2.2 catálogo metaobject. **No abrir scope nuevo en terpenos hasta cerrar el core P0.** Mantener lo ya entregado en producción y resolver bugs si aparecen.
> - **P2** dentro de Phase 2: paridad UI total (drag/drop, atajos, micro-UX), test-store embedded Shopify app, inventory sync write a Shopify.
>
> Las sub-fases históricas (Phase 2.1 .. Phase 2.6) describen el linaje de código; el overlay decide en qué orden se trabaja a partir de ahora.

Phase 2 reemplaza **Material Manager dentro del OS**, no Dataico. Dataico es Phase 3 separada (con su propia P0 foundation que avanza en paralelo). Phase 2 no sincroniza ni escribe inventario en Shopify al inicio: el objetivo es replicar Material Manager dentro de Connabis Accounting OS, validar que los números coinciden, y solo después activar sincronización en modo preview.

Principio operativo: el cambio debe ser reversible. El OS debe poder importar y exportar exactamente los mismos formatos CSV que Material Manager para que, si algo falla, se pueda volver a Material Manager sin downtime ni pérdida de inventario.

## Estado actual (2026-05-13)

Lo que ya está en código y vivo:

- Phase 2.1 — mirror read-only completo (materiales, BOM, historial de costos, QA round-trip, export bit-exact).
- Phase 2.1.1 — capa de overrides locales para materiales y filas BOM + drafts BOM, todo aislado del rollback CSV.
- Phase 2.2 — POs reales importadas desde CSV MM, quantities float-strict, PO10 cancelada manejada.
- Phase 2.3 — Calculadora de Carts con MM live + seed fallback etiquetado.
- Phase 2.4 — Análisis de gastos, packaging Jeringa 1mL, BOM agrupado por producto base.
- Phase 2.5 — POs orden cronológico, gastos paidTo fallback, detalle de material totalmente editable como override.

Lo que falta para cerrar Phase 2 (mantener sincronizado con `ROADMAP.md`):

- **Paridad UI total con Material Manager**: interacciones, atajos, edición inline, micro-UX. Hoy hay paridad funcional parcial.
- **Crear materiales nuevos dentro del OS**: hoy solo se edita lo que viene del mirror MM. El flujo "+ Nuevo material" con ID local estable y sync opt-in a MM no existe.
- **Detalle de material completo**: campos secundarios MM (multi-ubicación, lead time por proveedor, alias, equivalencias de unidad, adjuntos) aún no cubiertos.
- **BOM editor robusto (draft/edit)**: vista combinada MM ∪ overrides ∪ drafts, validaciones cruzadas, búsqueda dentro del modal, batch edit multi-variante, undo por fila, promoción controlada.
- **UI QA**: pasada lado a lado con MM de Inventario, detalle de material y editor BOM.
- **Terpene Rotation Manager** (ver sección dedicada más abajo): bloqueante para considerar el switch desde MM como seamless.

## Draft BOM overlay (Phase 2.1+)

Para permitir edición de BOM dentro del OS sin contaminar el rollback bit-exact contra MM, los cambios locales viven en una tabla aparte llamada `material_manager_bom_drafts`:

- La tabla MM `material_manager_bom_components` es siempre la fuente de verdad importada desde el CSV de MM. Nunca se muta desde la UI; sólo se reemplaza al ejecutar `Import / Rebuild Mirror`.
- Cualquier edición de BOM en el OS (añadir material a una variante, ajustar cantidad, etc.) se guarda en `material_manager_bom_drafts` (UNIQUE por `variant_id + material_id`).
- El export CSV (`/api/material-manager/export/bom.csv` y `materials.csv`) NO incluye drafts. Esto preserva el round-trip exact contra MM y garantiza el rollback de emergencia.
- La UI etiqueta los drafts con un badge ámbar **Draft OS BOM · no sincronizado**.
- Phase 2.2 añadirá: `Export drafts preview` (CSV separado), promoción de draft → MM mediante stage en tienda Shopify de pruebas, y vista combinada MM ∪ drafts para cálculo de COGS preview.

### Endpoints draft

- `GET /api/material-manager/materials/:id` — detalle de material (MM info + productos que lo usan + drafts + cost history).
- `GET /api/material-manager/variants/:variantId/bom` — BOM por variante (filas MM + drafts + cost rollup `imported / draftDelta / combined`).
- `GET /api/material-manager/bom-drafts` (con filtros `materialId`/`variantId`), `POST` para crear/upsert, `PATCH /:id`, `DELETE /:id`.

## Consolidación de navegación

A partir de Phase 2.1 el sidebar tiene **un solo módulo** `Inventario & Materiales` para no fragmentar la mental model. Las rutas `/inventario` y `/material-manager` apuntan al mismo componente, así que cualquier enlace antiguo (`/inventario`) sigue funcionando. La página usa tabs internos: Materiales, BOM/Productos, Órdenes de compra (legacy), Calculadora de Carts, Admin/QA/Costos. El detalle por material replica el layout vertical de la vista nativa de Material Manager (info principal + 4 cards a la derecha: Inventario, Procurement, Materials sold trend, Notificaciones).

## Calculadora de Carts (Phase 2.3)

Tab `Calculadora de Carts` portada desde la hoja `Calculadora Carts` de `Contabilidad-Connabis-Pro-1.xlsx`. El objetivo: replicar el cálculo de costo por blend/cart que el equipo usa hoy en Excel, sin pedirle al usuario que mantenga la hoja en paralelo.

### Datos seed (extraídos visibles de la hoja)

- **13 recetas (% por ingrediente)** del bloque `PORCENTAJES RECETA` (cells N19:O… en adelante): Pineapple X / XX / XXX, CB DOBLE, HHC MAX / ULTRA, THCO MAX / ULTRA / REPLACE, D8 MAX / ULTRA, XTREME, CRD REPLACE.
- **Costos por mL** (`PRECIOS INSUMOS / ML of each`, A19:B23 + D19:D25): THC-O, HHC, D8-THC, CBD, Terpenos, THC-P/H/HHC-P/H4CBD/CBG/THCO REPLACE/CRD REPLACE.
- **Packaging**: Cart 1mL / 2.25mL / Desechable 4mL / 5mL con sus costos unitarios + Clear Bubble Bag (toggle on/off).

### Fórmula

```
needed_ml(ing)   = ratio(ing) × number_of_carts × ml_per_cart
ingredient_cost  = needed_ml × cost_per_ml(ing)
blend_cost       = Σ ingredient_cost
packaging_cost   = (cart_unit_cost + (bag_cost si toggle on)) × number_of_carts
total_cost       = blend_cost + packaging_cost
cost_per_cart    = total_cost / number_of_carts
revenue / profit = sale_price × carts ; profit = revenue − total_cost
margin           = profit / revenue
```

### Endpoint

`GET /api/material-manager/cart-calculator` → `{ recipes, packaging, bagCost }`. Para cada ingrediente la respuesta incluye:

- `seedCostPerMl` — valor congelado de la hoja contable.
- `effectiveCostPerMl` — valor que la UI usa; viene del MM mirror cuando hay match case-insensitive por nombre con un material en `material_manager_materials`, o vuelve al seed si no.
- `costSource: 'mm' | 'sheet'` y `mmMaterialId`/`mmMaterialName` para auditar la fuente fila a fila.

Asunción importante: tratamos `cost` del MM mirror como costo-por-mL para los ingredientes que matchean (la hoja también mezcla unidades). Si en el futuro queremos diferenciar costos por gramo vs mL, se añade un campo de conversión por material en una migración separada. Por ahora la UI siempre etiqueta la fuente para que el usuario vea cuál ingrediente sigue en seed-sheet vs MM live. Quantities siempre float (`step="any"`, `formatQty`); no se redondea por carts ni por mL.

## Fuentes actuales

- `material-manager-export.csv`: catálogo actual de materiales, unidad de medida, proveedor, costo actual, flags de inventario Shopify y stock por ubicación.
- `material-manager-export-material-product.csv`: BOM actual de Material Manager. Relaciona `Material ID`, `Variant ID` y `Quantity of material used`.
- `Contabilidad-Connabis-Pro-1.xlsx / Noids Costos`: historial de compras y costos unitarios para cannabinoides, destilados, terpenos y carts.
- `Contabilidad-Connabis-Pro-1.xlsx / Supplement Costos`: historial de compras y costos unitarios para suplementos.
- `Contabilidad-Connabis-Pro-1.xlsx / Materials Costos`: historial de compras y costos unitarios para empaques y materiales consumibles.
- `Contabilidad-Connabis-Pro-1.xlsx / Insumos Costos `: historial de herramientas/equipos/insumos operativos. Estos no deben tratarse automáticamente como COGS vendido si no son materiales del BOM.

Nota importante: las hojas históricas de costos no tienen un campo formal de proveedor. Cuando el proveedor no exista como columna, el sistema debe dejar `supplier` como `unknown` o inferido únicamente para visualización desde la descripción, pero no debe tratar esa inferencia como dato contable oficial.

## Hojas dashboard de costos

- `Noids Costo Dash`: resumen por material de costo promedio, último costo, costo final total, impuestos y envío.
- `Supplement Costos Dash`: resumen por suplemento de costo promedio, último costo, costo final total, impuestos y envío.
- `Materials Costos Dash`: resumen por material/empaque de costo promedio, último costo, costo final total, impuestos y envío.

Las hojas `Dash` son útiles para QA visual, pero el importador debe leer preferiblemente las hojas base porque contienen fecha, descripción de orden, moneda, TRM, shipping, impuestos, descuentos, cantidad y costo unitario histórico.

## Modelo de datos propuesto

### `materials`

Catálogo maestro de materiales.

- `id`
- `external_mm_id`
- `name`
- `normalized_name`
- `category`: `noid`, `supplement`, `packaging`, `tooling`, `other`
- `measurement_unit`
- `sku`
- `barcode`
- `current_supplier`
- `current_unit_cost_cop`
- `shopify_inventory_item_id`
- `track_shopify_inventory`
- `limit_shopify_inventory`
- `active`

### `material_cost_history`

Historial oficial de costo por material y fecha.

- `id`
- `material_id`
- `effective_date`
- `source_sheet`
- `source_order_description`
- `supplier`
- `currency`
- `fx_rate`
- `quantity`
- `raw_unit_cost`
- `unit_cost_cop`
- `shipping_allocated_cop`
- `tax_allocated_cop`
- `discount_allocated_cop`
- `final_unit_cost_cop`
- `notes`

Regla: para una misma combinación `material_id + effective_date`, debe existir un solo proveedor y un solo precio oficial. Si aparece otra fila en la misma fecha, se debe marcar como conflicto de importación antes de guardar.

Como las hojas actuales no tienen proveedor estructurado, `supplier` puede ser `unknown` en el import inicial. Cuando el OS maneje POs internos, cada línea de compra sí debe tener un solo proveedor oficial por fecha y material.

### `material_stock_movements`

Kardex interno.

- `id`
- `material_id`
- `movement_date`
- `type`: `opening_balance`, `purchase`, `production_consumption`, `adjustment`, `sync_preview`, `sync_write`
- `quantity_delta`
- `unit_cost_cop`
- `source_type`
- `source_id`
- `notes`

El stock inicial viene de `material-manager-export.csv`. No se debe escribir a Shopify hasta que el preview cuadre contra MM.

### `bom_recipes`

Receta por producto/variante Shopify.

- `id`
- `shopify_product_id`
- `shopify_variant_id`
- `product_name`
- `variant_name`
- `sku`
- `active`
- `source`: `mm_import`, `manual_os`

### `bom_components`

Componentes de una receta.

- `id`
- `bom_recipe_id`
- `material_id`
- `quantity_required`
- `unit`
- `optional_waste_pct`

Recomendación sobre mermas: ignorarlas en cálculo de Phase 2 inicial, pero dejar campo opcional `optional_waste_pct` para activarlo después sin rediseñar tablas.

Las unidades dependen de cada material. Noids pueden usar mL, g o unidad según el material; suplementos suelen usar g/lb; materiales de empaque y dispositivos suelen usar unidad. El OS no debe imponer una unidad global.

### `production_batches`

Producción interna futura.

- `id`
- `batch_date`
- `output_product_id`
- `output_variant_id`
- `planned_quantity`
- `actual_quantity`
- `status`
- `notes`

### `production_batch_components`

Consumo real o planeado por batch.

- `id`
- `production_batch_id`
- `material_id`
- `planned_quantity`
- `actual_quantity`
- `unit_cost_cop_at_batch`

### `purchase_orders`

Órdenes de compra.

- `id`
- `po_date`
- `supplier`
- `currency`
- `fx_rate`
- `subtotal`
- `shipping`
- `taxes`
- `discounts`
- `total_cop`
- `status`
- `source`
- `notes`

### `purchase_order_lines`

Detalle por material comprado.

- `id`
- `purchase_order_id`
- `material_id`
- `quantity`
- `raw_unit_cost`
- `final_unit_cost_cop`

## Mapeo de hojas del Excel

### Noids

Hoja base: `Noids Costos`

Campos principales:

- Fecha: columna A
- Descripción/orden: columna B
- Costo bruto: columna C
- Moneda: columna D
- TRM: columna E
- Shipping: columna G
- Order Protect: columna H
- Cantidad: columna K
- Producto/material: columna L
- Costo producto: columna M
- Costo unitario COP: columna O
- Envío unitario: columna U
- Impuestos unitarios: columna W
- Costo total final: columna X
- Costos unitarios históricos por material: columnas AA:AY

### Supplements

Hoja base: `Supplement Costos`

Campos principales:

- Fecha: columna A
- Descripción/orden: columna B
- Costo bruto: columna C
- Moneda: columna D
- TRM: columna E
- Descuento: columna F
- Shipping: columna H
- Cantidad: columna I
- Producto/material: columna J
- Costo por unidad: columna K
- Costo en COP: columna M
- Envío unitario: columna P
- Impuestos unitarios: columna R
- Costo total final: columna S
- Costo por 30g: columna U
- Costos unitarios históricos por suplemento: columnas V:Z

### Materials

Hoja base: `Materials Costos`

Campos principales:

- Fecha: columna A
- Descripción/orden: columna B
- Costo bruto: columna C
- Moneda: columna D
- TRM: columna E
- Shipping: columna G
- Cantidad: columna H
- Material: columna I
- Costo: columna J
- Costo en COP: columna K
- Descuentos: columna M
- Valor producto con descuentos: columna O
- Envío COP: columna P
- Impuestos: columna Q
- Total final: columna R
- Costo/unidad: columna T
- Costos unitarios históricos por material: columnas U:AN

### Insumos

Hoja base: `Insumos Costos `, con espacio final en el nombre de hoja.

Campos principales:

- Fecha: columna A
- Descripción/orden: columna B
- Costo bruto: columna C
- Moneda: columna D
- TRM: columna E
- Shipping: columna G
- Cantidad: columna H
- Material/herramienta: columna I
- Costo: columna J
- Costo en COP: columna K
- Descuentos: columna M
- Valor producto con descuentos: columna O
- Envío COP: columna P
- Impuestos: columna R
- Total final: columna S

Estos registros son importantes para inventario operativo/capex, pero no deben convertirse automáticamente en BOM/COGS vendido.

Ningún registro de `Insumos Costos ` debe ser inventariable en Phase 2. Son herramientas/equipos: pueden romperse o reemplazarse, pero no se consumen como materiales de producción ni entran en BOM.

## Compatibilidad CSV con Material Manager

El OS debe implementar import/export compatible con Material Manager para tener rollback de emergencia.

### Import CSV — catálogo de materiales

Formato requerido idéntico a `material-manager-export.csv`:

```csv
ID,Name,Description,Measurement,SKU,Barcode,Category,Supplier,Cost,Currency Code,Update Shopify Inventory,Limit Shopify Inventory,Materials used in all orders,Calle 36 #22a-108 (4bf83698-ff9e-4857-9da3-e4f44bc3b447)
```

Reglas:

- `ID` se conserva como `external_mm_id`.
- `Measurement` se respeta por material.
- `Cost` se importa como costo actual MM, pero no reemplaza el historial del Excel.
- La columna de ubicación se importa como stock inicial.
- Flags de Shopify se importan, pero Phase 2.1/2.2 no escriben nada a Shopify.

### Import CSV — BOM material/producto

Formato requerido idéntico a `material-manager-export-material-product.csv`:

```csv
Material ID,Variant ID,Quantity of material used,Material name,Product name,Variant name
```

Reglas:

- `Material ID` debe mapear contra `external_mm_id`.
- `Variant ID` es la llave principal para conectar BOM con Shopify.
- `Quantity of material used` se importa sin redondeos.
- Si `Material ID` no existe en catálogo, el import debe fallar de forma segura y mostrar fila problemática.

### Export CSV — rollback a Material Manager

El OS debe poder generar ambos CSVs con:

- Mismos headers.
- Mismo orden de columnas.
- IDs MM originales preservados cuando existan.
- Nuevos materiales internos con ID estable y exportable.
- Cantidades y costos sin redondeos destructivos.

Antes de activar sync real con Shopify, debe existir una prueba de round-trip:

1. Importar CSVs de MM al OS.
2. Exportar desde OS en formato MM.
3. Comparar headers, conteo de filas, IDs, Variant IDs, Material IDs, cantidades BOM y stock.
4. Bloquear rollout si hay diferencias críticas.

## Estrategia bulletproof / cero downtime

### Modo sombra obligatorio

El OS debe correr en paralelo con MM antes de reemplazarlo. Durante este período:

- MM sigue siendo sistema operativo real.
- OS importa MM + Shopify + Excel.
- OS calcula BOM, COGS y stock esperado.
- OS no escribe en Shopify.
- OS no cambia inventario real.

### Gates de rollout

No avanzar de fase si falla cualquiera de estos checks:

- 100% de materiales MM importados.
- 100% de BOM rows MM importadas.
- 100% de Variant IDs preservados.
- Stock inicial por material igual a MM.
- Export OS → CSV MM mantiene headers y conteos exactos.
- COGS por producto no cambia salvo por diferencia explicada de costo histórico.
- Shopify sync preview no muestra cambios inesperados.

### Backups

Antes de cada cambio estructural:

- Export CSV MM original.
- Snapshot SQLite del OS.
- Export CSV OS compatible con MM.
- Log de migración con fecha/hora, commit y checks pasados.

### Sync futuro

Cuando se active sync:

- Primero `read-only`.
- Luego `preview`.
- Luego `write` para un subconjunto pequeño de materiales.
- Luego rollout total.
- Cada write debe guardar payload, respuesta Shopify y rollback manual sugerido.

## Fases de implementación

### Phase 2.1 — Importación read-only

- Crear tablas internas.
- Importar materiales actuales desde MM.
- Importar BOM actual desde MM.
- Importar historial de costos desde Excel.
- Mostrar panel de QA: materiales importados, BOMs importados, costos históricos por material, conflictos y faltantes.
- Exportar ambos CSVs en formato Material Manager y comparar round-trip.

### Phase 2.2 — Paridad con Material Manager

- Recalcular COGS por BOM usando costos históricos.
- Comparar costo actual OS vs costo actual MM por material.
- Comparar BOM OS vs BOM MM por variant ID.
- Comparar stock OS vs stock MM.
- Bloquear sync si hay diferencias críticas.
- Mantener MM como sistema real mientras el OS corre en modo sombra.

### Phase 2.3 — Edición interna

- UI para editar materiales.
- UI para editar costos históricos.
- UI para editar BOM por producto/variante.
- UI para POs y movimientos de stock.
- Auditoría mínima de cambios.

### Phase 2.4 — Sync preview

- Mostrar qué cambios se enviarían a Shopify.
- No escribir nada todavía.
- Validar impactos de stock y disponibilidad por SKU.

### Phase 2.5 — Sync write, solo después de aprobación

- Activar escritura controlada a Shopify.
- Mantener log de cada sync.
- Permitir rollback manual basado en el último snapshot.

## Preguntas pendientes

1. Confirmar si para valoración contable interna usamos costo promedio ponderado móvil como método principal.
2. Confirmar si para COGS por fecha de venta usamos costo vigente histórico por fecha o promedio ponderado hasta esa fecha.
3. Definir si nuevos materiales creados en OS deben usar IDs con prefijo interno o números compatibles con Material Manager.

## Decisión recomendada de costeo

Para precisión matemática y estabilidad:

- Inventario interno: promedio ponderado móvil por material.
- Simulación y precios actuales: último costo vigente.
- COGS histórico por venta: costo vigente a la fecha de venta si existe historial suficiente; si no, promedio ponderado acumulado hasta esa fecha.

Este enfoque evita saltos raros por una sola compra cara/barata y sigue siendo más preciso que usar siempre último costo para ventas antiguas.

## Phase 2.1 — Implementación actual (read-only mirror, sin escrituras Shopify)

La primera entrega de Phase 2 ya está en código. Es un espejo interno (shadow mode) del Material Manager, sin escrituras a Shopify y con rollback de emergencia garantizado.

### Tablas SQLite (drizzle/better-sqlite3)

- `material_manager_materials` — catálogo MM 1:1 con sus 14 columnas, más `is_insumo` e `is_noid` derivados.
- `material_manager_bom_components` — BOM por `(material_id, variant_id)` con unicidad enforced.
- `material_cost_history` — historial extraído del Excel (`Noids Costos`, `Supplement Costos`, `Materials Costos`, `Insumos Costos `).
- `material_import_runs` — log de cada corrida del importador.
- `material_round_trip_qa` — log de cada validación round-trip.

### Pipeline de import

1. `script/extract-material-cost-history.py` lee el workbook Excel y escribe `server/data/material-cost-history.json` (219 filas a la fecha). Se vuelve a correr cuando el Excel cambia.
2. `server/material-manager-mirror.ts` parsea los dos CSV de MM exactos, valida headers, y carga las tres tablas en una transacción.
3. Cualquier divergencia de headers, ID duplicado o par BOM repetido se cuenta como `conflict` y aparece en el log.

### Endpoints HTTP

- `GET  /api/material-manager/status` — KPIs del mirror.
- `POST /api/material-manager/import` — reconstruye el mirror desde CSV + Excel JSON.
- `GET  /api/material-manager/materials` — lista materiales con flags.
- `GET  /api/material-manager/bom` — BOM filtrable por `materialId` / `variantId`.
- `GET  /api/material-manager/cost-history` — historial filtrable por `materialKey` / `sourceSheet`.
- `GET  /api/material-manager/export/materials.csv` — export con headers MM exactos.
- `GET  /api/material-manager/export/bom.csv` — export con headers MM exactos.
- `POST /api/material-manager/qa` — round-trip QA: headers, row counts, IDs, BOM quantities, stock.

### UI

Nueva página `MM Mirror (Phase 2)` en el sidebar (`/material-manager`). Muestra status cards, botones Import / Export Materials / Export BOM / Run QA, y tablas filtrables de materiales, BOM e historial de costos. La página deja explícito el modo sombra.

### Política Phase 2.1

- No hay escrituras a Shopify ni a inventario.
- Material Manager sigue siendo la fuente oficial vigente.
- El export debe coincidir byte a byte en headers y orden para permitir rollback emergente.
- Insumos (tooling/equipo) no son inventariables: la columna `is_insumo` los aísla del cálculo de BOM/COGS.
- Carts/desechables permanecen en categoría Noid (`is_noid`).
- Sin proveedor histórico oficial: si no viene de MM o de una PO futura, `supplier` queda en blanco.

### Futuro Shopify-app

La aplicación correrá como Shopify embedded app. Antes de habilitar cualquier escritura, el OS se conectará primero a una tienda de prueba. La arquitectura actual ya separa lectura/escritura: el código de Phase 2.1 nunca llama al Shopify Admin API y el setup OAuth existente queda intacto para la futura instalación.

## Phase 2.1.1 — Capa de ediciones locales (override) sobre el mirror

El espejo MM sigue siendo *bit-exact* para rollback. Para que el OS pueda editar materiales y BOM sin contaminar la fuente de verdad de Material Manager, se agregan dos tablas override que viven **al lado** del mirror, y un layer de drafts locales para BOM:

| Tabla                                         | Propósito                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `material_manager_material_overrides`         | Override por `material_id` de cualquier campo del material (cost, stock, sku, flags, etc.).     |
| `material_manager_bom_overrides`              | Override por `(variant_id, material_id)` de una fila BOM importada — cambia qty/unit o la marca como `removed=1`. |
| `material_manager_bom_drafts`                 | Filas BOM nuevas añadidas localmente (no existían en MM).                                       |

**Reglas obligatorias** para mantener rollback intacto:

- El importador (`importMaterialManagerMirror`) y los exporters (`exportMmMaterialsCsv`, `exportMmBomCsv`) **leen únicamente** de las tablas mirror pristine (`material_manager_materials`, `material_manager_bom_components`).
- Las APIs de lectura para UI (`/api/material-manager/materials`, `/materials/:id`, `/variants/:id/bom`) **sí** aplican el merge mirror + overrides y devuelven flags `hasLocalEdit`, `isModifiedLocal`, `isRemovedLocal`, `originalQuantity` para que la UI muestre badges claros.
- `POST /api/material-manager/qa` debe pasar igual sea que existan overrides o no: corre contra el mirror pristine. Verificado: con un override activo (Alcohol cost=999, stock=12345) el export sigue mostrando 160.00 / 785 y el QA cuenta 125/125 materiales y 5876/5876 BOM rows con quantities y stock exactos.

### Endpoints añadidos

- `PATCH  /api/material-manager/materials/:id/override` — upsert del override (campos nullable: `null` deja caer al valor MM).
- `DELETE /api/material-manager/materials/:id/override` — borra el override y vuelve al MM original.
- `GET    /api/material-manager/bom-overrides` — lista (filtrable por `variantId` / `materialId`).
- `PATCH  /api/material-manager/variants/:variantId/bom-overrides/:materialId` — override de cantidad/unidad **o** `removed:true` para ocultar una fila MM localmente.
- `DELETE /api/material-manager/variants/:variantId/bom-overrides/:materialId` — restaurar la fila MM original.
- `POST   /api/material-manager/bom-drafts` y `PATCH/DELETE /:id` — drafts para añadir filas que no existen en MM (preexistentes).

### UI

- **Material detail dashboard** (`MaterialDetailView`): inputs editables para nombre, descripción, costo, moneda, medida, stock, SKU, barcode, categoría, proveedor, `materials used in all orders`, switches `Update/Limit Shopify inventory`. Botón **Guardar edición local** (PATCH override) y **Restablecer MM original** (DELETE override). Badge `Edición local · no sincronizada` cuando hay override activo.
- **Product BOM editor** (`ProductBomEditor`): la tabla de filas MM importadas ahora es **editable**. Cada fila muestra badge `Imported MM` / `Modified local` / `Removed local`. Acciones:
  - Editar `quantity` y `Save` → crea/actualiza `material_manager_bom_overrides`.
  - Botón papelera → `removed=true` (oculta localmente pero conserva la fila MM para rollback).
  - Botón restaurar → DELETE override → vuelve al valor MM.
  - Sigue existiendo la sección **Draft local** para añadir filas nuevas (sin equivalente MM).

### Limitaciones actuales / próximo paso de promoción

- Las ediciones locales **no** se envían a Material Manager ni a Shopify. La UI lo deja explícito en cada toast y en los badges.
- Cuando queramos promover ediciones locales a MM (sustituir el rollback como fuente de verdad), el paso siguiente será:
  1. Endpoint `POST /api/material-manager/promote-local` que produzca dos CSVs con headers MM exactos pero con valores efectivos (mirror + override + drafts − removed).
  2. QA por separado: el CSV de promoción **no** debe coincidir con el rollback (es el cambio); el round-trip clásico contra los CSV originales debe seguir pasando.
  3. Subir esos dos CSVs manualmente a MM, re-importar al OS, y limpiar las tres tablas override.
- Mientras no exista ese flujo: el export por defecto sigue siendo *rollback*, no *promoción*.

## Phase 2.2 — Real purchase orders + float-strict quantities

### Real POs from MM CSV exports

Las órdenes de compra ya no son seed. Se importan directamente desde los CSVs por-PO exportados desde Material Manager y colocados en `/home/user/workspace/purchase_order_po*.csv`. La importación ocurre automáticamente la primera vez que arranca el servidor con la tabla vacía; también se puede disparar manualmente con `POST /api/material-manager/purchase-orders/import`.

Tablas SQLite:

- `material_manager_purchase_orders` — un registro por PO con `po_number` único, fecha, supplier, ship_to, currency, reference_number, notes, subtotal/taxes/shipping/total y `status` (`received` o `cancelled`).
- `material_manager_purchase_order_lines` — líneas con `product`, `sku`, `quantity` (REAL), `unit_cost`, `tax_pct`, `total_cop`.

Endpoints:

- `GET  /api/material-manager/purchase-orders` — lista.
- `GET  /api/material-manager/purchase-orders/:idOrNumber` — detalle con líneas (`/PO16`, `/PO1`, etc.).
- `GET  /api/material-manager/purchase-orders/status` — KPIs (total, recibidas, canceladas, suppliers).
- `POST /api/material-manager/purchase-orders/import` — re-importa desde CSV.
- `GET  /api/purchase-orders` — endpoint legacy preservado para compatibilidad; ahora devuelve las POs reales mapeadas al shape antiguo.

### PO10 cancelada

PO10 no fue exportada por Material Manager (cancelada por el negocio). Se inserta como registro con `status='cancelled'`, `total=0`, sin líneas, y aparece en la lista de la UI con badge "Cancelada". **No** suma al total de compras, no aporta stock, no se usa para cálculo de costos.

### Quantities are ALWAYS float

Toda cantidad de material es float en CSV parser → DB → API → UI. Cambios concretos:

- `material_manager_materials.stock` y `material_manager_material_overrides.stock` migrados de `INTEGER` a `REAL` (incluye migración automática `migrateColumnToReal()` en el `ensureSchema`).
- `material_manager_bom_components.quantity` y `material_manager_bom_drafts.quantity` ya eran `REAL`.
- `material_manager_purchase_order_lines.quantity` es `REAL`.
- En cliente, se introduce `formatQty()` (Intl con `maximumFractionDigits: 6, minimumFractionDigits: 0`, trim de ceros). `formatNumber()` queda para conteos enteros (órdenes, líneas, materiales). Inputs `<input type="number">` para cantidades llevan `step="any"`.
- El bug visible en el screenshot (productos usando un material mostraban `0` para cantidades decimales) queda resuelto: los valores `0.88`, `0.12`, `0.5`, etc., ahora se renderizan literales.

## Phase 2.6 — Terpene Rotation Manager · **P1 (después de P0 MM core)**

> Reclasificado el 2026-05-20: aunque Terpene Rotation Manager sigue siendo necesario para considerar el switch desde MM como seamless, en el modelo de prioridades vigente queda como **P1**. **No abrir scope nuevo aquí hasta cerrar el core P0** (crear/editar materiales locales, PO receiving, adjustment history, batch/landed cost, promote drafts). Lo ya entregado (catálogo metaobject 33, baseline `CURRENT_ROTATION_BASELINE`, payload preview) se mantiene en producción.

Phase 2 no cierra sin un módulo de **Terpene Rotation Manager** que herede el modelo SEO/terpenos previo y consolide en el OS lo que hoy vive disperso entre Shopify metaobjects, Material Manager y planillas externas. Hasta que este módulo exista, el equipo seguirá tocando MM/Shopify a mano para rotar terpenos — eso no es un reemplazo seamless.

### Modelo conceptual

- **10 terpenos activos** a la vez. La rotación define qué terpenos están vivos en producción/catálogo en un periodo. El resto queda en banca o retirados.
- **Canonical ID por terpeno**: ID interno estable que **nunca cambia**, incluso si el terpeno se renombra, cambia proveedor o sale/entra de rotación. Esto evita el problema actual de "el mismo terpeno con dos nombres distintos en MM y Shopify".
- **Rotation status como metaobject equivalente**: cada terpeno tiene `status ∈ { active, rotating_in, rotating_out, retired }` + historial de cambios de estado con fecha entrada/salida y motivo. Esto reemplaza el metaobject de Shopify para uso interno; la exposición a Shopify storefront se hace por sync opt-in posterior.
- **Product family + container variants**: cada terpeno tiene una familia de producto con variantes de contenedor estandarizadas — `1ml`, `2.25ml`, `4ml`, `Jeringa`. Todas comparten la receta/blend del terpeno canónico pero difieren en packaging, precio y costo. La Calculadora de Carts ya distingue estos contenedores (`jeringa-1ml` ya existe).
- **Inventory / material mappings**: un terpeno canónico se mapea a uno o más `material_id` (mirror MM o creados en OS), porque el mismo terpeno puede tener proveedores/lotes distintos. La rotación cambia qué material es el "primario" sin perder el ID canónico del terpeno.

### Tablas propuestas

#### `terpenes`

Catálogo canónico.

- `canonical_id` (PK estable, string corto, ej. `TRPN-OG-KUSH`).
- `canonical_name`.
- `status`: `active | rotating_in | rotating_out | retired`.
- `aliases` (JSON array de nombres alternativos vistos en MM/Shopify/planillas).
- `notes`.
- `active_since`, `retired_at` (nullable).

#### `terpene_rotations`

Historial de cambios de estado.

- `id`.
- `terpene_id` → `terpenes.canonical_id`.
- `from_status`, `to_status`.
- `changed_at`.
- `reason`.
- `notes`.

#### `terpene_material_mappings`

Relación n:m con materiales del mirror MM o creados en OS.

- `id`.
- `terpene_id`.
- `material_id` (apunta a `material_manager_materials.id` o equivalente en tabla OS).
- `is_primary` (qué material está activo hoy para producción).
- `supplier` (denormalizado para query rápida).
- `effective_from`, `effective_to`.

#### `terpene_product_variants`

Relación con productos/variantes Shopify por tamaño de contenedor.

- `id`.
- `terpene_id`.
- `shopify_product_id`.
- `shopify_variant_id`.
- `container_size`: `1ml | 2.25ml | 4ml | jeringa`.
- `active`.

### Endpoints mínimos

- `GET /api/terpenes` — lista, filtrable por status.
- `GET /api/terpenes/active` — los 10 activos vigentes.
- `GET /api/terpenes/:canonicalId` — detalle con materiales mapeados, variantes de contenedor, historial de rotación.
- `POST /api/terpenes` — crear terpeno canónico.
- `PATCH /api/terpenes/:canonicalId` — editar campos básicos (nombre, aliases, notas).
- `POST /api/terpenes/:canonicalId/rotate` — body `{ to_status, reason }`. Genera entrada en `terpene_rotations` y actualiza el status del terpeno.
- `POST /api/terpenes/:canonicalId/mappings` — agregar/quitar `material_id` con flag `is_primary`.
- `GET /api/terpenes/export.csv` y `POST /api/terpenes/import` — rollback/fallback.

### CSV import/export — fallback obligatorio

Headers mínimos del CSV (round-trip): `canonical_id,canonical_name,status,rotation_started_at,rotation_ended_at,aliases,material_ids,container_variants,notes`. Cuando no haya conexión con Shopify/MM (o el sync falle), el CSV es la fuente de respaldo. Mismas reglas que MM CSV: headers exactos, sin redondeos destructivos, IDs canónicos preservados.

### No-asunciones explícitas

- **No se asume API directa a omatic ni a Material Manager** para mutar rotation status. El OS es la fuente de verdad de la rotación; Shopify/MM se sincronizan opcionalmente por export CSV/JSON manual.
- **No se asume** que los nombres en MM/Shopify ya estén normalizados — por eso el `aliases` array y el matching por `canonical_id`.
- **No se asume** que el proveedor o el lote sea único por terpeno — por eso `terpene_material_mappings` es n:m con `is_primary`.

### Integración con materials/BOM/inventory

- La Calculadora de Carts resuelve costo por terpeno vía `terpene_material_mappings.is_primary` → `material.cost`. Si no hay mapping, cae al seed sheet (igual que hoy).
- BOM por variante: cuando una variante usa un terpeno, el BOM apunta al `canonical_id` y resuelve al material primario al momento del cálculo. Cambiar el material primario por rotación **no rompe** el BOM histórico — porque el `canonical_id` es estable.
- Alertas: cuando un terpeno entra en `rotating_out`, el OS genera alerta en productos que aún dependen de él y bloquea POs nuevas para ese material.

### Criterio de "switch seamless desde MM"

El módulo se considera listo cuando:

1. Los 10 terpenos activos hoy en MM/Shopify están importados con `canonical_id` estables.
2. Cada uno tiene al menos un `material_id` mapeado y resuelve costo correctamente en la Calculadora de Carts.
3. Las variantes de contenedor (1ml/2.25ml/4ml/Jeringa) están conectadas vía `terpene_product_variants` a Shopify product/variant IDs reales.
4. Export CSV + re-import es bit-exact (round-trip QA).
5. El equipo confirma que puede rotar un terpeno (entrada/salida) sin abrir Material Manager ni el admin de Shopify.

### Estado actual del Terpene Rotation Manager

- **Implementado (`/terpenos`)**: gestor local de slots de rotación con nombre canónico, estado (`active | incoming | retired`) y ancla opcional a material MM; borradores de reemplazo terpeno-saliente → terpeno-entrante con marcado de contenedores afectados (1ml/2.25ml/4ml/Jeringa).
- **Persistencia local**: tablas `terpene_rotation_slots` y `terpene_replacement_drafts`. Ningún cambio aquí toca MM mirror, BOM ni Shopify — los drafts son revisables/archivables pero no se aplican.
- **Baseline sembrado**: cuando `terpene_rotation_slots` está vacía, el servidor siembra los 10 terpenos visibles hoy en la página pública [`connabis.com.co/pages/aprende-mas-terpenos`](https://connabis.com.co/pages/aprende-mas-terpenos) (Gelato AMP, Pineapple OG AMP CDT, White Widow, Skywalker OG, Mango Tango, Sour Diesel, Forbidden Fruit AMP, Banana Mimosa, Razz Berry AMP, Pink Champagne AMP). La lista vive en `server/terpene-rotation.ts → CURRENT_ROTATION_BASELINE` y debe refrescarse a mano hasta que exista el sync con Shopify/metaobjects.
- **Pendiente (Phase 2.6 completa)**: catálogo canónico con `canonical_id` global, historial de rotaciones, `terpene_product_variants` por contenedor, mapeos a `material_id`, alertas de salida de rotación, integración con Calculadora de Carts, **sync automático con Shopify/metaobjects** (reemplaza el baseline manual).
- **Aplicación bulk a BOM**: movida a **Phase 4** (ver `ROADMAP.md`). El módulo actual nunca destruye BOM — solo enumera el plan.

## Phase 2.2 P0 — PO ↔ Material identity + Inventory movements

Replaces the legacy "free-text product per PO line" with first-class links to MM materials so PO receipts can update inventory and latest cost in a single, idempotent flow. Existing CSV-imported POs are preserved untouched (their lines stay marked as `unmatched/manual`).

### Data model

PO line additions (backwards-compatible — both columns nullable on the legacy CSV import):

- `material_id TEXT` — canonical MM material ID. NULL ⇒ unmatched/manual (visible in the UI with a warning, never silently moves stock).
- `batch_id TEXT` — assigned by the receive flow (`<PO>-L<lineId>-<base36 timestamp>`) or user-provided. Stored on the line and on the resulting movement.

New table `inventory_movements`:

| column          | notes |
| --------------- | ----- |
| `material_key`  | MM material id |
| `po_id` / `po_number` / `po_line_id` | source pointer; `po_line_id` is `UNIQUE WHERE NOT NULL` to enforce idempotent receive |
| `qty_delta`     | positive on receive; reversal posts a compensating negative row |
| `unit_cost_cop` | per-unit price at receive time |
| `date`          | PO date (or `now()` fallback) |
| `supplier`, `currency`, `fx_rate`, `batch_id`, `note` | metadata |
| `created_at`    | when the movement was inserted |

PO status extends from `received | cancelled` to `received | cancelled | draft`. `draftPos` is exposed in `MmPurchaseOrdersStatus`.

### Receive flow (`POST /api/material-manager/purchase-orders/:id/receive`)

1. Loads the PO. Cancelled POs are rejected.
2. For each line with a `material_id`:
   - Skip if `inventory_movements.po_line_id` already exists (idempotency).
   - Otherwise insert a positive `qty_delta` movement and stamp `batch_id` on the PO line.
   - Upsert `material_manager_material_overrides.cost` + `.supplier` so the latest unit cost surfaces in the Materials view (the pristine mirror is never mutated → round-trip export still matches MM byte-for-byte).
3. Bump the PO status to `received`.
4. Return `{ movementsCreated, movementsSkipped, matchedLines, unmatchedLines }`.

Unmatched lines (no `material_id`) are reported in `unmatchedLines` and never affect stock or cost. The UI tags them with an `unmatched/manual` badge.

Reverse: `POST .../reverse` writes compensating `-qty_delta` rows (one per still-positive movement of the PO) and flips status back to `draft`. Safe to call once; subsequent calls do nothing.

### Cost-breakdown dashes (`/costos` tab + `/api/material-manager/cost-breakdown*`)

Buckets are derived from existing MM signals — no new category data required:

| bucket          | rule |
| --------------- | ---- |
| `noids`         | `is_noid` flag (already derived from MM category hints) |
| `insumos`       | `is_insumo` flag |
| `supplements`   | category matches `supplement`/`suplemento`/`vitamin`/`mineral`/`amino` |
| `materials`     | everything else with a non-empty category |
| `uncategorized` | no category |

Latest unit cost per material picks the most recent of:

1. `inventory_movements` (received PO line) — wins when present.
2. `material_cost_history` (Excel sheet).
3. `material_manager_materials.cost` (mirror) — last-resort fallback.

Endpoints:

- `GET /api/material-manager/cost-breakdown` — buckets with rows + inventory value rollup.
- `GET /api/material-manager/cost-breakdown/dash?limit=N` — flat list sorted by most-recent update (Noids costos dash equivalent).
- `GET /api/material-manager/cost-breakdown/all` — raw rows for export.

### Costing parity guarantee

- Existing CSV-imported POs are never deleted by the new flow; they continue to render as before with `unmatched/manual` line badges.
- COGS / accounting formulas are **not** recomputed — receive only writes to the inventory ledger + material overrides. The accounting P&L only changes when a PO is explicitly received and its delta flows through the existing cost-history-based cost rollups.
- Round-trip MM CSV export keeps reading from the pristine `material_manager_materials` table — receive flow writes to the overrides table, not the mirror.

### What remains for Phase 2.3+

- Production batch costing (FIFO/weighted) that consumes inventory movements per BOM.
- Auto-suggest `material_id` for the legacy CSV PO lines by SKU/name fuzzy match (currently manual via the override + re-receive).
- Tie inventory movements to the existing restock recommendations so stock-on-hand reflects received POs in real time.
- USD POs: capture `fxRate` on the line at receive time (schema is already in place; UI captures currency but not per-line TRM yet).
