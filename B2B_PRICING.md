# B2B Pricing — Connabis & Co

Single-source pricing engine for the **Connabis & Co** page (B2B / wholesale
proposals). Everything is computed deterministically from product data the rest
of the app already consumes; the page itself is read-only and **does not write
to Shopify**.

## Entry points

- API: `GET /api/b2b-pricing` → `{ rows, summary }` (`server/b2b-pricing.ts`).
- UI: `/#/connabis-co` → `client/src/pages/connabis-co.tsx` (nav: "Connabis & Co").

## Inputs

| Field | Source |
|---|---|
| Retail price | Shopify variant `price` (via `/api/products`) |
| COGS | Material Manager BOM > Shopify `unitCost` > manual override (`getManualCogsOverrideByMatchKey`) |
| Active flag | Shopify product status |
| Family / SKU | Shopify catalog |

Water-soluble products are **excluded**: any product whose name/family matches
`/\bsolubles?\b|\bsoluble\b|water[- ]soluble/i` (diacritic-insensitive).

## Formula

For each tier `t` with target Connabis gross margin `m_c(t)` and target reseller
margin vs retail `m_r(t)`:

```
min_for_us(t)       = COGS / (1 - m_c(t))             # never sell below this
max_for_reseller(t) = retail * (1 - m_r(t))            # reseller wants ≥ m_r margin
retail_ceiling      = retail * 0.95                    # never blow past 95% of retail unless margin requires it

if min_for_us(t) > retail_ceiling:
    raw = min_for_us(t)
    flags += ["poco_margen_reseller", "precio_sobre_techo_retail"]
elif min_for_us(t) > max_for_reseller(t):
    raw = min_for_us(t)
    flags += ["poco_margen_reseller"]
else:
    raw = min(max_for_reseller(t), retail_ceiling)     # give reseller their target if we can
    raw = max(raw, min_for_us(t))

price(t) = roundClean(raw, floor = min_for_us(t))
```

`roundClean` snaps to the nearest 500 COP under 50.000, 1.000 COP under 200.000,
5.000 COP at or above 200.000 — rounding **up** if the snap would breach
`min_for_us(t)`.

## Tier targets

| Tier | Connabis GM | Reseller margin vs retail |
|---|---|---|
| 25u | 55% | 15% |
| 50u | 52% | 18% |
| 100u | 48% | 22% |
| 200u | 45% | 25% |
| 500u | 42% | 30% |
| 1000u | 40% | 35% |

Adjust in `TIERS` at the top of `server/b2b-pricing.ts`. `RETAIL_CEILING`
controls the 95% cap.

## Status flags

- `sin_cogs` — COGS missing for the product; no B2B price is suggested.
- `margen_bajo` — at least one tier required `poco_margen_reseller` to hold
  Connabis margin.
- `ok_b2b` — all tiers fit both margin objectives.

Per-tier flag `poco_margen_reseller` renders the price in orange in the UI.

## Open decisions

- **Volume discounts vs unit cost.** Today we use the same per-unit COGS for
  every tier. Real bulk-order COGS (less packaging, freight savings) is not yet
  modeled — when MM exposes a tier-aware COGS, plug it into `computeTier`.
- **Tax / IVA.** Prices are pre-tax. B2B invoice flow has to confirm whether
  reseller margin objectives should be measured pre- or post-IVA.
- **Minimum order value.** No MOV constraint enforced; the page just shows
  per-unit price by tier.
- **Channel-specific retail.** We treat Shopify retail as the single retail
  reference. If Connabis launches a separate B2C channel with a different list
  price, the ceiling has to be split per channel.
- **Outliers.** Products with very high or very low retail margins (e.g. legacy
  manual SKUs) currently follow the same formula; a `retailMargin < 30%`
  warning surfaces but doesn't change the math.
