# Connabis Accounting OS — MVP

Internal accounting & margin dashboard for **Connabis Colombia**, designed to evolve from a standalone prototype into an embedded Shopify Admin app (style: Material Manager).

**Architectural rule (gold standard):**
- **Shopify** is the source of truth for **ingresos AND costos** (orders, products, variants, inventory, `variant.cost`).
- The **Google Sheet** is a *temporary bridge* for historical `gastos` and any record not yet in Shopify. It's replaced row-by-row as items migrate into Shopify.

UI in **Spanish**, currency in **COP** (es-CO locale), dark-first cannabis/finance aesthetic.

---

## Stack

- Vite + React 18 + TypeScript
- Tailwind v3 + shadcn/ui
- Wouter (hash routing) + TanStack Query v5
- Express 5 backend
- Recharts for visualizations
- Inter (UI) + JetBrains Mono (numerics, code)

The backend currently serves seeded JSON from `server/seed.ts`. SQLite/Drizzle is wired up in the template but unused for the MVP — switching is a one-file change in `server/storage.ts`.

---

## Run locally

```bash
npm install
npm run dev    # localhost:5000 (front + API on same port)
npm run build  # produces dist/public + dist/index.cjs
npm start      # runs the built server
```

---

## Pages

| Route             | File                                | Purpose                                               |
| ----------------- | ----------------------------------- | ----------------------------------------------------- |
| `/`               | `client/src/pages/dashboard.tsx`    | KPIs · monthly P&L · channel split · alert preview    |
| `/ingresos`       | `client/src/pages/ingresos.tsx`     | All-time, by year, channel mix, monthly revenue chart |
| `/gastos`         | `client/src/pages/gastos.tsx`       | Monthly P&L table + chart + expense detail            |
| `/productos`      | `client/src/pages/productos.tsx`    | Margin table with editable COGS, Shopify vs fallback  |
| `/inventario`     | `client/src/pages/inventario.tsx`   | Material costs (Noids), purchase orders               |
| `/alertas`        | `client/src/pages/alertas.tsx`      | Critical / warn / info alerts with recommended action |
| `/integracion`    | `client/src/pages/integracion.tsx`  | Roadmap: Shopify-first migration, embedded app phase  |

---

## API (read-only seed)

| Endpoint                  | Returns                                       |
| ------------------------- | --------------------------------------------- |
| `GET /api/kpis`           | Dashboard headline numbers                    |
| `GET /api/channels`       | Online Store / Draft Orders / Mobile mix      |
| `GET /api/years`          | Per-year orders, revenue, AOV, projection     |
| `GET /api/months`         | 2026 monthly income / expenses / profit       |
| `GET /api/products`       | Top SKUs with `cogsShopify`, `cogsFallback`   |
| `GET /api/materials`      | Noids Costo Dash material costs               |
| `GET /api/purchase-orders`| PO list with landed cost                      |
| `GET /api/expenses`       | Sample expense detail (sheet + shopify)       |
| `GET /api/alerts`         | Operational/financial warnings                |
| `GET /api/integration-phases` | Roadmap phases for Shopify migration      |
| `GET /api/shopify/status` | Current connection state (mock-seed in MVP)   |

Edit seeds in `server/seed.ts`. Domain types live in `shared/schema.ts`.

---

## Design decisions

- **Dark-first.** `.dark` is the default class on `<html>`; toggling stores nothing (sandboxed iframe blocks `localStorage`).
- **Tabular numerals** everywhere money or counts appear (`font-variant-numeric: tabular-nums lining-nums`).
- **One scroll region.** Body is `overflow: hidden`; only `<main>` scrolls. Sidebar scrolls independently with `overscroll-contain`.
- **COGS provenance is explicit.** Every row in `/productos` shows a `Shopify` or `Fallback` badge — the goal is to reach 100% Shopify.

---

## Roadmap (mirrors `/integracion`)

1. **Phase 1 — Shopify sync (in progress).** Pull pedidos, productos, variantes, inventario, `variant.cost`. Webhooks: `orders/create`, `orders/updated`, `products/update`, `inventory_levels/update`. Sheet stays as a temporary bridge for historical gastos only.
2. **Phase 2 — Persistence.** SQLite/Postgres, daily Shopify ↔︎ contabilidad reconciliation, per-SKU override UI.
3. **Phase 3 — Margin engine.** Live GM/CM with Shopify costs, low-margin discount blockers, stock-break alerts, monthly P&L by family.
4. **Phase 4 — Embedded Shopify app.** App Bridge + OAuth + Polaris, deprecate standalone dashboard.

### Credentials needed for Phase 1 (when ready to go live)

```
SHOPIFY_SHOP_DOMAIN     # e.g. connabis.myshopify.com
SHOPIFY_ADMIN_API_TOKEN # Custom App Admin API access token
SHOPIFY_API_VERSION     # e.g. 2025-01
```

For Phase 4 (public listing or embed):

```
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL
```

---

## How to swap seed for live Shopify

1. Add an `.env` with the three Phase 1 credentials.
2. Replace the body of each handler in `server/routes.ts` with a call to a new `shopify-client.ts` module (REST `/admin/api/{ver}/orders.json`, `/products.json`, `/inventory_levels.json`, `/shop.json`).
3. Persist normalized rows in SQLite via the IStorage interface (`server/storage.ts` already wired for Drizzle on `better-sqlite3`).
4. Add a webhook handler under `/api/webhooks/*` and verify HMAC.

Front-end queries don't change — `useQuery({ queryKey: ['/api/products'] })` keeps working.

---

## Test IDs

Every interactive element and meaningful data display has a stable `data-testid`. See `data-testid="kpi-ingresos"`, `data-testid="row-product-p1"`, `data-testid="input-cogs-p1"`, `data-testid="badge-source-p1"`, `data-testid="nav-alertas"`, etc.
