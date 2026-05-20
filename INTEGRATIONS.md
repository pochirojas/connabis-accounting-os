# Connabis Accounting OS — INTEGRATIONS

## Shopify

Estado: conectado en modo lectura para Phase 1.

Uso actual:

- Órdenes.
- Ventas totales.
- Line items.
- Productos activos.
- Variantes y SKUs.
- Shipping/refunds/descuentos como campos explicativos.

Regla:

- Shopify es la fuente oficial de ingresos y productos.
- Ingreso se basa en ventas totales Shopify, no en reconstrucciones manuales.

## Material Manager

Estado: fuente oficial actual para BOM y COGS.

Uso actual:

- Componentes por producto/variante.
- Proporciones de materiales.
- Costo unitario de materiales.
- COGS por SKU/línea vendida.

Regla:

- No inventar costos cuando MM no tiene BOM/match.
- Phase 2 será reemplazar Material Manager dentro del OS.
- Phase 2.1 ya está en código: mirror solo lectura del MM CSV + historial de costos del Excel, expuesto en `/api/material-manager/*` y la página `MM Mirror`. Sin escrituras a Shopify; export con headers MM exactos para rollback. Eventualmente la app correrá como Shopify embedded app; antes se probará en una tienda separada.
- Phase 2.2 ya está en código: catálogo local del Metaobject Shopify `terpeno` (33 entradas: 10 En Rotación + 23 Agotado), con overlay de ediciones en SQLite y endpoints `/api/terpene-catalog/*`. La UI vive en `/terpenos` (tab "Catálogo"). Las escrituras a Shopify (`metaobjectUpdateByHandle`, Admin API 2024-01) son Phase 2.3 y aún no están implementadas; el endpoint `/api/terpene-catalog/shopify-preview` solo construye los payloads que se enviarían, sin token y sin red. Detalle completo y plan de sync en `TERPENE_ROTATION_SYSTEM.md`.

## Sheet contable / gastos manuales

Estado: fuente real para gastos históricos y puente operativo.

Uso actual:

- Gastos históricos.
- Categorías.
- Pagado con.
- Moneda COP/USD.
- TRM para conversión USD → COP.

Regla:

- Gastos reales reducen utilidad neta.
- Compras de inventario y capex se separan del gasto operativo mensual.

## Dataico

Estado: Phase 3 futura, no implementado.

Uso esperado futuro:

- Capa contable/fiscal.
- Facturación o conciliación fiscal si aplica.
- Apoyo para cierres y declaraciones.

Regla:

- No asumir integración Dataico en Phase 1 ni Phase 2.

