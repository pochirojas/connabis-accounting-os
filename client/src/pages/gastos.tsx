import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import type { MonthlyRow, Expense, ExpenseBrand, DocumentType } from '@shared/schema';
import { EXPENSE_BRAND_LABELS, EXPENSE_STATUS_LABELS } from '@shared/schema';
import { BRAND_OPTIONS, CATEGORY_OPTIONS, DOCUMENT_OPTIONS, PAID_WITH_OPTIONS } from '@/lib/expense-options';
import { ExpenseEditorDialog } from '@/components/expenses/expense-editor-dialog';
import { ExpenseReviewQueue } from '@/components/expenses/expense-review-queue';
import { DiscordImportPanel } from '@/components/expenses/discord-import-panel';
import { formatCOP, formatCOPCompact, formatDate } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Receipt, TrendingDown, TrendingUp, AlertTriangle, Plus, Trash2, Pencil, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { sortByDate, sortByMonth, type ChartSortOrder } from '@/lib/chart-sort';

const RECURRENT_SELLERS = [
  'Shopify',
  'Perplexity',
  'Discord',
  'HAU',
  'Floraplex',
  'MC',
  'Gilded Extracts',
  'Amazon',
  'Imprenta',
  'Material Manager',
  'Mercado Pago',
  'Envía',
  'Servientrega',
  'Otro',
];

