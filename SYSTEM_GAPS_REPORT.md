# System Gaps Report — May 2026

Snapshot of the most material remaining gaps across the Connabis Accounting OS,
written alongside the **Connabis & Co** B2B pricing P0. Phases reference
`ROADMAP.md`.

## P0 / Now

- **B2B pricing approval loop (this PR adds the page).** `/connabis-co` is
  read-only. Open: who approves the published wholesale price list, where it is
  stored when approved, and whether approved tiers should override the on-screen
  proposal.
- **Missing COGS.** Products without BOM and without Shopify `unitCost` are
  surfaced in Productos and now in Connabis & Co (`sin_cogs`). Backlog: a
  prioritized "load these unit costs first" worklist driven by revenue, not just
  catalog order.
- **Manual COGS overrides** are accepted by the engine but the UI for
  add/edit/disable still routes through productos; no audit log of who set what.

## P1 / Next

- **Material Manager → BOM coverage.** Several active SKUs still resolve via
  Shopify `unitCost` because they lack a BOM. Each one suppresses
  packaging/labor decomposition and breaks the tier-aware COGS roadmap.
- **Inventory consumption & landed cost.** PO landed-cost degloss exists but
  monthly close still relies on average COGS; period-accurate FIFO/LIFO is not
  wired into the income statement.
- **Expenses categorization.** Operating-expense averages now feed Gastos, but
  vendor-level tagging is mostly manual and there is no rule engine to learn
  recurring vendors.
- **Performance vs forecast.** Daily performance shows actuals; no plan/forecast
  comparison line yet.

## P2 / Later

- **Channel split for retail price.** Today retail = Shopify. A separate B2C
  channel (marketplace, dispensary partners) would need its own price reference
  and ceiling.
- **Multi-currency.** Engine assumes COP throughout; supplier invoices in USD
  are converted ad-hoc.
- **Shopify writes.** All Shopify-bound mutations are still preview-only (see
  terpene catalog). A backend proxy with scoped tokens is required before any
  publish flow goes live.
- **Auth & audit.** No user accounts, no audit trail for overrides or B2B price
  approvals.
- **Test coverage.** No automated tests; build only does typecheck + bundling.
  At minimum, add a unit test around `b2b-pricing.computeTier` (margin floor,
  ceiling clamp, rounding-never-breaks-floor).

## Recommended next steps

1. Add unit tests for `computeTier` (and pin the formula in `B2B_PRICING.md`).
2. Build a "missing COGS" worklist sorted by trailing 90-day revenue so the BOM
   backlog gets attacked in impact order.
3. Decide on tier-aware COGS — once MM exposes bulk-order economics, swap the
   per-unit COGS in `computeB2bRow` for a tier function.
4. Lock the B2B price list workflow: who proposes, who approves, where the
   approved snapshot is stored (likely a small `b2b_price_lists` table).
