# Connabis Accounting OS

Dashboard interno de contabilidad, margen y operación para Connabis Colombia.

## Regla principal de datos

- Shopify: fuente oficial de ingresos y productos activos.
- Material Manager: fuente oficial actual de BOM y COGS.
- Gastos: una sola tabla `expenses` (sheet histórico migrado + manuales + captura rápida + Discord). Solo los estados `revisado`, `en_dataico` e `historico` cuentan en KPIs/P&L; `capturado` espera en **Por revisar**.
- Nunca se muestran datos de prueba: si una fuente falla, la UI muestra "—" o vacío.
- Phase 2: reemplazar Material Manager dentro del OS. Arranca en Phase 2.1 con un mirror solo lectura (shadow mode) que importa y exporta los CSV de MM con headers exactos para rollback de emergencia, sin escribir en Shopify.
- Phase 2.1+: el módulo **Inventario & Materiales** ya consolida "MM Mirror" + "Inventario & Compras" y agrega un editor de BOM local (drafts) por variante. Los drafts viven en `material_manager_bom_drafts` y nunca se mezclan con las filas MM importadas. El export CSV (Materials/BOM) sigue siendo bit-exact respecto a MM para preservar el rollback; los drafts se exportarán por separado cuando se habilite `Export drafts preview`.
- La app correrá eventualmente como Shopify embedded app; antes de habilitar escrituras se probará en una tienda de pruebas separada.
- Phase 3: Dataico como libro oficial (lectura de facturas, compras y documento soporte) — pendiente de verificar API del plan.

## Stack

- Vite + React + TypeScript.
- Tailwind + shadcn/ui.
- Wouter hash routing.
- TanStack Query.
- Express backend.
- Recharts.

## Run locally

```bash
npm install
cp .env.example .env          # completa AUTH_USERS y SESSION_SECRET
npm run hash-password -- 'tu-contraseña-larga'
npm run dev                   # o AUTH_DISABLED=1 npm run dev para saltar login en local
npm run check                 # TypeScript (0 errores)
npm test                      # tests unitarios
npm run build && npm start
```

### Datos y despliegue
- Todo lo que no es código vive en `DATA_DIR` (por defecto `./data`): `data.db`, CSV de Material Manager
  (`material-manager-export.csv`, `material-manager-export-material-product.csv`, `purchase_order_po*.csv`) y `attachments/`.
- En hosts con disco efímero (Render, Railway) monta un disco persistente y define `DATA_DIR=/var/data`.
- Respaldo: `GET /api/backup/db` descarga una copia consistente de la base (hazlo en cada cierre mensual).
- Login obligatorio en producción (`AUTH_USERS`, `SESSION_SECRET`). Todas las rutas `/api/*` requieren sesión.

### Gastos
- **Capturar gasto** (`/#/capturar`): foto + monto desde el celular → cola **Por revisar**.
- **Gastos → Por revisar**: completar marca, categoría, NIT, tipo de soporte DIAN y aprobar.
- **Importar Discord**: ver [docs/EXPORTAR_DISCORD.md](docs/EXPORTAR_DISCORD.md).

## Páginas

| Ruta | Archivo | Estado |
| --- | --- | --- |
| `/` | `client/src/pages/dashboard.tsx` | KPIs reales y P&L por período |
| `/ingresos` | `client/src/pages/ingresos.tsx` | Ingresos Shopify |
| `/gastos` | `client/src/pages/gastos.tsx` | Gastos reales, clasificación, caja, export. Analítica con pie charts + filtros por mes/proveedor/categoría y pivot Mes×Categoría×Proveedor para identificar candidatos de recorte. |
| `/productos` | `client/src/pages/productos.tsx` | Productos activos, ventas por SKU, COGS MM, simulador. Botón **Editar BOM (draft local)** abre el editor compartido con Inventario. |
| `/performance` | `client/src/pages/performance.tsx` | Filtros por fecha y drilldown diario |
| `/inventario` y `/material-manager` | `client/src/pages/material-manager.tsx` | **Inventario & Materiales** (módulo único). Tabs: Materiales · BOM/Productos (agrupado por producto base, expandible a variantes y materiales) · Órdenes de compra · Calculadora de Carts (con Jeringa 1mL + listado global de recetas) · Admin/QA/Costos. |
| `/sugerencias` | `client/src/pages/sugerencias.tsx` | Sugerencias reales + restock Phase 2 model |
| `/alertas` | `client/src/pages/alertas.tsx` | Alertas específicas |
| `/glosario` | `client/src/pages/glosario.tsx` | Diccionario contable |
| `/integracion` | `client/src/pages/integracion.tsx` | Fuentes y roadmap |

