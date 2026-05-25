# Accounting QA Recommendations (Colombian context)

> Author: AI accountant pass on the Gastos & Contabilidad surface.
> Status: **recommendations only**. This file does not implement changes — it lists what to consider next iteration.
> Scope: Colombian small-business operation (Connabis), COP-based bookkeeping with USD purchases occasionally.

This iteration implemented three concrete UX improvements requested by the user:
1. Collapse `Detalle de gastos` to the latest 5 (toggle).
2. Pagination + page-size selector (5/10/25/50/100) with search + year filter.
3. Two operating-average tiles (`promedio por mes con gasto` and `promedio mensual calendario`) inside `Análisis de gastos`.

Everything below is a candidate for a future iteration. Items are roughly ordered by ratio of accounting value to implementation cost.

---

## 1. Tax fields on the expense record

The current expense row stores `category`, `paidTo`, `paidWith`, `paidBy`, `currency`, `amount`, `originalAmount`, `fxRate`, `notes`. For Colombia we are missing:

- **NIT del tercero** (or `CC` for natural persons). DIAN expense soporte requires identifying the supplier. Adding `paidToNit` as an optional text field on `Expense` would unblock most of the items below without changing existing records.
- **Tipo de documento**: `factura electrónica`, `documento equivalente`, `documento soporte` (operación con no obligados), `nota crédito`, `gasto sin soporte`. Without this the system can't tell deductible vs. non-deductible.
- **Número de documento** + **CUFE** (for facturas electrónicas) — useful for cross-checking against DIAN inbox in the future.
- **Régimen del tercero**: `responsable IVA` vs `no responsable` vs `gran contribuyente`. Drives whether IVA is recoverable and whether reteIVA applies.
- **IVA discriminado**: `base` + `iva` + `tarifa` (0/5/19). Today amounts are stored as a single COP total, which conflates base + IVA and makes IVA reporting impossible.
- **Retenciones aplicadas**: `retefuente`, `reteICA`, `reteIVA` (amount + concepto + tarifa). Even if Connabis is not always retenedor today, knowing what the supplier billed makes reconciliation against bank movements much cleaner.
- **Deducible / no deducible** flag (boolean + reason). Lots of real-world COP spend is non-deducible (gastos personales mezclados, sin soporte, etc.) and should be flagged so it doesn't pollute the operating-expense average.

Suggestion: add the fields as optional first so historic rows don't break. The form can default to "factura electrónica" / "responsable IVA" / "deducible" to keep happy-path quick.

> Note: CREE was repealed in 2017 and replaced by impuesto sobre la renta unificado — it is no longer relevant and can be omitted from any "taxes" UI.

---

## 2. IVA dashboard

Even before retenciones, the single highest-value addition would be:

- A small `IVA` widget that, per month, totals `IVA descontable` (purchases) and (eventually) `IVA generado` (sales). Today Connabis pays IVA inside the cost of goods/services without ever knowing how much is recoverable.
- A "próximo vencimiento bimestral / cuatrimestral" reminder. DIAN's IVA periodicity depends on income tier; for a small operation it's usually cuatrimestral. The system can show the next due date once the period is set in settings.

If the immediate goal is just *visibility* rather than *declaración*, even a sum of `iva` across the filtered period would already be useful.

---

## 3. Inventory vs. operating expense — keep separating, but make it explicit

The codebase already classifies expenses into `operating | inventory | capex | uncategorized` and the new operating-average tiles correctly exclude inventory/capex (the user was very explicit about this distinction in the existing code — keep that).

Suggestions:
- Surface a small **Sin clasificar** badge count at the top of `Detalle de gastos` (`X gastos sin clasificar — revisa`). Today uncategorized rows just live in the list with an amber badge.
- For inventory rows, encourage linking to the Material Manager PO / batch when available. The PO matcher already exists in MM; a backref from Expense → PO would close the loop and make the "landed cost" picture honest.
- For capex, capture `vida útil (meses)` so future iterations can compute monthly depreciation instead of expensing the full hit (currently capex is just excluded from the operating P&L, which is fine for cash view but understates true monthly cost).

---

## 4. Bank / caja reconciliation

`paidWith` already lists Nequi / Nu / Mercado Pago / Efectivo / Otro, and there is a `cash-accounts` endpoint. Two concrete gains:

