# Phase 2 — Reemplazo controlado de Material Manager

Phase 2 no sincroniza ni escribe inventario en Shopify al inicio. El objetivo es replicar Material Manager dentro de Connabis Accounting OS, validar que los números coinciden, y solo después activar sincronización en modo preview.

Principio operativo: el cambio debe ser reversible. El OS debe poder importar y exportar exactamente los mismos formatos CSV que Material Manager para que, si algo falla, se pueda volver a Material Manager sin downtime ni pérdida de inventario.

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
