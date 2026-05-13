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

### Phase 2.4 — Análisis de gastos, jeringas 1mL, BOM agrupado (implementado)

- **Gastos · análisis dónde recortar** en `/#/gastos`:
  - Scope toggle Operativos vs Todo (preserva separación inventario/capex).
  - Filtros por mes, categoría, proveedor + búsqueda libre (descripción/proveedor/notas).
  - Pie charts y tablas % por proveedor y por categoría sobre gastos operativos por defecto.
  - Tabla pivot Mes × Categoría × Proveedor con monto y % del filtro activo. Útil para identificar gastos recurrentes y candidatos de recorte.
- **Calculadora de Carts**:
  - Nueva opción de packaging **Jeringa 1mL** (id `jeringa-1ml`). El servidor intenta el costo real desde el mirror MM (`buildPackagingWithMmCosts`) por nombre `jeringa`/`syringe`; fallback al valor seed cuando no hay match. El select muestra badge `MM`/`seed`.
  - Nueva sección **Todas las recetas · costo actual** que lista las 13 recetas con blend/cart y total/cart usando el packaging seleccionado. Source badge MM/Seed por receta según si al menos un ingrediente cayó al seed sheet.
- **Inventario & Materiales · BOM agrupado**:
  - El tab BOM ahora agrupa filas por producto base (colapsable). Cada producto muestra # variantes, componentes, COGS estimado (min · avg · max) basado en el último costo MM por material, y banderas si hay materiales sin costo.
  - Expandir una variante muestra sus líneas BOM con costo estimado por componente y el botón "Editar drafts" (sin cambios en la lógica draft).
  - Compatible con Productos & Márgenes; el editor de BOM por variante se mantiene tal cual.

### Phase 2.5 — pulido datos y UX MM (implementado parcial 2026-05-13)

- **Órdenes de compra · orden cronológico**: API y UI listan POs desc por fecha (más reciente primero). Si una PO no tiene fecha (ej. PO10 cancelada), cae al final ordenando desc por número de PO. La cancelación no rompe el orden.
- **Gastos · paidTo fallback**: cuando `paidTo` está vacío o nulo, el servidor (en `loadAllExpenses`) lo sustituye por `description` para que la analítica histórica (pivot Mes×Categoría×Proveedor, breakdown por proveedor, export CSV) atribuya el gasto a algo en lugar de "Sin proveedor". Es un fallback de **campo efectivo** aplicado al cargar — la fila persistida en SQLite/JSON queda intacta. Si más adelante el usuario edita el `paidTo` real, ese valor gana sobre el fallback (idempotente). Documentado aquí porque no se migra DB.
- **Material section editable**: el detalle de material ahora permite editar todos los campos visibles (nombre, descripción, SKU, barcode, categoría con datalist de categorías existentes + nueva, medida/unidad, stock, costo, moneda, proveedor, flag/qty "Used in all orders", switches Update/Limit Shopify inventory) además de campos locales de notificación (email + umbral stock bajo). Todo vive en `material_manager_material_overrides`; el export round-trip a MM sigue usando la tabla pristine intocada. Borrar el override revierte al MM original.
- Las notificaciones locales (email + umbral) se persisten en el campo `note` del override como JSON con prefijo `__matnote__:` para no alterar el schema. Cuando se implemente envío real de email/Slack, el formato es estable.

### Phase 2.5+ — pendientes

Módulos:

- Promover drafts a MM (escritura segura, requiere stage tienda separada).
- Materiales: borrado/creación local con sync opt-in a MM (hoy solo edición local).
- BOM editor con merge MM↔drafts en una sola vista (hoy se muestran lado a lado).
- Inventario de materiales con receiving real (PO → stock movements log).
- Adjustment history completo (hoy es placeholder: el historial de costos en card Procurement hace de proxy).
- Email/Slack real de alertas (hoy solo se guarda destinatario+umbral locales).
- Landed cost, batch costing.
- Calculadora de blends/carts.
- Calendario de restock + alertas de stock + compras sugeridas.

## Qué falta para reemplazar bulletproof a Material Manager / Shopify embedded app

Resumen ejecutivo de gaps abiertos (mantener este checklist actualizado al cerrar cada uno):

- [ ] **Visual MM parity**: revisar lado a lado con MM y cerrar diferencias de tipografía/spacing/cards en `/inventario` y detalle de material.
- [ ] **Promote drafts to official**: pipeline para empujar drafts a MM (o reemplazo) con validación previa y log de quién promovió qué.
- [ ] **Test-store embedded Shopify app**: registrar la app en una tienda Shopify de pruebas, pasar el handshake OAuth, smoke de embedded iframe antes de habilitar cualquier escritura.
- [ ] **Inventory sync preview/write**: dry-run de diferencias mirror↔Shopify y un toggle explícito para escribir; bloqueado hoy.
- [ ] **Adjustment history**: tabla de movimientos de inventario (ajuste manual, recibo PO, consumo BOM, devolución) con quién/cuándo/por qué.
- [ ] **Notifications**: enviar el email/Slack real cuando un material cae bajo el umbral del override; hoy solo se guarda destinatario.
- [ ] **PO receiving / stock movements**: marcar una PO como recibida total/parcial y aplicar el stock a la(s) bodega(s), con reversión.
- [ ] **User auth / permissions**: hoy la app corre con sesión local básica; falta multi-usuario con roles (admin/staff/read-only).
- [ ] **Backups / restore**: snapshots periódicos del SQLite + script de restore (y export cifrado off-site).

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

