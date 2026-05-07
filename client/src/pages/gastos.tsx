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
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import type { MonthlyRow, Expense } from '@shared/schema';
import { formatCOP, formatCOPCompact, formatDate } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Receipt, TrendingDown, TrendingUp, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const RECURRENT_SELLERS = [
  'Shopify',
  'Perplexity',
  'Discord',
  'Hau',
  'Floraplex',
  'Amazon',
  'Material Manager',
  'Mercado Pago',
  'Envía',
  'Servientrega',
  'Otro',
];

function parseAmountInput(value: string) {
  return Number(value.replace(/[^\d]/g, '') || 0);
}

function formatAmountInput(value: string) {
  const parsed = parseAmountInput(value);
  return parsed ? parsed.toLocaleString('en-US') : '';
}

export default function Gastos() {
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
  const expenses = useQuery<Expense[]>({ queryKey: ['/api/expenses'] });
  const [draft, setDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'Inventario',
    description: '',
    paidTo: 'Shopify',
    paidToOther: '',
    paidWith: 'Bancolombia',
    currency: 'COP' as 'COP' | 'USD',
    amount: '',
    originalAmount: '',
    fxRate: '',
  });

  const totalIncome = 94_107_261;
  const allExpenses = useMemo(() => expenses.data ?? [], [expenses.data]);
  const manualExpenses = useMemo(() => allExpenses.filter(e => e.source === 'manual'), [allExpenses]);
  const manualTotal = manualExpenses.reduce((s, e) => s + e.amount, 0);
  const totalExpenses = 92_090_654 + manualTotal;
  const totalProfit = totalIncome - totalExpenses;
  const monthsWithManual = useMemo(() => {
    const byMonth = new Map<string, number>();
    manualExpenses.forEach(expense => byMonth.set(expense.month, (byMonth.get(expense.month) ?? 0) + expense.amount));
    const base = (months.data ?? []).map(month => {
      const extra = byMonth.get(month.month) ?? 0;
      return extra > 0
        ? { ...month, expenses: month.expenses + extra, profit: month.profit - extra, note: `${month.note ?? ''} + gastos manuales guardados`.trim() }
        : month;
    });
    const existing = new Set(base.map(month => month.month));
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
  const lossMonths = monthsWithManual.filter(month => month.profit < 0).length;
  const sellerOptions = useMemo(() => {
    const saved = manualExpenses
      .map(expense => expense.paidTo)
      .filter((seller): seller is string => Boolean(seller))
      .filter(seller => !RECURRENT_SELLERS.includes(seller));
    return [...RECURRENT_SELLERS.slice(0, -1), ...Array.from(new Set(saved)), 'Otro'];
  }, [manualExpenses]);

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
      setDraft(prev => ({ ...prev, description: '', paidToOther: '', amount: '', originalAmount: '', fxRate: '' }));
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/expenses/${id}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/expenses'] }),
  });

  function addExpense(e: FormEvent) {
    e.preventDefault();
    const amount = parseAmountInput(draft.amount);
    if (!draft.date || !draft.description.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const originalAmount = draft.currency === 'USD' ? parseAmountInput(draft.originalAmount || draft.amount) : amount;
    const fxRate = draft.currency === 'USD' ? parseAmountInput(draft.fxRate || '0') : undefined;
    const paidTo = draft.paidTo === 'Otro' ? draft.paidToOther.trim() : draft.paidTo;
    createExpense.mutate({
      date: draft.date,
      category: draft.category,
      description: draft.description.trim(),
      amount,
      paidTo: paidTo || 'Sin proveedor',
      paidWith: draft.paidWith,
      currency: draft.currency,
      originalAmount,
      fxRate,
    });
  }

  return (
    <Layout title="Gastos & Contabilidad" subtitle="Resumen mensual desde la hoja contable · Shopify cubre fees, refunds y envíos">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos totales" value={formatCOP(totalIncome)} icon={TrendingUp} emphasis="emerald" testId="kpi-gastos-ingresos" />
        <KpiCard label="Gastos totales" value={formatCOP(totalExpenses)} icon={Receipt} testId="kpi-gastos-totales" />
        <KpiCard label="Utilidad" value={formatCOP(totalProfit)} icon={totalProfit >= 0 ? TrendingUp : TrendingDown} emphasis="gold" testId="kpi-gastos-utilidad" />
        <KpiCard label="Meses con pérdida" value={`${lossMonths} / ${monthsWithManual.length || 5}`} icon={AlertTriangle} testId="kpi-meses-perdida" hint="Incluye manuales guardados" />
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-add-expense">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Agregar gasto manual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Guarda gastos manuales en SQLite del prototipo. Luego se reconciliarán con Shopify, bancos y contabilidad.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Persistente pre-API</Badge>
          </div>
          <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[140px_150px_180px_1fr_150px_120px_170px_auto] gap-3 items-end">
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
                {['Inventario', 'Marketing', 'Logística', 'Comisiones', 'Operación', 'Impuestos', 'Muestras', 'Reposiciones', 'Software', 'Otros'].map(c => (
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
                {['Bancolombia', 'Nequi', 'Nu crédito', 'Nu débito', 'Daviplata', 'Tarjeta crédito', 'Tarjeta débito', 'Efectivo', 'PayPal', 'Wise', 'Cripto', 'Otro'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Monto COP</span>
              <Input
                type="text"
                inputMode="numeric"
                value={draft.amount}
                onChange={e => setDraft(prev => ({ ...prev, amount: formatAmountInput(e.target.value) }))}
                placeholder="0"
                className="text-right tabular pr-4"
                data-testid="input-expense-amount"
              />
            </label>
            {draft.currency === 'USD' && (
              <>
                <label className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Monto USD</span>
                  <Input
                    type="text"
                    inputMode="numeric"
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
                    inputMode="numeric"
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
          {manualExpenses.length > 0 && (
            <p className="text-xs text-emerald-300 mt-3" data-testid="text-manual-expense-count">
              {manualExpenses.length} gasto(s) manual(es) guardados: {formatCOP(manualTotal)}
            </p>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-monthly-pl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">P&L mensual 2026</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ingresos, gastos y utilidad por mes</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Sheet contable</Badge>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthsWithManual} margin={{ left: -8, right: 8, top: 8 }}>
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
                <Bar dataKey="expenses" name="Gastos" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Utilidad" stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-monthly-table">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Resumen mensual</h2>
            <Badge variant="outline" className="text-[11px]">{monthsWithManual.length || 5} meses</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Gastos</TableHead>
                <TableHead className="text-right">Utilidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthsWithManual.map(m => (
                <TableRow key={m.month} data-testid={`row-month-${m.month}`}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-right tabular" data-testid={`text-month-income-${m.month}`}>{formatCOP(m.income)}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(m.expenses)}</TableCell>
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
                <TableCell className="text-right font-semibold tabular text-emerald-400" data-testid="text-total-profit">{formatCOP(totalProfit)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-expense-detail">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Detalle de gastos</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Origen: Shopify (fees, envíos) · Sheet (inventario, marketing, operación)</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Pagado a</TableHead>
                <TableHead>Pagado con</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allExpenses.map(e => (
                <TableRow key={e.id} data-testid={`row-expense-${e.id}`}>
                  <TableCell className="text-sm tabular">{formatDate(e.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10.5px]">{e.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell className="text-sm">{e.paidTo ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.paidWith ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={e.source === 'shopify' ? 'default' : e.source === 'manual' ? 'outline' : 'secondary'} className="text-[10px] uppercase tracking-wide">
                      {e.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular">
                    {e.currency ?? 'COP'}
                    {e.currency === 'USD' && e.fxRate ? <span className="text-muted-foreground"> · TRM {e.fxRate}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular">{formatCOP(e.amount)}</TableCell>
                  <TableCell className="text-right">
                    {e.source === 'manual' ? (
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
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </Layout>
  );
}