## API principal

| Endpoint | Uso |
| --- | --- |
| `GET /api/kpis` | KPIs del período |
| `GET /api/months` | Resumen mensual |
| `GET /api/day-details?date=YYYY-MM-DD` | Drilldown diario |
| `GET /api/products` | Productos activos + ventas + COGS |
| `GET /api/bom-coverage` | Cobertura BOM y SKUs problemáticos |
| `GET /api/expenses` | Gastos reales clasificados |
| `GET /api/export/expenses.csv` | Export gastos |
| `GET /api/export/income.csv` | Export ingresos |
| `GET /api/alerts` | Alertas dinámicas |
| `GET /api/accounting-suggestions` | Sugerencias basadas en datos reales |
| `GET/POST /api/material-manager/*` | Phase 2.1: status/import/qa, listas (materials, BOM, cost history), export con headers MM exactos |
| `GET /api/material-manager/materials/:id` | Detalle de material: info + BOM + drafts + productos que lo usan + historial de costos |
| `GET /api/material-manager/variants/:variantId/bom` | BOM de una variante (importado MM + drafts locales con desglose de costo) |
| `GET/POST/PATCH/DELETE /api/material-manager/bom-drafts` | Draft BOM overlay local (no afecta el round-trip MM CSV). Etiquetado como _draft local_ en UI. |

## Reglas de UI y datos recientes (2026-05-13)

- **POs orden cronológico**: `/api/material-manager/purchase-orders` y la tabla "Órdenes de compra" listan de más reciente a más antigua. POs sin fecha (ej. PO10 cancelada) caen al final ordenadas por número desc; la cancelación no rompe el orden.
- **Gastos · paidTo fallback**: si un gasto histórico no trae `paidTo`, el servidor lo expone igual a su `description` al cargar (en `loadAllExpenses`). La fila persistida queda intacta — es un **campo efectivo**, no una migración. Analítica (pivot, breakdowns, CSV) atribuye el gasto a algo en lugar de "Sin proveedor". Si se edita el `paidTo` real, ese valor gana (idempotente).
- **Material section · todos los campos editables**: el detalle de material permite editar nombre/descripción/SKU/barcode/categoría (datalist con categorías existentes + categoría nueva)/medida/stock/costo/moneda/proveedor/flag Used-in-all-orders/switches Update y Limit Shopify, además de campos locales de notificación (email + umbral stock bajo). Persiste como override en `material_manager_material_overrides`; el round-trip MM CSV exporta los valores originales pristine. Botón "Restablecer al MM original" borra el override. Las notificaciones se serializan como JSON con prefijo `__matnote__:` dentro del `note` del override para no alterar el schema. Lo que sigue pendiente para paridad total con MM está en `ROADMAP.md` ("Qué falta para reemplazar bulletproof a Material Manager / Shopify embedded app").

## Documentación

- `METRICS.md`: definiciones contables y fórmulas.
- `ARCHITECTURE.md`: capas y flujo de datos.
- `INTEGRATIONS.md`: Shopify, MM, sheet/manual, Dataico futuro.
- `TROUBLESHOOTING.md`: errores típicos y cómo depurarlos.
- `ROADMAP.md`: Phase 1, Phase 2, Phase 3.

