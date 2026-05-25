# Connabis Accounting OS — ROADMAP

## Modelo de prioridades (2026-05-20)

Las fases históricas (Phase 1, Phase 2.x, Phase 3, Phase 4) se conservan como **etiquetas de implementación / linaje de código**, pero la priorización operativa del producto se rige a partir de ahora por el siguiente overlay:

- **P0 — Bloqueante, en curso ahora**
  - **Phase 1 accounting / data truth**: cerrar gaps de cobertura BOM, normalización histórica de categorías, validación timezone vs Shopify Analytics, y **COGS al 100% con editor manual de override** para SKUs sin BOM.
  - **Material Manager replacement · core**: crear/editar materiales locales (no solo override del mirror), **PO receiving → stock movements log**, adjustment history real, **batch costing / landed cost básico**, y promote drafts a oficial. Es lo mínimo para dejar de tocar MM en el día a día.
  - **Dataico · foundation**: mapeo base de catálogo contable (cuentas, impuestos, tipos de documento), modelo de exportación fiscal periódica, planificación de integración (sandbox + credenciales + endpoints). No requiere envío en vivo todavía, sí dejar la base lista para Phase 3.
- **P1 — Importante, después de cerrar el core P0**
  - **Terpene Rotation System** (Phase 2.6 / 2.2 catálogo metaobject): completar sync Shopify metaobjects, retirar el baseline hardcoded, y consumir la rotación desde BOM/Calculadora.
  - **Blend Editor + bulk BOM replace** (Phase 4 histórico): editor de blends draft con doble confirmación para bulk replace de ingredientes cannabinoides en BOM.
- **P2 — Backlog / oportunista**
  - UI parity total con MM (atajos, micro-interacciones, drag/drop), notifications email/Slack reales, user auth / permissions multi-usuario, backups cifrados off-site, sync write a Shopify Inventory.

Reglas de aplicación:

