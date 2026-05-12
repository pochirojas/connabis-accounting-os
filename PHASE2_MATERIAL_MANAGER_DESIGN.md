# Phase 2 — Reemplazo controlado de Material Manager

Phase 2 no sincroniza ni escribe inventario en Shopify al inicio. El objetivo es replicar Material Manager dentro de Connabis Accounting OS, validar que los números coinciden, y solo después activar sincronización en modo preview.

## Fuentes actuales

- `material-manager-export.csv`: catálogo actual de materiales, unidad de medida, proveedor, costo actual, flags de inventario Shopify y stock por ubicación.
- `material-manager-export-material-product.csv`: BOM actual de Material Manager. Relaciona `Material ID`, `Variant ID` y `Quantity of material used`.
- `Contabilidad-Connabis-Pro-1.xlsx / Noids Costos`: historial de compras y costos unitarios para cannabinoides, destilados, terpenos y carts.
- `Contabilidad-Connabis-Pro-1.xlsx / Supplement Costos`: historial de compras y costos unitarios para suplementos.
- `Contabilidad-Connabis-Pro-1.xlsx / Materials Costos`: historial de compras y costos unitarios para empaques y materiales consumibles.
- `Contabilidad-Connabis-Pro-1.xlsx / Insumos Costos `: historial de herramientas/equipos/insumos operativos. Estos no deben tratarse automáticamente como COGS vendido si no son materiales del BOM.

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

## Fases de implementación

### Phase 2.1 — Importación read-only

- Crear tablas internas.
- Importar materiales actuales desde MM.
- Importar BOM actual desde MM.
- Importar historial de costos desde Excel.
- Mostrar panel de QA: materiales importados, BOMs importados, costos históricos por material, conflictos y faltantes.

### Phase 2.2 — Paridad con Material Manager

- Recalcular COGS por BOM usando costos históricos.
- Comparar costo actual OS vs costo actual MM por material.
- Comparar BOM OS vs BOM MM por variant ID.
- Comparar stock OS vs stock MM.
- Bloquear sync si hay diferencias críticas.

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

1. ¿Qué hoja o columna identifica proveedor en las compras históricas cuando la descripción no lo dice explícitamente?
2. ¿La unidad oficial de noids debe ser mL, g o unidad según cada material?
3. ¿Los carts y desechables comprados en `Noids Costos` deben vivir como materiales de empaque o dentro de categoría noids por estar en esa hoja?
4. ¿Qué materiales de `Insumos Costos ` deben ser inventariables y cuáles deben quedar como capex/herramientas no inventariables?
5. ¿Quieres FIFO, promedio ponderado o último costo para valorar inventario? Para COGS vendido actual recomiendo promedio ponderado o costo histórico vigente por fecha; para simplicidad inicial, usar último costo vigente por fecha.
