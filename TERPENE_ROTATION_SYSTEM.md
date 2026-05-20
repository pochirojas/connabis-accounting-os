# Terpene Rotation System — OS Integration

Status: **Phase 2.2 implemented · local-only · no Shopify writes yet**

This document explains how the Connabis terpene rotation system is modelled
inside the Accounting OS, how the OS maps to the live Shopify surfaces
documented in *Connabis Terpene Rotation System Technical Documentation*, and
what is intentionally left for future phases.

## 1. The three live surfaces (Shopify)

The public Shopify store (`connabis.com.co` / `2f979e-24.myshopify.com`, theme
ID `129000144973`) renders the terpene catalog on three different surfaces.
All three read from the same Metaobject type `terpeno` — except Deepdive,
which is currently a static HTML snippet.

| Surface | URL / snippet | Auto-updates from metaobject? |
| --- | --- | --- |
| Product page widget | `snippets/connabis-terpene-widget.liquid` | **Yes** — matches selected variant option value (`Terpenos` / `Blend` / `Sabor`) to a terpeno metaobject and renders mascot, badges, donut, tagline, composition. |
| "Aprende Más" page  | `/pages/aprende-mas-terpenos` | **Yes** — iterates over metaobjects, respects `estado` and `orden`. |
| Deepdive page       | `/pages/deepdive-terpenos` (snippet `deepdive-terpenos-v6.liquid`) | **No** — static HTML hard-coded today. Requires theme redeploy. |

The widget only renders when a product's variants expose one of the option
names `Terpenos`, `Blend`, or `Sabor`. Mascots live on
`https://cdn.shopify.com/s/files/1/0581/4121/2749/files/...`.

## 2. Metaobject `terpeno` — full field list

The Shopify metaobject type exposes these fields:

| Field | Purpose | Edited by OS today? |
| --- | --- | --- |
| `nombre` | Display name (e.g. `Gelato AMP`) | Read-only baseline |
| `nombre_floraplex` | Supplier-side name | Read-only baseline |
| `tipo` | `Sativa` / `Hibrido` / `Indica` | **Yes** (local draft) |
| `estado` | `En Rotación` / `Agotado` | **Yes** (local draft) |
| `orden` | `1..10` for active rotation, empty if `Agotado` | **Yes** (local draft) |
| `terpeno_dominante` | Dominant terpene callout | Read-only |
| `perfil_sabor` | Flavor description (multiline) | **Yes** (local draft) |
| `perfil_sensaciones` | Sensation description | Read-only |
| `propiedades_terapeuticas` | Therapeutic claims | Read-only |
| `sinergia` | Compatible terpene blends | Read-only |
| `composicion` | Composition breakdown (used by donut) | Read-only |
| `sku` | Variant SKU anchor | Read-only |
| `tamano` | Variant size (`1ml` / `2.25ml` / ...) | Read-only |
| `tss_url` | Terpene Spec Sheet PDF URL | Read-only |
| `tags_sabor` | Tag list — flavor facets | Read-only |
| `tags_propiedades` | Tag list — property facets | Read-only |
| `mascota` | Mascot image URL | **Yes** (local draft) |

Everything marked *read-only* is still mirrored locally as part of the
baseline; the OS can read those values and embed them in the GraphQL payload
preview, but the UI does not yet expose editors for them. Those editors are
the next milestone (see §6).

## 3. Local data model (OS-side)

The OS keeps a baseline + sparse override pattern:

```
server/terpene-catalog.ts
  BASELINE          // 33 entries hand-extracted from the PDF
  KNOWN_MASCOT_FILES // 12 known mascot filenames mapped to handles
  terpene_catalog_edits (SQLite)
    handle TEXT PRIMARY KEY
    tipo, estado, orden, mascota_url, perfil_sabor, updated_at
```

Reads merge the baseline with the edit overlay. A `dirty` flag on every
entry records whether at least one field diverges from the PDF baseline. The
overlay is what the future Shopify proxy will push.

## 4. The 33 baseline handles

### En Rotación (orden 1..10)

