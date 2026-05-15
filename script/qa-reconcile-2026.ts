/**
 * QA reconciliation script for 2026 P&L.
 *
 * Talks to the running Connabis Accounting OS API (default http://localhost:5000)
 * and prints a month-by-month reconciliation table:
 *   - Shopify total_sales (ShopifyQL Analytics, source of truth for revenue)
 *   - COGS vendido (from MM BOM)
 *   - Utilidad bruta
 *   - Gastos operativos reales (excluye inventario/capex)
 *   - Utilidad neta
 *   - Cobertura BOM (líneas vendidas con BOM)
 *
 * Usage:
 *   npm run dev   # in another terminal
 *   tsx script/qa-reconcile-2026.ts                # 2026 full year
 *   tsx script/qa-reconcile-2026.ts 2025           # arbitrary year
 *   API_BASE=http://localhost:5000 tsx script/qa-reconcile-2026.ts
 *
 * Does NOT print any secrets and does NOT mutate state. Read-only API calls.
 */

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000';
const YEAR = process.argv[2] ?? '2026';

type MonthRow = {
  month: string;
  label: string;
  income: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: number;
  profit: number;
  netMargin: number;
  inventoryPurchasesExcluded: number;
  partial?: boolean;
  note: string;
};

type BomCoverage = {
  totalSoldLines: number;
  matchedSoldLines: number;
  coverage: number;
  missingRevenue: number;
  missingUnits: number;
  missingSkus: Array<{
    product: string;
    sku: string;
    variantId: string;
    units: number;
    revenue: number;
    lines: number;
    orders: number;
  }>;
};

type ExpenseRow = {
  date: string;
  month: string;
  amount: number;
  category?: string;
  paidTo?: string;
  classification: 'operating' | 'inventory' | 'capex' | 'uncategorized';
};

const fmtCop = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('es-CO') : '—';
const fmtPct = (n: number) =>
  Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';

async function getJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return (await res.json()) as T;
}

function table(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return '(no rows)';
  const headers = Object.keys(rows[0]);
  const widths = headers.map(h =>
    Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)),
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padStart(widths[i])).join('  ');
  const lines = [
    fmt(headers),
    fmt(widths.map(w => '-'.repeat(w))),
    ...rows.map(r => fmt(headers.map(h => String(r[h] ?? '')))),
  ];
  return lines.join('\n');
}

async function main() {
  console.log(`# QA reconciliation — year ${YEAR}`);
  console.log(`API base: ${API_BASE}\n`);

  const months = await getJson<MonthRow[]>(`/api/months?year=${YEAR}`);
  const monthsThisYear = months
    .filter(m => m.month.startsWith(`${YEAR}-`))
    .sort((a, b) => a.month.localeCompare(b.month));

  console.log('## Monthly P&L (Shopify total_sales vs COGS MM vs gastos reales)\n');
  console.log(
    table(
      monthsThisYear.map(m => ({
        month: m.month,
        ingresos_cop: fmtCop(m.income),
        cogs_cop: fmtCop(m.cogs),
        utilidad_bruta: fmtCop(m.grossProfit),
        margen_bruto: fmtPct(m.grossMargin),
        gastos_op: fmtCop(m.expenses),
        utilidad_neta: fmtCop(m.profit),
        margen_neto: fmtPct(m.netMargin),
        inv_capex_excl: fmtCop(m.inventoryPurchasesExcluded),
        parcial: m.partial ? 'sí' : '',
      })),
    ),
  );

  const totalIncome = monthsThisYear.reduce((s, m) => s + m.income, 0);
  const totalCogs = monthsThisYear.reduce((s, m) => s + m.cogs, 0);
  const totalGross = totalIncome - totalCogs;
  const totalExp = monthsThisYear.reduce((s, m) => s + m.expenses, 0);
  const totalNet = totalGross - totalExp;
  const totalInvCapex = monthsThisYear.reduce(
    (s, m) => s + m.inventoryPurchasesExcluded,
    0,
  );
  console.log('\n## Year totals');
  console.log(`Ingresos (ShopifyQL total_sales): ${fmtCop(totalIncome)} COP`);
  console.log(`COGS vendido (BOM MM):            ${fmtCop(totalCogs)} COP`);
  console.log(`Utilidad bruta:                   ${fmtCop(totalGross)} COP`);
  console.log(
    `Margen bruto:                     ${fmtPct(totalIncome ? totalGross / totalIncome : 0)}`,
  );
  console.log(`Gastos operativos:                ${fmtCop(totalExp)} COP`);
  console.log(`Utilidad neta:                    ${fmtCop(totalNet)} COP`);
  console.log(
    `Margen neto:                      ${fmtPct(totalIncome ? totalNet / totalIncome : 0)}`,
  );
  console.log(
    `Compras inventario/capex excluidas: ${fmtCop(totalInvCapex)} COP (no entran a gastos operativos; visibles en este renglón)`,
  );

  console.log('\n## BOM coverage (líneas vendidas con BOM real)');
  const bom = await getJson<BomCoverage>('/api/bom-coverage');
  console.log(
    `Cobertura BOM líneas vendidas: ${fmtPct(bom.coverage)} (${bom.matchedSoldLines}/${bom.totalSoldLines})`,
  );
  console.log(
    `Ingresos sin COGS reconocido:  ${fmtCop(bom.missingRevenue)} COP`,
  );
  console.log(`Unidades sin BOM:              ${fmtCop(bom.missingUnits)}`);
  console.log(`SKUs/productos sin BOM (top por ingresos):`);
  console.log(
    table(
      bom.missingSkus.slice(0, 20).map(s => ({
        producto: s.product.slice(0, 48),
        sku: s.sku || '—',
        variantId: s.variantId || '—',
        unidades: s.units,
        ingresos_cop: fmtCop(s.revenue),
        lineas: s.lines,
        ordenes: s.orders,
      })),
    ),
  );

  console.log('\n## Expense classification sanity (current year)');
  const allExp = await getJson<ExpenseRow[]>('/api/expenses');
  const yearExp = allExp.filter(e => (e.month ?? '').startsWith(`${YEAR}-`));
  const byCls = yearExp.reduce(
    (m, e) => {
      m[e.classification] = (m[e.classification] ?? 0) + (e.amount || 0);
      return m;
    },
    {} as Record<string, number>,
  );
  console.log(
    table(
      Object.entries(byCls).map(([cls, amt]) => ({
        clasificacion: cls,
        total_cop: fmtCop(amt),
        nota:
          cls === 'inventory' || cls === 'capex'
            ? 'excluido de gastos operativos'
            : cls === 'uncategorized'
              ? 'incluido en operativos pero alertado'
              : 'operativo',
      })),
    ),
  );

  console.log('\n## Reconciliation checks');
  for (const m of monthsThisYear) {
    const recomputedGross = m.income - m.cogs;
    const recomputedNet = recomputedGross - m.expenses;
    const grossOk = Math.abs(recomputedGross - m.grossProfit) < 1;
    const netOk = Math.abs(recomputedNet - m.profit) < 1;
    if (!grossOk || !netOk) {
      console.log(
        `! ${m.month}: gross or net mismatch (api gross=${m.grossProfit}, recomputed=${recomputedGross}; api net=${m.profit}, recomputed=${recomputedNet})`,
      );
    }
  }
  console.log('Done.');
}

main().catch(err => {
  console.error('qa-reconcile failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