- **No se arranca un P1 sin que el P0 correspondiente esté cerrado o explícitamente descongelado.** Terpenes y Blend Editor son P1 — quedan en pausa de scope nuevo mientras P0 esté abierto, salvo bugfix sobre lo ya entregado.
- Las secciones siguientes (Phase 1 / Phase 2 / Phase 3 / Phase 4) describen el **qué** y el **cómo** por linaje de código; este overlay describe el **cuándo y en qué orden**.
- Próximos pasos inmediatos viven en [Próximos pasos inmediatos (P0)](#próximos-pasos-inmediatos-p0) al final del documento.

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

## Phase 1 — OS interno con métricas reales · **P0 (cerrar data truth)**

Estado: cerrado funcionalmente para decisiones operativas, con caveat de cobertura BOM. Los pendientes menores listados más abajo son **P0** porque bloquean confiar 100% en los KPIs/COGS.

Incluye:

- Shopify como fuente oficial de ventas totales y productos activos.
- Material Manager como fuente oficial de BOM/COGS.
- Gastos reales desde sheet/manual.
- KPIs y P&L con utilidad bruta/neta.
- Productos & Márgenes con ventas/unidades por SKU y simulador de precio.
- Performance por período y drilldown diario.
- Alertas de BOM, gastos sin categoría y presión de utilidad.
- Diccionario y documentación mínima.

Pendientes (P0 — bloquea declarar Phase 1 totalmente cerrada):

- Revisar manualmente SKUs sin BOM y, sobre todo, exponer un **editor manual de COGS / override de margen por SKU** para alcanzar **100% de cobertura COGS** aun cuando la BOM oficial siga incompleta. Sin esto, KPIs y P&L siguen teniendo huecos por línea.
- Normalizar categorías históricas restantes (gastos sin categoría → alertas a cero).
- Validar timezone contra Shopify Analytics (cierre diario coherente).

## Phase 2 — Reemplazar Material Manager dentro del OS · **P0 core / P1 terpenes**

Overlay de prioridad sobre las sub-fases:

- **P0 (core MM replacement)**: 2.5+ pendientes de materiales editables CRUD, BOM editor robusto MM∪overrides∪drafts, **PO receiving → stock movements**, adjustment history real, batch costing / landed cost básico, promote drafts a oficial.
- **P1 (post P0)**: Phase 2.6 Terpene Rotation Manager y Phase 2.2 catálogo metaobject — sync Shopify metaobjects, retirar baseline hardcoded, consumir rotación desde BOM.
- **P2**: paridad UI total (drag/drop, atajos, micro-UX), notifications reales, test-store embedded Shopify app, inventory sync write.

Objetivo:

Convertir Connabis Accounting OS en el sistema que maneja materiales, BOM, inventario, órdenes de compra, costos y producción. **Phase 2 reemplaza Material Manager dentro del OS, no Dataico.** Dataico tiene su foundation P0 en Phase 3 (planeación/base, sin envío en vivo).

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

### Phase 2.6 — Terpene Rotation Manager · **P1 (después de P0 MM core)**

> Reclasificado el 2026-05-20: aunque conceptualmente forma parte del switch seamless desde MM, en el modelo de prioridades vigente Terpenes queda como **P1**. No bloquea P0 (core MM, accounting/data truth, Dataico foundation). Mantener lo ya entregado (catálogo metaobject 33, baseline `CURRENT_ROTATION_BASELINE`, payload preview) pero **no abrir scope nuevo aquí hasta que P0 esté cerrado**.

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

#### Phase 2.2 — Catálogo metaobject `terpeno` (33 entradas) · **landed · P1 going forward**

Implementado en este branch (ver `TERPENE_ROTATION_SYSTEM.md` para detalle completo):

- `server/terpene-catalog.ts` — baseline hardcoded con los 33 handles del PDF *Connabis Terpene Rotation System Technical Documentation* (10 En Rotación + 23 Agotado) y mascotas conocidas. SQLite `terpene_catalog_edits` guarda overlay disperso (`tipo`, `estado`, `orden`, `mascota_url`, `perfil_sabor`).
- Endpoints `/api/terpene-catalog`, `/api/terpene-catalog/batch` (atómico, valida ≤10 activos y `orden` único 1..10), `/api/terpene-catalog/reset`, `/api/terpene-catalog/shopify-preview` (construye payload `metaobjectUpdateByHandle` Admin API 2024-01 sin enviar nada).
- UI `/terpenos` reorganizada en 3 tabs: **Catálogo (33)** con En Rotación + Banco/Agotado, ↑/↓ reorder, promover/retirar, edición inline de `tipo` y `mascota`, preview de payloads GraphQL por entrada dirty.
- Slots Phase 2.0 (anclaje MM) y Reemplazos Phase 4 quedan en sus propios tabs.
- **Phase 2.3 pendiente**: proxy backend con token Shopify para ejecutar los payloads. Aún no implementado — confirmación explícita requerida antes de enviar.
- **Phase 2.4 pendiente**: convertir `snippets/deepdive-terpenos-v6.liquid` a loop sobre `shop.metaobjects.terpeno` para que Deepdive deje de ser estático.

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

## Phase 3 — Dataico / capa fiscal · **P0 foundation, integración en vivo diferida**

> Reclasificado el 2026-05-20: la **foundation/base de Dataico es P0** y arranca **en paralelo** con el core P0 de MM y el cierre de data truth de Phase 1. Lo que sigue siendo posterior es el envío en vivo / declaraciones automáticas — eso se mantiene como Phase 3 "vivo" y queda condicionado a tener Phase 2 core cerrada.

Objetivo:

Dejar lista la capa fiscal/Dataico para que, una vez Phase 2 core esté entregada, conectar Dataico sea un toggle y no un proyecto desde cero. Phase 3 es exclusivamente la capa fiscal/Dataico — no incluye trabajo de MM, BOM, inventario ni terpenos.

### P0 — Foundation Dataico (en curso ahora)

- **Mapeo base de catálogo contable**: cuentas PUC (o equivalente) usadas para ventas, COGS, gastos operativos, capex, impuestos.
- **Modelo de exportación fiscal**: estructura de documento (factura, nota crédito, gasto) que Dataico espera, generada a partir de ingresos Shopify + gastos OS + COGS calculado por el motor del OS.
- **Plan de integración**: credenciales sandbox Dataico, endpoints a usar, contrato de campos, esquema de errores/reintentos, mapeo de impuestos por categoría.
- **Exportación periódica preview**: poder generar el archivo/JSON fiscal del periodo sin enviarlo, para validación manual lado a lado con el contador.

### P3-live — Integración en vivo (diferida)

- Envío automático a Dataico (gated detrás de la P0 foundation y de Phase 2 core).
- Declaraciones automáticas y cierre fiscal automatizado.
- Reconciliación bidireccional Dataico ↔ OS.

No incluido hoy:

- No hay integración Dataico activa.
- No hay declaraciones automáticas.
- No hay cierre fiscal automatizado.

Regla de scope:

- Cualquier trabajo de inventario/BOM/materiales/terpenos pertenece a Phase 2, no a Phase 3.
- La P0 foundation de Phase 3 puede avanzar en paralelo con P0 de Phase 2; el switch a Phase 3 "en vivo" sigue requiriendo que el equipo deje de tocar Material Manager para operar.

## Phase 4 — Blend editor + bulk BOM replace · **P1 (NO implementado)**

> Reclasificado el 2026-05-20: junto con Terpene Rotation Manager, el Blend Editor es **P1**. No arranca implementación nueva hasta que P0 (Phase 1 data truth, Phase 2 core MM, Phase 3 Dataico foundation) esté cerrado.


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

## Próximos pasos inmediatos (P0)

Orden de ejecución recomendado para los próximos sprints. Cada bullet pertenece a uno de los tres tracks P0 declarados arriba.

### Track P0.A — Phase 1 data truth (COGS 100%)

1. **Editor manual de COGS / margen por SKU** (override) en `/productos` para SKUs sin BOM o con BOM incompleta. Persistencia en una tabla `sku_cogs_overrides` con auditoría (quién/cuándo/por qué). El motor de KPIs/P&L consume el override antes que cualquier estimación.
2. Normalizar categorías históricas restantes en gastos para llevar la alerta "gastos sin categoría" a cero.
3. Validar timezone vs Shopify Analytics: cerrar el delta diario y dejar test de no-regresión.

### Track P0.B — Material Manager replacement (core)

1. **Crear/editar materiales locales** ✅ *landed (P0 slice 2026-05-25)*: dialog "Crear material" en el tab Materiales de `/inventario` y endpoint `POST /api/material-manager/materials`. Cada material lleva `origin='local'` y un ID prefijado `local-YYYYMMDD-xxxxxx`. Se almacena en la nueva tabla `material_manager_materials_local`, se mezcla en `listMmMaterialsEffective` y aparece en cost dashes, BOM y dropdown de líneas de PO. **No se exporta** al CSV round-trip de MM — preserva la garantía bit-exact de rollback. Todos los campos son editables persistentemente (nombre, SKU, categoría, bucket, proveedor, costo, moneda, unidad, stock, banderas Shopify, foto URL, descripción). Cantidades en `REAL` (float). Soporta archivado (soft delete) y reactivación vía `POST /api/material-manager/materials/:id/archive`; los archivados quedan ocultos en listas y cost dashes salvo que se pase `?includeArchived=1`. Para materiales MM-origin, el archivado se guarda en `material_manager_material_overrides.archived` — el mirror pristino y el round-trip QA siguen pasando intactos.
2. **PO receiving → stock movements log** ✅ *landed (P0 slice)*: cada línea de PO referencia un `material_id` real del catálogo MM (dropdown obligatorio en `/inventario`), las POs soportan estado `draft | received | cancelled`, y `POST /api/material-manager/purchase-orders/:id/receive` genera un `inventory_movements` por línea (idempotente vía `UNIQUE(po_line_id)`), aplica `batch_id` opcional y actualiza el último costo del material vía override (sin tocar el mirror MM, round-trip CSV intacto). Reversión vía `/reverse` escribe movimientos compensatorios. POs CSV-importadas existentes se preservan; sus líneas quedan marcadas como `unmatched/manual` y receive no las cuenta.
3. **Adjustment history real** ✅ *landed (P0 UI parity slice 2026-05-25)*: link "Adjustment history" en la tarjeta Inventario del detalle de material muestra los movimientos del ledger filtrados por `materialKey`. Distingue ingresos (`+qty` verde), rechazos (`rejection_of_line:...`) y reversales (`reversal_of_...`). Falta aún ajuste manual y consumo BOM por orden con quién/cuándo/por qué.
4. **Batch costing / landed cost básico** ✅ *landed parcial (P0 slice 2026-05-25 #3)*: nueva tabla `inventory_batches` con `tracking_code` determinista (`POnn-Lnn-YYYYMMDD[-Nn]`), `qty_received` / `qty_remaining`, costos accesorios prorrateados (shipping, tax, fees, order protect, discount) y `landed_unit_cost_cop` por lote. Se crea automáticamente en cada receive (full + partial). Endpoints `GET /api/material-manager/inventory-batches[?materialId|poNumber]` y `GET /api/material-manager/inventory-batches/:trackingCode`. **Degloss de PO**: nuevo módulo `po-cost-breakdown.ts` y endpoint `GET /api/material-manager/purchase-orders/:idOrNumber/breakdown` que reparte shipping/tax/order-protect/fees/discount por línea (basis: subtotal > qty > flat), entrega `landedTotalCop` y `landedUnitCop` por línea. Overrides por PO en `mm_po_cost_overrides` vía `PATCH/DELETE .../cost-override` (FX rate, shippingCop/Original, taxCop, orderProtectCop, feesCop, discountCop, currency, notes) — la tabla MM pristine queda intacta. UI: nueva sección "Degloss de orden" en el detalle de PO replicando la hoja referenciada (Costo, Moneda, FX, Costo COP, Envío, Order Protect, Q, Producto, Subtotal, Descuentos, Envío unitario, Impuestos unitarios, Costo Total Final / Unitario Aterrizado). *Falta aún el motor de consumo FIFO real (`consumeBatchesFifo` ya está implementado en `inventory-batches.ts` pero todavía no se invoca desde producción).*

   **Planned consumption (report-only)** ✅ *landed (P0 slice 2026-05-25 #3)*: nuevo módulo `inventory-consumption.ts` + endpoint `GET /api/material-manager/consumption-report[?month|?year]` que toma las órdenes Shopify fulfilled, las recorre línea por línea contra la BOM por variantId y calcula consumo proyectado por material + cobertura BOM + `gaps`. **NO** escribe movimientos negativos — es reporte puro para validar cobertura antes de prender la deducción destructiva. Surface advertencias por bajo stock / stock negativo proyectado.

   **Extended QA** ✅ *landed (P0 slice 2026-05-25 #3)*: endpoint `GET /api/material-manager/qa-extended` que envuelve el round-trip parity con conteos (materials, BOM, POs, líneas, movements, batches), líneas PO sin material, stock negativo, sanity de landed-cost (total declarado vs computado) y banderas de advertencia. Status `pass` / `warn` / `fail`.
5. **Promote drafts → oficial**: pipeline para empujar drafts BOM/material overrides a la fuente oficial (todavía MM mientras dure la convivencia), con validación previa y log.
6. **Cost-breakdown dashes** ✅ *landed (P0 slice)*: tab `Costos (dashes)` en `/inventario` con Noids costos, Materials costos, Supplements costos, Insumos costos + dash flat ordenado por última actualización. Endpoints `/api/material-manager/cost-breakdown[/dash|/all]`. Buckets derivados de las flags MM existentes (`is_noid`, `is_insumo`, category hints) — sin nueva fuente de datos.

**Historical PO matcher** ✅ *landed (P0 slice 2026-05-25)*: nueva tarjeta "Matcher de líneas de PO sin material" en el tab Órdenes de compra. Endpoints `GET /api/material-manager/purchase-orders/match/suggestions` (read-only, orden: exact SKU > exact name > fuzzy token-overlap) y `POST/DELETE /api/material-manager/purchase-orders/lines/:lineId/match`. La UI muestra el top de sugerencias por línea + dropdown manual con todo el catálogo MM/local. Nada se aplica hasta que el usuario haga click en "Aplicar" — preserva todas las POs importadas. Tras aplicar, recibir la PO ahora cuenta esa línea y actualiza stock + último costo.

**MM UI parity pass (P0 slice 2026-05-25)** ✅ con los screenshots reales de MM:
- Materials list ahora muestra header KPI strip (Materials by days of inventory remaining + Incoming materials + Monthly order count) y subtabs Default / Sales data. Sales data expone Sold 30d, Días inventario, 30d restock forecast calculados de `inventory_movements`. Columna Available es input editable con autosave al perder foco (escribe override local).
- Material detail: "Use this material in every order" como checkbox + cantidad (mismo control que MM), link "Adjustment history" plegable con los movimientos del material.
- PO detail: barra de progreso total recibido + columna "Received" por línea (progress bar + `X de Y`), cards "Additional details" y "Cost summary" alineados a la captura.
- Receive flow MM-parity: nuevo dialog `ReceiveInventoryDialog` con inputs Accept / Reject por línea, botones "Aceptar todo lo no recibido" / "Rechazar todo lo no recibido". Endpoint `POST .../receive-partial` registra movimientos positivos (idempotente) + negativos taggeados `rejection_of_line:N` que aparecen en el adjustment history.
- Settings: nuevo tab `Settings` con toggles de Shopify sync (futuro, no escribe), Block checkout when shared, prefijo de PO, URL del logo de PO y enable/disable de ubicaciones. Persistido en `material_manager_settings` con banner "sin escrituras a Shopify".

**Próximo P0 step:** batch costing (consumo FIFO/weighted) y promote-drafts pipeline, ya que el resto de Track P0.B core landed.

### Track P0.C — Dataico foundation (en paralelo)

1. **Mapeo base contable**: definir cuentas PUC / catálogo Dataico para ventas, COGS, gastos operativos, capex, impuestos. Persistir en `accounting_chart_map` o equivalente.
2. **Modelo de exportación fiscal**: estructura del documento que Dataico espera (factura, nota crédito, gasto) generado a partir de ingresos Shopify + gastos OS + COGS del OS.
3. **Exportación periódica preview**: endpoint/CLI que genera el dump fiscal del periodo sin enviarlo, comparable lado a lado con el contador.
4. **Plan de integración formal**: credenciales sandbox, contrato de campos, esquema de errores/reintentos. Documento corto que sirva de prerrequisito al envío en vivo.

### Después del P0 — entrada a P1

Solo cuando A + B + C estén cerrados (o explícitamente descongelados con razón documentada) se reabre scope nuevo en:

1. **Terpene Rotation Manager** (Phase 2.6 / 2.2): sync Shopify metaobjects vía proxy backend, retirar baseline hardcoded, BOM consume rotación.
2. **Blend Editor + bulk BOM replace** (Phase 4): editor de blends draft con doble confirmación.