| # | Handle | Nombre | Tipo |
|---|---|---|---|
| 1  | `terpeno-skxudhtc` | Gelato AMP           | Hibrido |
| 2  | `terpeno-rgnr9zoq` | Pineapple OG AMP CDT | Sativa |
| 3  | `terpeno-xpfem5gy` | White Widow          | Hibrido |
| 4  | `terpeno-uiyc3gbe` | Skywalker OG         | Indica |
| 5  | `terpeno-hg8xj7wv` | Mango Tango          | Sativa |
| 6  | `terpeno-vmdltdz5` | Sour Diesel          | Sativa |
| 7  | `terpeno-snxuzbyl` | Forbidden Fruit AMP  | Indica |
| 8  | `terpeno-v9pow26d` | Banana Mimosa        | Hibrido |
| 9  | `terpeno-w5cclocb` | Razz Berry AMP       | Hibrido |
| 10 | `terpeno-ciuxma1e` | Pink Champagne AMP   | Indica |

### Agotado / Banco (orden null)

`terpeno-y5i2pgim` Piña Colada AMP · `terpeno-o3qil70b` Tropical Punch AMP ·
`terpeno-4krixq6p` Wedding Cake · `terpeno-3tgpfikb` Northern Lights ·
`terpeno-gcniqbps` King Louis XIII · `terpeno-hiqwni7u` God's Gift ·
`terpeno-jwtghpqf` Tiger's Blood AMP · `terpeno-wpwzw6ac` ACDC ·
`terpeno-xu2acgcp` Watermelon Bubblegum AMP · `terpeno-8wbdx86q` Super Lemon Haze ·
`terpeno-ubbnwkei` Strawberry Lemonade · `terpeno-js7yr01b` Purple Punch AMP ·
`pineapple-og-amp` Pineapple OG AMP · `terpeno-lwdcfyl9` Berry Belini AMP ·
`terpeno-ubqvh1rq` Strawberry Mimosa AMP · `terpeno-ujgybxnw` Cookies n Cream ·
`terpeno-tcqmhlec` Granddaddy Purple · `terpeno-4pafonzr` Jack Herrer ·
`terpeno-osalbj0g` OG Kush · `terpeno-jcr6mgjg` Key Lime Pie ·
`terpeno-mgsjcu8d` Gelato · `terpeno-jkbsi9ra` Apple Fritter AMP ·
`terpeno-nks562er` Trainwreck.

## 5. API surface (OS-internal)

All routes are local, no auth, no outbound HTTP.

```
GET  /api/terpene-catalog
     → { activeLimit: 10, totalBaseline: 33, entries: TerpeneCatalogEntry[] }

POST /api/terpene-catalog/batch
     body: { patches: [{ handle, tipo?, estado?, orden?, mascotaUrl?, perfilSabor? }] }
     → { saved: TerpeneCatalogEntry[], errors: [] }
     Atomic: the whole batch rolls back if the resulting catalog violates
     rotation invariants (≤10 active, unique orden in [1..10], agotado→orden null).

POST /api/terpene-catalog/reset
     → { cleared: <number of overlay rows deleted> }
     Drops all local edits and reverts to the PDF baseline.

GET  /api/terpene-catalog/shopify-preview
     → { adminApiVersion: '2024-01', metaobjectType: 'terpeno', note, payloads: [...] }
     Builds — but never sends — the Admin GraphQL payload for each dirty entry.
     Uses metaobjectUpdateByHandle with MetaobjectHandleInput { type: 'terpeno', handle }.
```

### Badge color reference (matches the widget snippet)

| Badge | Trigger | Hex |
| --- | --- | --- |
| `SATIVA`        | `tipo == Sativa`         | `#E65100` |
| `HYBRID`        | `tipo == Hibrido`        | `#01696F` |
| `INDICA`        | `tipo == Indica`         | `#311B92` |
| `AMP`           | `nombre` contains `AMP`  | `#33691E` |
| `EN ROTACIÓN`   | `estado == En Rotación`  | `#1b5e20` |

