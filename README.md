# Connabis Accounting OS

Dashboard interno de contabilidad, margen y operación para Connabis Colombia.

## Regla principal de datos

- Shopify: fuente oficial de ingresos y productos activos.
- Material Manager: fuente oficial actual de BOM y COGS.
- Sheet/manual: fuente real para gastos históricos y nuevos.
- No mezclar seed con real sin marcarlo en UI.
- Phase 2: reemplazar Material Manager dentro del OS. Arranca en Phase 2.1 con un mirror solo lectura (shadow mode) que importa y exporta los CSV de MM con headers exactos para rollback de emergencia, sin escribir en Shopify.
- La app correrá eventualmente como Shopify embedded app; antes de habilitar escrituras se probará en una tienda de pruebas separada.
- Phase 3: Dataico/fiscal futuro, no implementado.

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
npm run dev
npm run build
npm start
```

## Páginas

| Ruta | Archivo | Estado |
| --- | --- | --- |
| `/` | `client/src/pages/dashboard.tsx` | KPIs reales y P&L por período |
| `/ingresos` | `client/src/pages/ingresos.tsx` | Ingresos Shopify |
| `/gastos` | `client/src/pages/gastos.tsx` | Gastos reales, clasificación, caja, export |
| `/productos` | `client/src/pages/productos.tsx` | Productos activos, ventas por SKU, COGS MM, simulador |
| `/performance` | `client/src/pages/performance.tsx` | Filtros por fecha y drilldown diario |
| `/inventario` | `client/src/pages/inventario.tsx` | Prototipo Phase 2 |
| `/material-manager` | `client/src/pages/material-manager.tsx` | **Phase 2.1**: mirror MM solo lectura, sin escrituras Shopify |
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

## Documentación

- `METRICS.md`: definiciones contables y fórmulas.
- `ARCHITECTURE.md`: capas y flujo de datos.
- `INTEGRATIONS.md`: Shopify, MM, sheet/manual, Dataico futuro.
- `TROUBLESHOOTING.md`: errores típicos y cómo depurarlos.
- `ROADMAP.md`: Phase 1, Phase 2, Phase 3.

