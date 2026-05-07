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

export default function Performance() {
  const daily = useQuery<DailyPerformance[]>({ queryKey: ['/api/daily-performance'] });
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
  const [selectedMonth, setSelectedMonth] = useState('2026-04');

  const rows = useMemo(
    () => (daily.data ?? []).filter(r => r.month === selectedMonth).sort((a, b) => a.date.localeCompare(b.date)),
    [daily.data, selectedMonth],
  );
  const month = (months.data ?? []).find(m => m.month === selectedMonth);
  const bestDay = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.revenue > best.revenue ? row : best, undefined);
  const bestProfitDay = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.profit > best.profit ? row : best, undefined);
  const topProduct = rows.reduce<DailyPerformance | undefined>((best, row) => !best || row.topProductRevenue > best.topProductRevenue ? row : best, undefined);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const aov = orders ? revenue / orders : 0;

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
        <Card className="p-5 bg-card border-card-border" data-testid="card-daily-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Día por día</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingresos, gastos y utilidad de los días cargados para el mes seleccionado.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Daily drilldown</Badge>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
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