## 6. UI surface (OS)

`/terpenos` (page `client/src/pages/terpenos.tsx`) is now organized as 3 tabs:

1. **Catálogo (33)** — primary view.
   - *En Rotación* — table of 10 active slots with order, mascot thumbnail,
     handle, badges, tipo selector, mascot URL editor, ↑/↓ reorder (swaps
     `orden` with neighbor), and `Retirar` (→ Agotado, orden=null).
   - *Banco / Agotado* — bank of 23 retired terpenes. `Promover a rotación`
     adds the entry to the next free `orden` slot (disabled when 10 active).
   - *Shopify preview* — a collapsible JSON block per dirty entry showing the
     exact `metaobjectUpdateByHandle` variables. No mutation runs.
   - *Restablecer al baseline PDF* — drops all local edits.
2. **Slots Phase 2.0** — legacy table that anchors a rotation slot to a
   Material Manager material ID. Kept because it carries cost-anchor
   metadata the catalog doesn't model.
3. **Reemplazos / BOM** — Phase 4 replacement drafts (terpene-out → terpene-in
   per variant family). Pure note-taking; the bulk BOM swap is still Phase 4.

The page header reminds the user that everything is local and that the
Deepdive page won't update from these edits.

## 7. What sync to Shopify will look like (Phase 2.3)

Not yet implemented. The plan:

1. Add a backend proxy module (e.g. `server/shopify-admin-proxy.ts`) holding
   the Admin API token (`SHOPIFY_ADMIN_TOKEN` env var, never in source).
2. Add an authenticated POST endpoint `/api/terpene-catalog/sync` that:
   - Reads dirty entries via `buildShopifyMutationPreview`.
   - Resolves each handle to a metaobject `id` via
     `metaobjectByHandle(handle: { type: "terpeno", handle })`.
   - Executes `metaobjectUpdate` per entry under Admin API `2024-01`.
   - On success, clears the corresponding row in `terpene_catalog_edits` so
     the local overlay collapses back into the baseline.
3. Require explicit user confirmation in the UI (`type DELETE` style modal)
   before firing. Mirror the same caution as the BOM bulk-replace.

What stays manual:
- `deepdive-terpenos-v6.liquid` is HTML-frozen. Either redeploy the theme by
  hand, or convert it to a `{%- for metaobject in shop.metaobjects.terpeno.values -%}`
  loop (preferred long-term — Phase 2.4).

## 8. Operational notes

- The PDF baseline reflects rotation **as of 2026-05-20**. Refresh it
  manually by editing `BASELINE` in `server/terpene-catalog.ts` if the public
  page diverges before the proxy lands.
- Local edits live in SQLite at the path used by `server/storage.ts`. The
  schema migration is idempotent (`CREATE TABLE IF NOT EXISTS`) so a fresh
  database boots straight to baseline.
- `/api/terpene-catalog/batch` enforces invariants atomically. UI calls go
  through `apiRequest` and react-query invalidates both
  `/api/terpene-catalog` and `/api/terpene-catalog/shopify-preview`.
- Slots Phase 2.0 and Catalog Phase 2.2 are independent. Don't try to derive
  one from the other; they answer different questions (MM cost anchor vs.
  storefront-visible rotation).

## 9. Next steps (ordered)

1. **Phase 2.3 — Shopify proxy.** Token in env, `/sync` endpoint with confirm
   modal. Don't ship without integration tests against a sandboxed metaobject.
2. **Phase 2.4 — Deepdive Liquid rebuild.** Convert
   `deepdive-terpenos-v6.liquid` to iterate over `shop.metaobjects.terpeno`
   so it stops drifting from `estado`/`orden`.
3. **Phase 2.5 — Field expansion.** Add editors for `perfil_sabor`,
   `perfil_sensaciones`, `propiedades_terapeuticas`, `sinergia`,
   `composicion`, `tags_sabor`, `tags_propiedades` in the catalog tab.
4. **Phase 4 — BOM bulk swap.** Wire `terpene_replacement_drafts` to the MM
   BOM editor with double confirmation.
