# Connabis Accounting OS — ROADMAP

## Estado actual (2026-05-13)

Lo que ya está cerrado y vivo en producción:

- **Phase 1 estable**: KPIs/P&L, productos y simulador, performance/drilldown, alertas, diccionario. Métricas reales sin seed mezclado.
- **Ingresos Shopify** como fuente oficial; matching contra MM para COGS por línea.
- **Gastos reales** con clasificación operativo/inventario/capex, decimales correctos, filtro por año en análisis, `paidTo` fallback al cargar, persistencia de proveedor custom y display de medio de pago (Nequi/Nu Crédito).
- **MM Mirror Phase 2.1** read-only completo: import/export bit-exact, BOM, historial de costos, QA round-trip.
- **MM editable parcial dentro del OS**: override de materiales (campos completos + notificaciones locales), override de BOM por fila, drafts BOM para filas nuevas, todo aislado del rollback CSV.
- **Órdenes de compra reales** importadas desde CSVs MM, listadas en orden cronológico desc, PO10 cancelada manejada.
- **Calculadora de Carts** con 13 recetas, packaging Jeringa 1mL incluido, fuente MM vs seed etiquetada.
- **Producto BOM agrupado** por producto base/variante con COGS estimado.

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

Convertir Connabis Accounting OS en el sistema que maneja materiales, BOM, inventario, órdenes de compra, costos y producción. **Phase 2 reemplaza Material Manager dentro del OS, no Dataico.** Dataico es Phase 3 y no se toca aquí.

### Qué falta para cerrar Phase 2

Bloques explícitos antes de declarar el OS como reemplazo bulletproof de MM:

- **Paridad UI completa con MM**: interacciones, atajos, filtros, tablas inline, drag/drop y toda la sensación de uso día a día. Hoy hay paridad visual parcial y paridad funcional parcial.
- **Crear materiales nuevos dentro del OS**: hoy solo se editan materiales que vienen del mirror MM. Falta el flujo de "+ Nuevo material" con ID local estable, validaciones, asignación de categoría/proveedor/medida, y opción opt-in a sincronizar luego a MM/Shopify.
- **Edición completa de detalle de material**: cubrir campos secundarios (multi-ubicación, lead time por proveedor, alias, equivalencias de unidad, adjuntos/notas largas) que MM expone y el OS aún no.
- **Editor de BOM robusto (draft/edit)**: vista combinada MM ∪ overrides ∪ drafts, validaciones cruzadas (unidades, materiales inactivos, dependencias circulares), búsqueda dentro del modal, multi-variante batch edit, undo por fila, y promoción controlada de drafts.
- **UI QA**: pasada lado-a-lado con MM en `/inventario`, detalle de material, editor BOM, y Calculadora de Carts. Cerrar diferencias de spacing, tipografía, badges, estados vacíos y mensajes de error.

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

### Phase 2.6 — Terpene Rotation Manager (parte requerida de Phase 2)

El reemplazo de Material Manager dentro del OS no se considera completo sin un módulo de **Terpene Rotation Manager** que herede el modelo mental del trabajo previo de SEO/terpenos. Hoy ese ciclo vive parcialmente en Shopify metaobjects + Material Manager + planillas externas y se quiere consolidar en el OS.

Modelo mínimo:

- **10 terpenos activos** a la vez. La rotación define cuáles están "activos" en un periodo dado y cuáles quedan en banca/retirados. Estado por terpeno: `active | rotating_in | rotating_out | retired`.
- **Concepto metaobject/rotation status**: un terpeno tiene `canonical_id` (estable, nunca cambia) y `canonical_name`. Existe un registro de rotación por periodo (fecha de entrada/salida, motivo, notas). Esto reemplaza el metaobject de Shopify para el manejo interno; la publicación a Shopify se hace después como sync opt-in.
- **Product family + container variants**: un terpeno se vende en una familia de producto con variantes de contenedor estandarizadas: `1ml`, `2.25ml`, `4ml`, `Jeringa`. Cada variante apunta al mismo terpeno canónico, hereda receta/blend pero difiere en packaging y costo.
- **Inventory / material mappings**: cada terpeno canónico mapea a uno o más `material_id` del mirror MM (o material creado en el OS) — porque el mismo terpeno puede tener proveedores/lotes distintos. La rotación cambia qué material está activo para producción sin perder el ID canónico del terpeno.
- **Integración con materials/BOM/inventory**: el módulo de Terpenos consume y escribe contra las mismas tablas de Phase 2 (`material_manager_materials`, overrides, `bom_*`). Cambiar la rotación dispara alertas en BOM (productos que dependen de un terpeno saliente), en stock (quemar inventario residual antes de salida) y en POs (no comprar terpenos en `rotating_out`).
- **CSV import/export fallback**: import desde CSV con columnas mínimas (`canonical_id`, `canonical_name`, `status`, `rotation_started_at`, `rotation_ended_at`, `material_ids`, `notes`) y export con los mismos headers. Sirve como fuente alterna si no se conecta a Shopify/MM, y como rollback si algo se rompe.
- **Sin asumir API directa de omatic/Material Manager para rotación**: el OS no llama a omatic ni a MM para mutar el estado de rotación. La fuente de verdad pasa a ser el OS; opcionalmente se exporta CSV/JSON para sincronizar a mano con Shopify metaobjects o con MM.
- **Switch desde MM debe ser seamless**: cuando este módulo esté listo, el equipo debe poder dejar de tocar Material Manager para terpenos. Esto exige: mapeo 1:1 importado del estado actual, validación de que los `canonical_id` cubren los 10 activos hoy, y que BOM/Calculadora de Carts sigan resolviendo costo por terpeno por la vía OS.

