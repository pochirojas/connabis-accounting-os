# Connabis Accounting OS — ROADMAP

## Phase 1 — OS interno con métricas reales

Estado: cerrado funcionalmente para decisiones operativas, con caveat de cobertura BOM.

Incluye:

- Shopify como fuente oficial de ventas totales y productos activos.
- Material Manager como fuente oficial de BOM/COGS.
- Gastos reales desde sheet/manual.
- KPIs y P&L con utilidad bruta/neta.
- Productos & Márgenes con ventas/unidades por SKU y simulador de precio.
- Performance por período y drilldown diario.
- Alertas de BOM, gastos sin categoría y presión de utilidad.
- Diccionario y documentación mínima.

Pendientes menores:

- Revisar manualmente SKUs sin BOM.
- Normalizar categorías históricas restantes.
- Validar timezone contra Shopify Analytics.

## Phase 2 — Reemplazar Material Manager dentro del OS

Objetivo:

Convertir Connabis Accounting OS en el sistema que maneja materiales, BOM, inventario, órdenes de compra, costos y producción.

### Phase 2.1 — Mirror read-only (implementado)

- Espejo interno de Material Manager: materiales, BOM, historial de costos del Excel.
- Endpoints `/api/material-manager/*` para status, import, listas, export y QA round-trip.
- Página `/material-manager` en el sidebar con status cards, botones de import/export/QA y tablas filtrables.
- Export con headers MM exactos para rollback de emergencia.
- **Sin escrituras a Shopify ni a inventario.** Material Manager sigue siendo la fuente oficial vigente.
- App correrá eventualmente como Shopify embedded app; antes de cualquier escritura se probará en una tienda separada.

### Phase 2.2 → 2.5 — pendientes

Módulos:

- Materiales.
- BOM editor.
- Inventario de materiales.
- Órdenes de compra.
- Landed cost.
- Batch costing.
- Calculadora de blends/carts.
- Calendario de restock.
- Alertas de stock y compras sugeridas.

Entrada necesaria:

- Export completo y actualizado de Material Manager.
- Campos obligatorios por material, proveedor, unidad y costo.
- Reglas de producción y merma.
- Lead times por proveedor.

## Phase 3 — Dataico / capa fiscal futura

Objetivo:

Evaluar integración contable/fiscal formal cuando el OS interno esté estable.

No incluido hoy:

- No hay integración Dataico activa.
- No hay declaraciones automáticas.
- No hay cierre fiscal automatizado.

