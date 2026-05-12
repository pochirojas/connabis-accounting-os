# Connabis Accounting OS — ARCHITECTURE

## Stack

- Frontend: Vite, React, TypeScript, Tailwind, shadcn/ui, Recharts.
- Routing: Wouter con hash routing para funcionar dentro del deploy iframe.
- Data fetching: TanStack Query.
- Backend: Express en `server/routes.ts`.
- Storage local: `server/storage.ts` para gastos manuales/caja; SQLite/Drizzle. Phase 2.1 agrega tablas `material_manager_materials`, `material_manager_bom_components`, `material_cost_history`, `material_import_runs` y `material_round_trip_qa` (módulo `server/material-manager-mirror.ts`).
- Shared types: `shared/schema.ts`.

## Capas

### UI

Páginas principales en `client/src/pages`:

- `dashboard.tsx`: KPIs, filtro global y P&L mensual.
- `ingresos.tsx`: detalle de ingresos.
- `gastos.tsx`: captura, clasificación, export y revisión de gastos.
- `productos.tsx`: productos activos, ventas por SKU, COGS MM y simulador de precio.
- `performance.tsx`: performance por período y drilldown diario.
- `inventario.tsx`: prototipo Phase 2.
- `material-manager.tsx`: Phase 2.1, mirror solo lectura de Material Manager (status, import, export con headers MM exactos, QA round-trip).
- `sugerencias.tsx`: sugerencias reales + restock marcado Phase 2.
- `alertas.tsx`: alertas de calidad de datos y utilidad.
- `glosario.tsx`: definiciones.
- `integracion.tsx`: roadmap de fuentes y fases.

### API

`server/routes.ts` concentra:

- Conexión lectura Shopify.
- Normalización de órdenes a líneas contables.
- Matching Shopify ↔ Material Manager.
- Cálculo de ventas totales, COGS, P&L, BOM coverage.
- Clasificación de gastos.
- Endpoints de alertas, sugerencias, exports y drilldowns.

### Storage

`server/storage.ts` maneja:

- Gastos manuales.
- Cuentas de caja.
- Efecto de gastos en caja.
- Reverso de caja al borrar gastos manuales.

## Flujo de datos Phase 1

1. Shopify entrega órdenes, ventas totales, productos activos y variantes.
2. Material Manager entrega BOM y costos por componentes.
3. El backend matchea línea vendida contra BOM.
4. Se calcula COGS por línea y se agrega por día/mes/período.
5. Sheet/manual entrega gastos reales.
6. Gastos se clasifican en operativo, inventario, capex o sin categoría.
7. Dashboard, Performance, Productos, Alertas y Sugerencias consumen las mismas métricas.

## Principios de mantenimiento

- Toda definición contable debe vivir en `METRICS.md` y en helpers centralizados de backend.
- No duplicar fórmulas entre páginas.
- No mostrar seed como real.
- Si falta BOM, mostrar alerta y no inventar costo.
- Si una pantalla es Phase 2/prototipo, marcarlo visualmente.