// Allow digits, a single decimal separator, and preserve a trailing dot (e.g. "123.")
// while the user is typing. Returns the raw string sanitized — formatting with
// thousand separators is intentionally avoided so the controlled input doesn't
// fight the user on every keystroke and so decimals round-trip cleanly.
function sanitizeAmountInput(value: string) {
  const cleaned = value.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

function parseAmountInput(value: string) {
  if (typeof value !== 'string') return Number(value) || 0;
  const sanitized = sanitizeAmountInput(value);
  if (!sanitized || sanitized === '.') return 0;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountInput(value: string) {
  return sanitizeAmountInput(value);
}

type ExpenseDraft = {
  date: string;
  category: string;
  description: string;
  paidTo: string;
  paidToOther: string;
  paidWith: string;
  currency: 'COP' | 'USD';
  amount: string;
  originalAmount: string;
  fxRate: string;
  notes: string;
  brand: ExpenseBrand | '';
  documentType: DocumentType | '';
};

const PIE_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
  'hsl(160 60% 45%)', 'hsl(45 90% 55%)', 'hsl(0 70% 55%)',
];

// Historic rows often have blank / "No especificado" paidWith. Display-only: prefer
// "Nequi" for those, since every new flow is Nequi or Nu Crédito. We do NOT rewrite
// the underlying record — historic non-blank values (e.g. "Cash", "Credit card") are
// shown verbatim so we don't lose data.
function displayPaidWith(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return 'Nequi';
  if (raw.toLowerCase() === 'no especificado') return 'Nequi';
  return raw;
}

export default function Gastos() {
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
  const expenses = useQuery<Expense[]>({ queryKey: ['/api/expenses'] });
  const [draft, setDraft] = useState<ExpenseDraft>({
    date: new Date().toISOString().slice(0, 10),
    category: 'Operación',
    description: '',
    paidTo: 'Shopify',
    paidToOther: '',
    paidWith: 'Nequi',
    currency: 'COP' as 'COP' | 'USD',
    amount: '',
    originalAmount: '',
    fxRate: '',
    notes: '',
    brand: '',
    documentType: '',
  });
  const [editorExpense, setEditorExpense] = useState<Expense | null>(null);
  const [exportMonth, setExportMonth] = useState('all');
  const [exportYear, setExportYear] = useState('all');
  const [monthlySort, setMonthlySort] = useState<ChartSortOrder>('oldest');
  const [monthlyTableSort, setMonthlyTableSort] = useState<ChartSortOrder>('newest');
  const [expenseDetailSort, setExpenseDetailSort] = useState<ChartSortOrder>('newest');
  // Detalle de gastos: collapsed shows only the latest 5; expanded paginates the full list.
  const [expenseDetailCollapsed, setExpenseDetailCollapsed] = useState(true);
  const [expenseDetailPageSize, setExpenseDetailPageSize] = useState<number>(25);
  const [expenseDetailPage, setExpenseDetailPage] = useState<number>(1);
  const [expenseDetailFilterYear, setExpenseDetailFilterYear] = useState<string>('all');
  const [expenseDetailSearch, setExpenseDetailSearch] = useState<string>('');
  const [analyticsScope, setAnalyticsScope] = useState<'operating' | 'all'>('operating');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const allExpenses = useMemo(() => expenses.data ?? [], [expenses.data]);
  const manualExpenses = useMemo(() => allExpenses.filter(e => e.source === 'manual'), [allExpenses]);
  const manualTotal = manualExpenses.reduce((s, e) => s + e.amount, 0);
  const monthsWithManual = useMemo(() => {
    const base = [...(months.data ?? [])];
    const existing = new Set(base.map(month => month.month));
    const byMonth = new Map<string, number>();
    manualExpenses.forEach(expense => byMonth.set(expense.month, (byMonth.get(expense.month) ?? 0) + expense.amount));
    byMonth.forEach((amount, month) => {
      if (!existing.has(month)) {
        base.push({
          month,
          label: new Date(`${month}-02T00:00:00`).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }),
          income: 0,
          expenses: amount,
          profit: -amount,
          partial: true,
          note: 'Mes creado por gasto manual pre-API',
        });
      }
    });
    return base.sort((a, b) => a.month.localeCompare(b.month));
  }, [manualExpenses, months.data]);
  const totalIncome = monthsWithManual.reduce((sum, month) => sum + month.income, 0);
  const totalExpenses = monthsWithManual.reduce((sum, month) => sum + month.expenses, 0);
  const totalInventoryCapex = monthsWithManual.reduce((sum, month) => sum + (month.inventoryPurchasesExcluded ?? 0), 0);
  const totalProfit = monthsWithManual.reduce((sum, month) => sum + month.profit, 0);
  const lossMonths = monthsWithManual.filter(month => month.profit < 0).length;
  const monthOptions = monthsWithManual.map(month => month.month).sort().reverse();
  const yearOptions = Array.from(new Set(monthOptions.map(month => month.slice(0, 4)))).sort().reverse();
  const monthlyChartRows = useMemo(() => sortByMonth(monthsWithManual, monthlySort), [monthsWithManual, monthlySort]);
  const monthlyTableRows = useMemo(() => sortByMonth(monthsWithManual, monthlyTableSort), [monthsWithManual, monthlyTableSort]);
  const isOperating = (e: Expense) => {
    const c = e.classification ?? 'operating';
    return c !== 'inventory' && c !== 'capex';
  };
  const scopedExpenses = useMemo(() => (
    analyticsScope === 'operating' ? allExpenses.filter(isOperating) : allExpenses
  ), [allExpenses, analyticsScope]);
  const providerOptions = useMemo(() => Array.from(new Set(scopedExpenses.map(e => e.paidTo).filter((v): v is string => Boolean(v)))).sort(), [scopedExpenses]);
  const categoryOptions = useMemo(() => Array.from(new Set(scopedExpenses.map(e => e.category).filter(Boolean))).sort(), [scopedExpenses]);
  const monthOptionsAnalytics = useMemo(() => Array.from(new Set(scopedExpenses.map(e => e.month))).sort().reverse(), [scopedExpenses]);
  const yearOptionsAnalytics = useMemo(() => Array.from(new Set(scopedExpenses.map(e => (e.month ?? '').slice(0, 4)).filter(Boolean))).sort().reverse(), [scopedExpenses]);

  const filteredScoped = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return scopedExpenses.filter(e => {
      if (filterProvider !== 'all' && (e.paidTo ?? '') !== filterProvider) return false;
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;
      if (filterMonth !== 'all' && e.month !== filterMonth) return false;
      if (filterYear !== 'all' && (e.month ?? '').slice(0, 4) !== filterYear) return false;
      if (term) {
        const blob = `${e.description} ${e.paidTo ?? ''} ${e.category} ${e.notes ?? ''}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      return true;
    });
  }, [scopedExpenses, filterProvider, filterCategory, filterMonth, filterYear, searchTerm]);
  const filteredTotal = filteredScoped.reduce((s, e) => s + e.amount, 0);

  // Average operating expense for the active filter. Two interpretations:
  //   - "promedio por mes con gasto": total / months that actually have an expense in the filter
  //   - "promedio mensual calendario": total / number of calendar months covered by the filter
  // We show both so the user can interpret without ambiguity. We force operating scope here
  // because mixing inventory/capex into an "operating average" would be misleading.
  const operatingFilteredScoped = useMemo(
    () => filteredScoped.filter(isOperating),
    [filteredScoped],
  );
  const operatingAverages = useMemo(() => {
    const total = operatingFilteredScoped.reduce((s, e) => s + e.amount, 0);
    const monthsWithExpense = new Set(operatingFilteredScoped.map(e => e.month).filter(Boolean));
    const activeMonths = monthsWithExpense.size;
    // Calendar-month denominator: if a year/month filter is active, derive from it; otherwise
    // span first → last month observed (inclusive). Falls back to active months to avoid /0.
    let calendarMonths = activeMonths;
    if (filterMonth !== 'all') {
      calendarMonths = 1;
    } else if (filterYear !== 'all') {
      const now = new Date();
      const currentYear = String(now.getFullYear());
      calendarMonths = filterYear === currentYear ? now.getMonth() + 1 : 12;
    } else if (monthsWithExpense.size > 0) {
      const sorted = Array.from(monthsWithExpense).sort();
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const [fy, fm] = first.split('-').map(Number);
      const [ly, lm] = last.split('-').map(Number);
      calendarMonths = (ly - fy) * 12 + (lm - fm) + 1;
    }
    return {
      total,
      activeMonths,
      calendarMonths: Math.max(1, calendarMonths),
      perActiveMonth: activeMonths > 0 ? total / activeMonths : 0,
      perCalendarMonth: Math.max(1, calendarMonths) > 0 ? total / Math.max(1, calendarMonths) : 0,
    };
  }, [operatingFilteredScoped, filterMonth, filterYear]);

  const byProvider = useMemo(() => {
    const map = new Map<string, number>();
    filteredScoped.forEach(e => {
      const key = e.paidTo || 'Sin proveedor';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, share: filteredTotal > 0 ? amount / filteredTotal : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredScoped, filteredTotal]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredScoped.forEach(e => {
      const key = e.category || 'Sin categoría';
      map.set(key, (map.get(key) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, share: filteredTotal > 0 ? amount / filteredTotal : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredScoped, filteredTotal]);

  // Monthly breakdown rows for the table: month × category × provider × amount.
  const monthlyBreakdownRows = useMemo(() => {
    const map = new Map<string, { month: string; category: string; provider: string; amount: number }>();
    filteredScoped.forEach(e => {
      const provider = e.paidTo || 'Sin proveedor';
      const category = e.category || 'Sin categoría';
      const key = `${e.month}|${category}|${provider}`;
      const cur = map.get(key);
      if (cur) cur.amount += e.amount;
      else map.set(key, { month: e.month, category, provider, amount: e.amount });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return b.amount - a.amount;
    });
  }, [filteredScoped]);

  const expenseDetailRows = useMemo(() => sortByDate(allExpenses, expenseDetailSort), [allExpenses, expenseDetailSort]);
  const expenseDetailYearOptions = useMemo(
    () => Array.from(new Set(allExpenses.map(e => (e.date ?? '').slice(0, 4)).filter(Boolean))).sort().reverse(),
    [allExpenses],
  );
  const expenseDetailFiltered = useMemo(() => {
    const term = expenseDetailSearch.trim().toLowerCase();
    return expenseDetailRows.filter(e => {
      if (expenseDetailFilterYear !== 'all' && (e.date ?? '').slice(0, 4) !== expenseDetailFilterYear) return false;
      if (term) {
        const blob = `${e.description} ${e.paidTo ?? ''} ${e.category} ${e.paidWith ?? ''} ${e.paidBy ?? ''} ${e.notes ?? ''}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      return true;
    });
  }, [expenseDetailRows, expenseDetailFilterYear, expenseDetailSearch]);
  const expenseDetailTotalCount = expenseDetailFiltered.length;
  const expenseDetailTotalPages = expenseDetailCollapsed
    ? 1
    : Math.max(1, Math.ceil(expenseDetailTotalCount / Math.max(1, expenseDetailPageSize)));
  const expenseDetailCurrentPage = Math.min(expenseDetailPage, expenseDetailTotalPages);
  const expenseDetailDisplayRows = useMemo(() => {
    if (expenseDetailCollapsed) return expenseDetailFiltered.slice(0, 5);
    const start = (expenseDetailCurrentPage - 1) * expenseDetailPageSize;
    return expenseDetailFiltered.slice(start, start + expenseDetailPageSize);
  }, [expenseDetailFiltered, expenseDetailCollapsed, expenseDetailCurrentPage, expenseDetailPageSize]);
  const sellerOptions = useMemo(() => {
    const normalizeSeller = (seller: string) => seller.trim();
    const knownLower = new Set(RECURRENT_SELLERS.map(s => s.toLowerCase()));
    const saved = allExpenses
      .map(expense => normalizeSeller(expense.paidTo ?? ''))
      .filter(seller => seller.length > 0 && seller !== 'Sin proveedor')
      .filter(seller => !knownLower.has(seller.toLowerCase()));
    const seen = new Set<string>();
    const deduped: string[] = [];
    saved.forEach(seller => {
      const key = seller.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(seller);
    });
    deduped.sort((a, b) => a.localeCompare(b, 'es'));
    return [...RECURRENT_SELLERS.slice(0, -1), ...deduped, 'Otro'];
  }, [allExpenses]);

  const createExpense = useMutation({
    mutationFn: async (payload: {
      date: string;
      category: string;
      description: string;
      amount: number;
      paidTo?: string;
      paidWith?: string;
      currency: 'COP' | 'USD';
      originalAmount?: number;
      fxRate?: number;
    }) => (await apiRequest('POST', '/api/expenses', payload)).json() as Promise<Expense>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/months'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kpis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-flow'] });
      setDraft(prev => ({ ...prev, description: '', paidToOther: '', amount: '', originalAmount: '', fxRate: '', notes: '' }));
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/expenses/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/months'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kpis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-flow'] });
    },
  });

  function addExpense(e: FormEvent) {
    e.preventDefault();
    const payload = buildExpensePayload(draft);
    if (!payload) return;
    createExpense.mutate(payload);
  }

  function buildExpensePayload(source: ExpenseDraft) {
    const copAmount = parseAmountInput(source.amount);
    const originalAmount = source.currency === 'USD' ? parseAmountInput(source.originalAmount || source.amount) : copAmount;
    const fxRate = source.currency === 'USD' ? parseAmountInput(source.fxRate || '0') : undefined;
    const amount = source.currency === 'USD' ? originalAmount * (fxRate ?? 0) : copAmount;
    if (!source.date || !source.category || !source.description.trim() || !Number.isFinite(amount) || amount <= 0) return null;
    if (source.currency === 'USD' && (!fxRate || fxRate <= 0 || !originalAmount)) return null;
    const paidTo = source.paidTo === 'Otro' ? source.paidToOther.trim() : source.paidTo;
    return {
      date: source.date,
      category: source.category,
      description: source.description.trim(),
      amount,
      paidTo: paidTo || 'Sin proveedor',
      paidWith: source.paidWith,
      currency: source.currency,
      originalAmount,
      fxRate,
      notes: source.notes.trim() || undefined,
      brand: source.brand || undefined,
      documentType: source.documentType || undefined,
    };
  }

  function startEdit(expense: Expense) {
    setEditorExpense(expense);
  }

  async function downloadExpensesCsv(scope: 'month' | 'year' | 'all') {
    const query = scope === 'month' && exportMonth !== 'all'
      ? `?month=${exportMonth}`
      : scope === 'year' && exportYear !== 'all'
      ? `?year=${exportYear}`
      : '';
    const response = await apiRequest('GET', `/api/export/expenses.csv${query}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `connabis-gastos-${scope === 'month' && exportMonth !== 'all' ? exportMonth : scope === 'year' && exportYear !== 'all' ? exportYear : 'all-time'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout title="Gastos & Contabilidad" subtitle="Ingresos desde Shopify · gastos revisados (históricos del sheet + nuevos). Lo capturado espera en Por revisar.">
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Ingresos totales" value={formatCOP(totalIncome)} icon={TrendingUp} emphasis="emerald" testId="kpi-gastos-ingresos" />
        <KpiCard label="Gastos operativos" value={formatCOP(totalExpenses)} icon={Receipt} testId="kpi-gastos-totales" hint="Operating + sin categoría" />
        <KpiCard label="Inventario / Capex" value={formatCOP(totalInventoryCapex)} icon={Receipt} testId="kpi-gastos-inventory-capex" hint="Visible, excluido del P&L operativo" />
        <KpiCard label="Utilidad neta" value={formatCOP(totalProfit)} icon={totalProfit >= 0 ? TrendingUp : TrendingDown} emphasis="gold" testId="kpi-gastos-utilidad" />
        <KpiCard label="Meses con pérdida" value={`${lossMonths} / ${monthsWithManual.length || 5}`} icon={AlertTriangle} testId="kpi-meses-perdida" hint="Incluye manuales guardados" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ExpenseReviewQueue />
        <DiscordImportPanel />
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-monthly-pl">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">P&L mensual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ingresos Shopify live contra Expenses sheet + manuales</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={monthlySort}
                onChange={e => setMonthlySort(e.target.value as ChartSortOrder)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-expense-chart-sort"
              >
                <option value="oldest">Viejo → nuevo</option>
                <option value="newest">Nuevo → viejo</option>
              </select>
              <Badge variant="outline" className="text-[11px]">Expenses sheet</Badge>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyChartRows} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatCOP(v)}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Ingresos" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos operativos" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="inventoryPurchasesExcluded" name="Inventario/Capex excluido" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Utilidad" stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-add-expense">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Agregar gasto manual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Formulario completo (queda como revisado). Para algo rápido desde el celular usa "Capturar gasto".
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Manual nuevo</Badge>
          </div>
          <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Fecha</span>
              <Input
                type="date"
                value={draft.date}
                onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))}
                data-testid="input-expense-date"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Categoría</span>
              <select
                value={draft.category}
                onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-category"
              >
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">A quién</span>
              <select
                value={draft.paidTo}
                onChange={e => setDraft(prev => ({ ...prev, paidTo: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-paid-to"
              >
                {sellerOptions.map(seller => <option key={seller} value={seller}>{seller}</option>)}
              </select>
            </label>
            {draft.paidTo === 'Otro' && (
              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Nuevo seller</span>
                <Input
                  value={draft.paidToOther}
                  onChange={e => setDraft(prev => ({ ...prev, paidToOther: e.target.value }))}
                  placeholder="Nombre del proveedor"
                  data-testid="input-expense-paid-to-other"
                />
              </label>
            )}
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Descripción</span>
              <Input
                value={draft.description}
                onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ej: etiquetas lote junio, envío proveedor, pauta..."
                data-testid="input-expense-description"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Con qué se pagó</span>
              <select
                value={draft.paidWith}
                onChange={e => setDraft(prev => ({ ...prev, paidWith: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-paid-with"
              >
                {PAID_WITH_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Marca</span>
              <select
                value={draft.brand}
                onChange={e => setDraft(prev => ({ ...prev, brand: e.target.value as ExpenseBrand | '' }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-brand"
              >
                <option value="">— Elegir —</option>
                {BRAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Soporte</span>
              <select
                value={draft.documentType}
                onChange={e => setDraft(prev => ({ ...prev, documentType: e.target.value as DocumentType | '' }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-document-type"
              >
                <option value="">— Elegir —</option>
                {DOCUMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Moneda</span>
              <select
                value={draft.currency}
                onChange={e => setDraft(prev => ({ ...prev, currency: e.target.value as 'COP' | 'USD' }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-expense-currency"
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{draft.currency === 'USD' ? 'Monto COP calculado' : 'Monto COP'}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={draft.currency === 'USD' && draft.originalAmount && draft.fxRate ? formatAmountInput(String(parseAmountInput(draft.originalAmount) * parseAmountInput(draft.fxRate))) : draft.amount}
                onChange={e => setDraft(prev => ({ ...prev, amount: formatAmountInput(e.target.value) }))}
                placeholder="0"
                className="text-right tabular pr-4"
                disabled={draft.currency === 'USD'}
                data-testid="input-expense-amount"
              />
            </label>
            {draft.currency === 'USD' && (
              <>
                <label className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Monto USD</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft.originalAmount}
                    onChange={e => setDraft(prev => ({ ...prev, originalAmount: formatAmountInput(e.target.value) }))}
                    className="text-right tabular pr-4"
                    data-testid="input-expense-original-amount"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">TRM</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft.fxRate}
                    onChange={e => setDraft(prev => ({ ...prev, fxRate: formatAmountInput(e.target.value) }))}
                    className="text-right tabular pr-4"
                    data-testid="input-expense-fx-rate"
                  />
                </label>
              </>
            )}
            <Button type="submit" className="gap-2" data-testid="button-add-expense" disabled={createExpense.isPending}>
              <Plus className="h-4 w-4" />
              {createExpense.isPending ? 'Guardando' : 'Agregar'}
            </Button>
          </form>
          <label className="mt-3 block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Notas</span>
            <Input
              value={draft.notes}
              onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas contables opcionales"
              data-testid="input-expense-notes"
            />
          </label>
          {manualExpenses.length > 0 && (
            <p className="text-xs text-emerald-300 mt-3" data-testid="text-manual-expense-count">
              {manualExpenses.length} gasto(s) manual(es) guardados: {formatCOP(manualTotal)}
            </p>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-expense-detail">
          <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Detalle de gastos</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Origen actual: Expenses sheet histórico + gastos manuales nuevos. Seed queda fuera de totales.
                {expenseDetailCollapsed
                  ? ` Mostrando los últimos 5 de ${expenseDetailTotalCount}.`
                  : ` ${expenseDetailTotalCount} gastos en el filtro actual.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={expenseDetailSearch}
                onChange={e => { setExpenseDetailSearch(e.target.value); setExpenseDetailPage(1); }}
                placeholder="Buscar…"
                className="h-9 w-44 text-xs"
                data-testid="input-expense-detail-search"
              />
              <select
                value={expenseDetailFilterYear}
                onChange={e => { setExpenseDetailFilterYear(e.target.value); setExpenseDetailPage(1); }}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-expense-detail-year"
              >
                <option value="all">Todos los años</option>
                {expenseDetailYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <select
                value={expenseDetailSort}
                onChange={e => setExpenseDetailSort(e.target.value as ChartSortOrder)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-expense-detail-sort"
              >
                <option value="newest">Nuevo → viejo</option>
                <option value="oldest">Viejo → nuevo</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setExpenseDetailCollapsed(prev => !prev); setExpenseDetailPage(1); }}
                data-testid="button-toggle-expense-detail-collapse"
              >
                {expenseDetailCollapsed ? 'Ver todos' : 'Colapsar a últimos 5'}
              </Button>
            </div>
          </div>
          <ExpenseEditorDialog expense={editorExpense} onClose={() => setEditorExpense(null)} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Pagado a</TableHead>
                  <TableHead>Pagado con</TableHead>
                  <TableHead>Pagado por</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Tipo P&L</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseDetailDisplayRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-4">
                      Sin gastos para el filtro actual.
                    </TableCell>
                  </TableRow>
                )}
                {expenseDetailDisplayRows.map(e => (
                  <TableRow key={e.id} data-testid={`row-expense-${e.id}`}>
                    <TableCell className="text-sm tabular">{formatDate(e.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10.5px]">{e.category}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-sm">{e.paidTo ?? '—'}</TableCell>
                    <TableCell className="text-sm">{displayPaidWith(e.paidWith)}</TableCell>
                    <TableCell className="text-sm">{e.paidBy ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={e.source === 'shopify' ? 'default' : e.source === 'manual' ? 'outline' : 'secondary'} className="text-[10px] uppercase tracking-wide">
                        {e.source}
                      </Badge>
                      {e.brand ? <Badge variant="secondary" className="ml-1 text-[10px]">{EXPENSE_BRAND_LABELS[e.brand]}</Badge> : null}
                      {e.status === 'en_dataico' ? <Badge variant="outline" className="ml-1 text-[10px]">{EXPENSE_STATUS_LABELS.en_dataico}</Badge> : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wide ${
                          e.classification === 'inventory' || e.classification === 'capex'
                            ? 'border-sky-500/40 text-sky-300'
                            : e.classification === 'uncategorized'
                            ? 'border-amber-500/40 text-amber-300'
                            : 'border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {e.classification ?? 'operating'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular">
                      {e.currency ?? 'COP'}
                      {e.currency === 'USD' && e.fxRate ? <span className="text-muted-foreground"> · TRM {e.fxRate}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatCOP(e.amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(e)}
                          aria-label={`Editar ${e.description}`}
                          data-testid={`button-edit-expense-${e.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      {e.source !== 'sheet' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteExpense.mutate(e.id)}
                          disabled={deleteExpense.isPending}
                          aria-label={`Eliminar ${e.description}`}
                          data-testid={`button-delete-expense-${e.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        null
                      )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!expenseDetailCollapsed && expenseDetailTotalCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" data-testid="expense-detail-pagination">
              <div className="flex items-center gap-2">
                <span>Filas por página</span>
                <select
                  value={expenseDetailPageSize}
                  onChange={e => { setExpenseDetailPageSize(Number(e.target.value) || 25); setExpenseDetailPage(1); }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="select-expense-detail-page-size"
                >
                  {[5, 10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span data-testid="text-expense-detail-page-indicator">
                  Página {expenseDetailCurrentPage} de {expenseDetailTotalPages} · {expenseDetailTotalCount} gastos
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpenseDetailPage(p => Math.max(1, p - 1))}
                  disabled={expenseDetailCurrentPage <= 1}
                  aria-label="Página anterior"
                  data-testid="button-expense-detail-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpenseDetailPage(p => Math.min(expenseDetailTotalPages, p + 1))}
                  disabled={expenseDetailCurrentPage >= expenseDetailTotalPages}
                  aria-label="Página siguiente"
                  data-testid="button-expense-detail-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-monthly-table">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Resumen mensual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ingresos y gastos exportables por mes o año.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <select
                value={monthlyTableSort}
                onChange={e => setMonthlyTableSort(e.target.value as ChartSortOrder)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-monthly-summary-sort"
              >
                <option value="newest">Nuevo → viejo</option>
                <option value="oldest">Viejo → nuevo</option>
              </select>
              <select value={exportMonth} onChange={e => setExportMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs" data-testid="select-expense-export-month">
                <option value="all">Todos los meses</option>
                {monthOptions.map(month => <option key={month} value={month}>{month}</option>)}
              </select>
              <select value={exportYear} onChange={e => setExportYear(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs" data-testid="select-expense-export-year">
                <option value="all">Todos los años</option>
                {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadExpensesCsv('month')} disabled={exportMonth === 'all'} data-testid="button-export-expenses-month">Exportar mes</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadExpensesCsv('year')} disabled={exportYear === 'all'} data-testid="button-export-expenses-year">Exportar año</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadExpensesCsv('all')} data-testid="button-export-expenses-all">Exportar todo</Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Gastos operativos</TableHead>
                <TableHead className="text-right">Inventario/Capex</TableHead>
                <TableHead className="text-right">Utilidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyTableRows.map(m => (
                <TableRow key={m.month} data-testid={`row-month-${m.month}`}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-right tabular" data-testid={`text-month-income-${m.month}`}>{formatCOP(m.income)}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(m.expenses)}</TableCell>
                  <TableCell className="text-right tabular text-sky-300">{formatCOP(m.inventoryPurchasesExcluded ?? 0)}</TableCell>
                  <TableCell className={`text-right tabular font-medium ${m.profit < 0 ? 'text-rose-400' : 'text-emerald-400'}`} data-testid={`text-month-profit-${m.month}`}>
                    {formatCOP(m.profit)}
                  </TableCell>
                  <TableCell>
                    {m.partial
                      ? <Badge variant="outline" className="text-[10px]">Parcial</Badge>
                      : m.profit < 0
                      ? <Badge variant="destructive" className="text-[10px]">Pérdida</Badge>
                      : <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">OK</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px]">{m.note ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular" data-testid="text-total-income">{formatCOP(totalIncome)}</TableCell>
                <TableCell className="text-right font-semibold tabular" data-testid="text-total-expenses">{formatCOP(totalExpenses)}</TableCell>
                <TableCell className="text-right font-semibold tabular text-sky-300" data-testid="text-total-inventory-capex">{formatCOP(totalInventoryCapex)}</TableCell>
                <TableCell className="text-right font-semibold tabular text-emerald-400" data-testid="text-total-profit">{formatCOP(totalProfit)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-expense-analytics">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Análisis de gastos · dónde recortar</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mix por proveedor y categoría con filtros por mes/proveedor/categoría. Scope por defecto: gastos operativos (inventario/capex aparte). Cambia a "Todo" para ver inventario y capex también.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={analyticsScope}
                onChange={e => setAnalyticsScope(e.target.value as 'operating' | 'all')}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-analytics-scope"
              >
                <option value="operating">Solo operativos</option>
                <option value="all">Todo (operativos + inv/capex)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
            <label className="space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Buscar</span>
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Descripción, proveedor, categoría…"
                data-testid="input-expense-search"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Proveedor</span>
              <select
                value={filterProvider}
                onChange={e => setFilterProvider(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-filter-provider"
              >
                <option value="all">Todos</option>
                {providerOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Categoría</span>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-filter-category"
              >
                <option value="all">Todas</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Año</span>
              <select
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-filter-year"
              >
                <option value="all">Todos</option>
                {yearOptionsAnalytics.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Mes</span>
              <select
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-filter-month"
              >
                <option value="all">Todos</option>
                {monthOptionsAnalytics
                  .filter(m => filterYear === 'all' || m.slice(0, 4) === filterYear)
                  .map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="operating-average-summary">
            <div className="rounded-md border border-card-border bg-muted/20 p-3">
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Gasto operacional total (filtro)</p>
              <p className="text-sm font-semibold tabular mt-1" data-testid="text-operating-total">{formatCOP(operatingAverages.total)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {operatingAverages.activeMonths} mes(es) con gasto operativo
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[10.5px] uppercase tracking-wider text-emerald-200">Promedio por mes con gasto</p>
              <p className="text-sm font-semibold tabular mt-1 text-emerald-100" data-testid="text-operating-avg-active">
                {formatCOP(operatingAverages.perActiveMonth)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Total ÷ {operatingAverages.activeMonths || 0} mes(es) activos
              </p>
            </div>
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="text-[10.5px] uppercase tracking-wider text-sky-200">Promedio mensual calendario</p>
              <p className="text-sm font-semibold tabular mt-1 text-sky-100" data-testid="text-operating-avg-calendar">
                {formatCOP(operatingAverages.perCalendarMonth)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Total ÷ {operatingAverages.calendarMonths} mes(es) calendario
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div data-testid="analytics-by-provider">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold tracking-tight">% por proveedor</h3>
                <Badge variant="outline" className="text-[10px]">{byProvider.length} proveedores · {formatCOP(filteredTotal)}</Badge>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProvider.slice(0, 8)} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                      {byProvider.slice(0, 8).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => `${formatCOP(v)} · ${filteredTotal > 0 ? ((v / filteredTotal) * 100).toFixed(1) : '0.0'}%`}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProvider.slice(0, 12).map(row => (
                    <TableRow key={row.name} data-testid={`row-provider-${row.name}`}>
                      <TableCell className="text-[12.5px]">{row.name}</TableCell>
                      <TableCell className="text-right tabular text-[12px]">{formatCOP(row.amount)}</TableCell>
                      <TableCell className="text-right tabular text-[12px]">{(row.share * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div data-testid="analytics-by-category">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold tracking-tight">% por categoría</h3>
                <Badge variant="outline" className="text-[10px]">{byCategory.length} categorías</Badge>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                      {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => `${formatCOP(v)} · ${filteredTotal > 0 ? ((v / filteredTotal) * 100).toFixed(1) : '0.0'}%`}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory.map(row => (
                    <TableRow key={row.name} data-testid={`row-category-${row.name}`}>
                      <TableCell className="text-[12.5px]">{row.name}</TableCell>
                      <TableCell className="text-right tabular text-[12px]">{formatCOP(row.amount)}</TableCell>
                      <TableCell className="text-right tabular text-[12px]">{(row.share * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-sky-500/30 bg-sky-500/5 p-3" data-testid="note-shipping-benchmark">
            <h3 className="text-xs font-semibold tracking-tight text-sky-200">Logística · benchmark de envíos</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug">
              Shipping cobrado al cliente (orden estándar): <span className="text-foreground font-medium">16.000 COP</span>.
              Costo esperado por envío Envía: <span className="text-foreground font-medium">14.000–15.000 COP</span>.
              Contribución bruta esperada por envío Envía estándar: <span className="text-foreground font-medium">~1.000–2.000 COP</span> antes de cualquier fee adicional, devolución o reenvío.
              Comparar manualmente con recargas Envía/Skydropx y envíos Fedex en la tabla de Logística. No es un KPI calculado por orden: se mantiene como referencia estática hasta que haya tracking de costo por orden.
            </p>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold tracking-tight">Mes × Categoría × Proveedor</h3>
              <Badge variant="outline" className="text-[10px]">{monthlyBreakdownRows.length} filas</Badge>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">% del filtro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyBreakdownRows.map(row => (
                    <TableRow key={`${row.month}|${row.category}|${row.provider}`} data-testid={`row-breakdown-${row.month}-${row.category}-${row.provider}`}>
                      <TableCell className="text-[12px] tabular">{row.month}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10.5px]">{row.category}</Badge></TableCell>
                      <TableCell className="text-[12.5px]">{row.provider}</TableCell>
                      <TableCell className="text-right tabular text-[12.5px] font-semibold">{formatCOP(row.amount)}</TableCell>
                      <TableCell className="text-right tabular text-[11.5px] text-muted-foreground">{filteredTotal > 0 ? ((row.amount / filteredTotal) * 100).toFixed(1) : '0.0'}%</TableCell>
                    </TableRow>
                  ))}
                  {monthlyBreakdownRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">Sin gastos para el filtro actual.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </section>
    </Layout>
  );
}
