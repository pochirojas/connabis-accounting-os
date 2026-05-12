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