Tablas propuestas (a refinar en `PHASE2_MATERIAL_MANAGER_DESIGN.md`):

- `terpenes` — `canonical_id`, `canonical_name`, `status`, `aliases[]`, `notes`.
- `terpene_rotations` — historial de cambios de estado con fecha entrada/salida y motivo.
- `terpene_material_mappings` — `terpene_id` ↔ `material_id` (n:m) con flag `is_primary`.
- `terpene_product_variants` — `terpene_id` ↔ `(shopify_product_id, shopify_variant_id, container_size)` para 1ml/2.25ml/4ml/Jeringa.

Endpoints (mínimo):

- `GET/POST /api/terpenes` — CRUD de terpenos canónicos.
- `POST /api/terpenes/:id/rotate` — cambio de estado con motivo.
- `GET /api/terpenes/active` — los 10 activos vigentes.
- `GET /api/terpenes/export.csv` y `POST /api/terpenes/import` — rollback/fallback.

UI:

- Tab nuevo dentro de **Inventario & Materiales** o página separada `/terpenos`, con tabla de 10 activos arriba + banca/retirados abajo, acciones de rotación, vínculos a productos/variantes y a materiales relacionados.

Estado actual del baseline (manual, no sync):

- Hoy `/terpenos` siembra automáticamente la rotación visible en la página pública [`connabis.com.co/pages/aprende-mas-terpenos`](https://connabis.com.co/pages/aprende-mas-terpenos) cuando la tabla local está vacía. La lista canónica vive en `server/terpene-rotation.ts → CURRENT_ROTATION_BASELINE` y se refresca manualmente.
- **Mejora futura (Phase 2.6 completa)**: sync automático con Shopify metaobjects / Aprende Más metafields para sustituir el baseline hardcoded. Hasta entonces, cualquier cambio público obliga a actualizar el array a mano y redeploy.

## Qué falta para reemplazar bulletproof a Material Manager / Shopify embedded app

Resumen ejecutivo de gaps abiertos (mantener este checklist actualizado al cerrar cada uno):

- [ ] **Full UI parity con MM**: paridad funcional + visual de todas las interacciones de Material Manager dentro de `/inventario` y detalle de material. No solo tipografía/spacing — también atajos, filtros, edición inline, drag/drop y micro-interacciones.
- [ ] **Crear materiales nuevos en el OS**: hoy solo se edita lo que viene del mirror MM. Falta el flujo "+ Nuevo material" con ID local estable, sync opt-in a MM.
- [ ] **Detalle de material completo**: cubrir campos secundarios MM (multi-ubicación real, lead time por proveedor, alias, equivalencias de unidad, adjuntos).
- [ ] **BOM editor robusto (draft/edit)**: vista combinada MM ∪ overrides ∪ drafts en una sola tabla, validaciones cruzadas, búsqueda dentro del modal, batch edit multi-variante, undo por fila.
- [ ] **UI QA general**: pasada lado-a-lado de todo el módulo Inventario & Materiales contra MM antes de declarar paridad.
- [ ] **Terpene Rotation Manager** (ver Phase 2.6): bloqueante para considerar el switch desde MM seamless.
- [ ] **Promote drafts to official**: pipeline para empujar drafts/overrides a MM (o al sucesor) con validación previa y log de quién promovió qué.
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

Evaluar integración contable/fiscal formal **solo después** de que Phase 2 cierre (MM completamente reemplazado dentro del OS, incluyendo Terpene Rotation Manager). Phase 3 es exclusivamente la capa fiscal/Dataico — no incluye trabajo de MM, BOM, inventario ni terpenos.

No incluido hoy:

- No hay integración Dataico activa.
- No hay declaraciones automáticas.
- No hay cierre fiscal automatizado.

Regla de scope:

- Cualquier trabajo de inventario/BOM/materiales/terpenos pertenece a Phase 2, no a Phase 3.
- Phase 3 arranca cuando el equipo deje de tocar Material Manager para operar.

## Phase 4 — Blend editor + bulk BOM replace (NO implementado)

Objetivo:

Permitir editar las **recetas de la Calculadora de Carts** como borradores y, tras
una **doble confirmación**, aplicar el reemplazo de ingredientes cannabinoides
dentro del BOM de todos los productos que usen ese blend. Esto consolida la
relación blend → familia de productos en lugar de tener que editar cada BOM
variante por variante.

Alcance:

- Editor de blends draft (no destructivo) basado en la lista actual de recetas
  (X, XX, XXX, CBDOBLE, etc.).
- Vista previa de qué productos / variantes serían afectados por aplicar el
  borrador, con costos antes/después.
- Aplicación bulk **opt-in con doble confirmación**: actualiza los valores de
  los ingredientes cannabinoides dentro del BOM de todos los productos que
  usen ese blend.

Exclusiones explícitas (no se actualizan bulk):

- Mushrooms.
- Solubles.
- Distillates puros (productos que el blend no compone).

Pre-requisitos antes de implementar:

- Phase 2 cerrada (MM reemplazado completamente dentro del OS).
- BOM editor robusto con undo por fila (Phase 2 pendiente).
- Mapeo canónico blend → producto/variante confirmado (deriva del Terpene
  Rotation Manager + manual override del operador).
- Snapshot/export de BOM antes de cada aplicación bulk para rollback rápido.

Estado: **NO implementado**. Hoy el Terpene Rotation Manager (Phase 2)
gestiona los nombres canónicos y borradores de reemplazo de terpenos sin
tocar BOM. La aplicación masiva a BOM vive aquí en Phase 4.

