import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import type { DailyPerformance, MonthlyRow } from '@shared/schema';
import { formatCOP, formatCOPCompact, formatDate, formatNumber } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { CalendarDays, Crown, Package, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sortByDate, type ChartSortOrder } from '@/lib/chart-sort';

export default function Performance() {
  const daily = useQuery<DailyPerformance[]>({ queryKey: ['/api/daily-performance'] });
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
  const [selectedMonth, setSelectedMonth] = useState('2026-04');
  const [compareMonth, setCompareMonth] = useState('2026-03');
  const [dailyChartSort, setDailyChartSort] = useState<ChartSortOrder>('oldest');

  const rows = useMemo(
    () => (daily.data ?? []).filter(r => r.month === selectedMonth).sort((a, b) => a.date.localeCompare(b.date)),
    [daily.data, selectedMonth],
  );
  const dailyChartRows = useMemo(() => sortByDate(rows, dailyChartSort), [rows, dailyChartSort]);
  const month = (months.data ?? []).find(m => m.month === selectedMonth);
  const bestDay = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.revenue > best.revenue ? row : best, undefined);
  const bestProfitDay = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.profit > best.profit ? row : best, undefined);
  const topProduct = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.topProductRevenue > best.topProductRevenue ? row : best, undefined);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const aov = orders ? revenue / orders : 0;
  const compare = useMemo(() => {
    const summarize = (monthId: string) => {
      const monthRows = (daily.data ?? []).filter(r => r.month === monthId);
      const monthly = (months.data ?? []).find(m => m.month === monthId);
      const monthOrders = monthRows.reduce((s, r) => s + r.orders, 0);
      const monthRevenue = monthly?.income ?? monthRows.reduce((s, r) => s + r.revenue, 0);
      const monthExpenses = monthly?.expenses ?? monthRows.reduce((s, r) => s + r.expenses, 0);
      const monthProfit = monthly?.profit ?? monthRows.reduce((s, r) => s + r.profit, 0);
      const monthBestDay = monthRows.reduce<DailyPerformance | undefined>((best, row) => !best || row.revenue > best.revenue ? row : best, undefined);
      const monthTopProduct = monthRows.reduce<DailyPerformance | undefined>((best, row) => !best || row.topProductRevenue > best.topProductRevenue ? row : best, undefined);
      return {
        id: monthId,
        label: monthly?.label ?? monthId,
        income: monthRevenue,
        expenses: monthExpenses,
        profit: monthProfit,
        orders: monthOrders,
        aov: monthOrders ? monthRows.reduce((s, r) => s + r.revenue, 0) / monthOrders : 0,
        bestDay: monthBestDay,
        topProduct: monthTopProduct,
      };
    };
    return { current: summarize(selectedMonth), base: summarize(compareMonth) };
  }, [daily.data, months.data, selectedMonth, compareMonth]);

  const delta = {
    income: compare.current.income - compare.base.income,
    expenses: compare.current.expenses - compare.base.expenses,
    profit: compare.current.profit - compare.base.profit,
    orders: compare.current.orders - compare.base.orders,
    aov: compare.current.aov - compare.base.aov,
  };

  return (
    <Layout
      title="Performance mensual"
      subtitle="Drilldown por mes, día y producto ganador · seed hasta conectar Shopify Orders"
    >
      <section className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-month-selector">
          <h2 className="text-sm font-semibold tracking-tight">Seleccionar mes</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Con Shopify live, aquí aparecerán todos los meses y cada día con ventas reales.
          </p>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-performance-month"
          >
            {(months.data ?? []).map(m => (
              <option key={m.month} value={m.month}>{m.label}</option>
            ))}
          </select>
          {month && (
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Ingresos del mes" value={formatCOP(month.income)} />
              <Row label="Gastos del mes" value={formatCOP(month.expenses)} />
              <Row label="Utilidad del mes" value={formatCOP(month.profit)} valueClass={month.profit < 0 ? 'text-rose-300' : 'text-emerald-300'} />
              {month.note && <p className="text-xs text-muted-foreground leading-relaxed pt-2">{month.note}</p>}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Días con data" value={formatNumber(rows.length)} icon={CalendarDays} testId="kpi-days-with-data" />
          <KpiCard label="Mejor día ventas" value={bestDay ? formatDate(bestDay.date) : '—'} icon={Crown} emphasis="gold" testId="kpi-best-day" hint={bestDay ? formatCOP(bestDay.revenue) : undefined} />
          <KpiCard label="AOV diario" value={formatCOP(aov)} icon={TrendingUp} testId="kpi-performance-aov" />
          <KpiCard label="Producto ganador" value={topProduct?.topProductUnits ? `${topProduct.topProductUnits} u` : '—'} icon={Package} testId="kpi-top-product-day" hint={topProduct?.topProduct} />
        </div>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-month-comparison">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Comparar meses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compara el mes seleccionado contra otro mes para ver variación de ingresos, gastos, utilidad, órdenes, AOV y producto ganador.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-compare-current-month"
              >
                {(months.data ?? []).map(m => <option key={m.month} value={m.month}>{m.label}</option>)}
              </select>
              <span className="self-center text-xs text-muted-foreground">vs</span>
              <select
                value={compareMonth}
                onChange={e => setCompareMonth(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-compare-base-month"
              >
                {(months.data ?? []).map(m => <option key={m.month} value={m.month}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
            <CompareMetric label="Ingresos" current={formatCOP(compare.current.income)} base={formatCOP(compare.base.income)} delta={formatCOP(delta.income)} good={delta.income >= 0} />
            <CompareMetric label="Gastos" current={formatCOP(compare.current.expenses)} base={formatCOP(compare.base.expenses)} delta={formatCOP(delta.expenses)} good={delta.expenses <= 0} />
            <CompareMetric label="Utilidad" current={formatCOP(compare.current.profit)} base={formatCOP(compare.base.profit)} delta={formatCOP(delta.profit)} good={delta.profit >= 0} />
            <CompareMetric label="Órdenes" current={formatNumber(compare.current.orders)} base={formatNumber(compare.base.orders)} delta={`${delta.orders >= 0 ? '+' : ''}${formatNumber(delta.orders)}`} good={delta.orders >= 0} />
            <CompareMetric label="AOV diario" current={formatCOP(compare.current.aov)} base={formatCOP(compare.base.aov)} delta={formatCOP(delta.aov)} good={delta.aov >= 0} />
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Insight
              label={`Mejor día · ${compare.current.label}`}
              value={compare.current.bestDay ? `${formatDate(compare.current.bestDay.date)} · ${formatCOP(compare.current.bestDay.revenue)}` : 'Sin días cargados'}
              detail={compare.current.bestDay ? compare.current.bestDay.topProduct : undefined}
            />
            <Insight
              label={`Producto top · ${compare.current.label}`}
              value={compare.current.topProduct?.topProduct ?? 'Sin producto cargado'}
              detail={compare.current.topProduct ? `${formatNumber(compare.current.topProduct.topProductUnits)} u · ${formatCOP(compare.current.topProduct.topProductRevenue)}` : undefined}
            />
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-daily-chart">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Día por día</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingresos, gastos y utilidad de los días cargados para el mes seleccionado.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={dailyChartSort}
                onChange={e => setDailyChartSort(e.target.value as ChartSortOrder)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-daily-chart-sort"
              >
                <option value="oldest">Viejo → nuevo</option>
                <option value="newest">Nuevo → viejo</option>
              </select>
              <Badge variant="outline" className="text-[11px]">Daily drilldown</Badge>
            </div>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyChartRows} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => formatDate(String(v))}
                  formatter={(v: number, name) => [formatCOP(v), name]}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Ingresos" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Utilidad" stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-best-days">
          <h2 className="text-sm font-semibold tracking-tight mb-4">Lectura rápida del mes</h2>
          <div className="space-y-3">
            <Insight
              label="Mejor día por ventas"
              value={bestDay ? `${formatDate(bestDay.date)} · ${formatCOP(bestDay.revenue)}` : 'Sin datos'}
              detail={bestDay ? `Producto líder: ${bestDay.topProduct} (${formatCOP(bestDay.topProductRevenue)})` : undefined}
            />
            <Insight
              label="Mejor día por utilidad"
              value={bestProfitDay ? `${formatDate(bestProfitDay.date)} · ${formatCOP(bestProfitDay.profit)}` : 'Sin datos'}
              detail={bestProfitDay ? `Órdenes: ${bestProfitDay.orders} · AOV: ${formatCOP(bestProfitDay.aov)}` : undefined}
            />
            <Insight
              label="Producto que más empujó un día"
              value={topProduct ? topProduct.topProduct : 'Sin datos'}
              detail={topProduct ? `${formatCOP(topProduct.topProductRevenue)} en ${formatDate(topProduct.date)}` : undefined}
            />
          </div>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-daily-table">
          <h2 className="text-sm font-semibold tracking-tight mb-4">Tabla diaria</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Día</TableHead>
                <TableHead className="text-right">Órdenes</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead>Producto top</TableHead>
                <TableHead className="text-right">Utilidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.date} data-testid={`row-daily-${r.date}`}>
                  <TableCell className="tabular">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-right tabular">{r.orders}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(r.revenue)}</TableCell>
                  <TableCell className="text-xs max-w-[220px]">
                    <div className="font-medium">{r.topProduct}</div>
                    <div className="text-muted-foreground">{r.topProductUnits} u · {formatCOP(r.topProductRevenue)}</div>
                  </TableCell>
                  <TableCell className={`text-right tabular font-medium ${r.profit < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatCOP(r.profit)}
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

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

function Insight({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function CompareMetric({ label, current, base, delta, good }: { label: string; current: string; base: string; delta: string; good: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3" data-testid={`compare-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular">{current}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">Base {base}</span>
        <span className={`font-medium tabular ${good ? 'text-emerald-300' : 'text-rose-300'}`}>
          {delta.startsWith('-') || delta.startsWith('+') ? delta : `+${delta}`}
        </span>
      </div>
    </div>
  );
}