- **Statement upload + match**: drag-drop a Nequi or Nu CSV/PDF and auto-match against existing expenses by amount + date ±2 days. Outstanding lines surface as "movimiento bancario sin gasto registrado" or vice versa. This is the single most powerful accountant productivity win.
- **Conciliación al cierre de mes**: a one-click monthly check that totals each `paidWith` against an entered closing balance. Catches "pagamos X pero no quedó registrado" before tax season.

---

## 5. USD / TRM evidence

USD expenses already capture `originalAmount` + `fxRate`. To make this defensible to DIAN:

- Store the **fecha de la TRM** alongside `fxRate`. Today we trust the user input. DIAN expects the TRM publicada by the BanRep for the operation date.
- Add an optional **fuente** field (`BanRep`, `extracto tarjeta`, `Wise`, etc.) so the evidence is traceable.
- A "TRM sugerida" lookup (BanRep public API) would prevent typos. Out of scope for now, but worth flagging.

---

## 6. Cost-center / product allocation

Most useful for understanding margin per product line:

- Optional `costCenter` (free text or fixed list like `Operación`, `Pauta`, `Logística`, `Producto: <familia>`) on Expense.
- A pivot in `Análisis de gastos` that shows operating expenses per product family — today everything funnels through provider/category, which hides that (e.g.) Floraplex spend is really a product-line cost, not a global operational cost.

---

## 7. Calendar / reminders

DIAN's calendar is predictable and high-cost-of-missing:

- **IVA**: bimestral or cuatrimestral (depending on tier).
- **Retención en la fuente**: monthly if Connabis is agente retenedor; otherwise N/A.
- **ICA Bogotá** (or wherever the operación is domiciliada): bimestral.
- **Declaración de renta**: yearly, calendar depends on último dígito NIT.
- **Información exógena (DIAN)**: yearly, only over thresholds — usually not relevant for small operations, but worth a one-line check each year.

A `Calendario tributario` settings panel that takes the NIT's last digit + the IVA periodicity and renders "próximos vencimientos" on the dashboard would convert the system from "registro" to "asistente contable".

---

## 8. Soportes / archivo digital

A simple but high-value field: **adjuntar soporte** (PDF/imagen) per expense, persisted somewhere durable (Supabase storage is already a dependency). DIAN requires soportes to be available 5 years. Today the system has no place to attach them, so they live in WhatsApp/Gmail and get lost.

If full file storage is out of scope, even a `linkSoporte` URL field is better than nothing.

---

## 9. UX simplifications worth considering

- **Currency formatting in inputs**: the `parseAmountInput` helper exists, but the displayed amount in the table doesn't show decimals consistently (some COP rows show `$ 76.352,57`). Either round to whole COP at write time, or always display 2 decimals — mixed presentation looks like a bug to an accountant.
- **"Pagado por" column** (the person who actually paid, e.g. `Connabis` vs `Susana Contadora`) is sparsely populated. Either make it required for new manual rows, or hide it when null is the dominant case.
- **`source` badge** (`MANUAL`, `SHEET`, `SHOPIFY`) is engineer-facing. Consider relabeling to `Manual`, `Histórico`, `Shopify` for the accountant audience.
- **Sin proveedor** rows should be flagged like uncategorized — they typically indicate a soporte gap.
- The "Mes × Categoría × Proveedor" table is powerful but unlabeled in totals; adding a footer row with `Total = filteredTotal` would make it printable.

---

## 10. Things to *not* add yet

- Full double-entry accounting (debits/credits journal). The current single-entry cash-style ledger is appropriate for the scale and the move to a real journal is a big jump that should wait until a CPA is co-designing.
- Automatic e-invoice ingestion from DIAN. Possible (DIAN exposes inbox-style APIs via providers like Siigo, Alegra), but it's a multi-week integration. Useful only after the fields in section 1 exist.
- Multi-currency P&L. The USD → COP conversion at write time is sufficient; storing a parallel USD P&L would double the surface area for no clear gain at current volume.

---

## Quick wins to tackle next iteration (in this order)

1. Add `paidToNit`, `documentType`, `deductible` fields to Expense (optional, defaulted). Surface as columns/badges in `Detalle de gastos`.
2. Add `iva` (amount + tarifa) and `retenciones` (amount + concepto) optional fields. Show monthly IVA total.
3. Add `soporteUrl` field + a clickable link icon in the table.
4. Add "Sin clasificar" + "Sin proveedor" count badges at the top of `Detalle de gastos`.
5. Wire a basic Nequi / Nu CSV reconciliation, even if read-only at first.

Items 1–4 are mostly schema + UI plumbing and don't change any totals. Item 5 is the biggest unlock once 1–2 are in.
