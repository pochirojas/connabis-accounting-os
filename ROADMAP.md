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

### Phase 2.1 — Mirror read-only + módulo Inventario & Materiales (implementado)

- Espejo interno de Material Manager: materiales, BOM, historial de costos del Excel.
- Endpoints `/api/material-manager/*` para status, import, listas, export y QA round-trip.
- **Módulo único Inventario & Materiales** en el sidebar. Antes había dos entradas ("Inventario & Compras" + "MM Mirror Phase 2"); ahora hay un solo módulo. Tanto `/inventario` como `/material-manager` apuntan a la misma página.
- Tabs: Materiales · BOM/Productos · Órdenes de compra · Admin/QA/Costos.
- **Detalle por material**: click en un material abre dashboard con info + productos que lo usan + cards de Inventario / Procurement / Materials sold trend / Notificaciones (réplica del layout de MM).
- **Editor de BOM por variante** (modal): seleccionar variante, ver filas MM importadas (solo lectura) y filas draft locales (CRUD), añadir material desde selector, ajustar cantidad/unidad, eliminar.
- **Draft BOM overlay**: nueva tabla `material_manager_bom_drafts` separada de las filas MM. No se mezcla con `material_manager_bom_components`. Endpoints `GET/POST/PATCH/DELETE /api/material-manager/bom-drafts` y `GET /api/material-manager/variants/:variantId/bom`. UI marca los drafts con badge ámbar "Draft OS BOM · no sincronizado".
- Export Materials/BOM CSV sigue siendo round-trip exact respecto a MM (excluye drafts). Un futuro "Export drafts preview" en Phase 2.2 permitirá ver el draft completo aparte.
- Productos & Márgenes cross-links: cada producto activo expone un botón **Editar BOM (draft local)** que abre el mismo modal del módulo Inventario.
- Export con headers MM exactos para rollback de emergencia.
- **Sin escrituras a Shopify ni a Material Manager.** MM sigue siendo la fuente oficial vigente.
- App correrá eventualmente como Shopify embedded app; antes de cualquier escritura se probará en una tienda separada.

### Phase 2.2 → 2.5 — pendientes

Módulos:

- Promover drafts a MM (escritura segura, requiere stage tienda separada).
- Materiales: edición/borrado/creación local con sync opt-in a MM.
- BOM editor con merge MM↔drafts en una sola vista (hoy se muestran lado a lado).
- Inventario de materiales con receiving real (PO → stock).
- Landed cost, batch costing.
- Calculadora de blends/carts.
- Calendario de restock + alertas de stock + compras sugeridas.

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

