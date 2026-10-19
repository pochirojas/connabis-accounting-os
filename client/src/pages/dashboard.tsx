import { Layout } from '@/components/layout';
import { KpiCard } from '@/components/kpi-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Receipt, Wallet, ShoppingCart, Users,
  Package, AlertTriangle, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { DashboardKPIs, MonthlyRow, Channel, Alert, CeoMetric } from '@shared/schema';
import { formatCOP, formatCOPCompact, formatNumber, formatPct } from '@/lib/format';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { sortByMonth, type ChartSortOrder } from '@/lib/chart-sort';
import { apiRequest } from '@/lib/queryClient';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const CEO_STATUS_CLASS = {
  ok: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  watch: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  risk: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
};

function formatCeoValue(metric: CeoMetric) {
  if (metric.unit === 'COP') return formatCOP(Number(metric.value));
  if (metric.unit === 'pct') return formatPct(Number(metric.value), 1);
  if (metric.unit === 'count') return formatNumber(Number(metric.value));
  return String(metric.value);
}

export default function Dashboard() {
  const [periodMode, setPeriodMode] = useState<'all' | 'month' | 'year' | 'ytd'>('all');
  const [selectedMonth, setSelectedMonth] = useState('2026-04');
  const [selectedYear, setSelectedYear] = useState('2026');
  const periodQuery = periodMode === 'month'
    ? `?month=${selectedMonth}`
    : periodMode === 'year'
    ? `?year=${selectedYear}`
    : periodMode === 'ytd'
    ? `?start=${selectedYear}-01-01&end=${new Date().toISOString().slice(0, 10)}`
    : '';
  const kpis = useQuery<DashboardKPIs>({
    queryKey: ['/api/kpis', periodQuery],
    queryFn: async () => (await apiRequest('GET', `/api/kpis${periodQuery}`)).json(),
  });
  const months = useQuery<MonthlyRow[]>({
    queryKey: ['/api/months', periodQuery],
    queryFn: async () => (await apiRequest('GET', `/api/months${periodQuery}`)).json(),
  });
  const channels = useQuery<Channel[]>({ queryKey: ['/api/channels'] });
  const alerts = useQuery<Alert[]>({ queryKey: ['/api/alerts'] });
  const ceoMetrics = useQuery<CeoMetric[]>({ queryKey: ['/api/ceo-metrics'] });
  const [monthlySort, setMonthlySort] = useState<ChartSortOrder>('oldest');

  const k = kpis.data;
  const monthlyChartRows = useMemo(() => sortByMonth(months.data ?? [], monthlySort), [months.data, monthlySort]);

  return (
    <Layout title="Vista general" subtitle={k ? `Datos al ${new Date(k.asOf).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}>
      <Card className="mb-6 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-dashboard-prototype">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-200">Solo datos reales</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Ingresos de Shopify, COGS de Material Manager y gastos revisados (sheet histórico + nuevos). Si una fuente no responde se muestra “—”, nunca datos de prueba. Los gastos en “Por revisar” no cuentan hasta aprobarlos.
            </p>
            {k?.dataQualityNote && (
              <p className="text-[11px] text-amber-100/85 mt-2 leading-relaxed" data-testid="text-dashboard-data-quality">
                {k.dataQualityNote}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-4 bg-card border-card-border" data-testid="card-dashboard-date-filter">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Filtro de fecha global</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Dashboard usa el mismo criterio que Performance: ingresos totales Shopify + MM + gastos reales.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as typeof periodMode)} className="h-9 rounded-md border border-input bg-background px-3 text-xs" data-testid="select-dashboard-period">
              <option value="all">All-time</option>
              <option value="month">Mes</option>
              <option value="year">Año</option>
              <option value="ytd">YTD</option>
            </select>
            {periodMode === 'month' && (
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs" data-testid="input-dashboard-month" />
            )}
            {(periodMode === 'year' || periodMode === 'ytd') && (
              <input value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="h-9 w-24 rounded-md border border-input bg-background px-3 text-xs" data-testid="input-dashboard-year" />
            )}
          </div>
        </div>
      </Card>

      <section className="mb-6" aria-label="Panel CEO diario">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Panel CEO diario</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seis números para decidir compras, descuentos, caja y prioridades antes de operar el día.
            </p>
          </div>
          <Link href="/financiero">
            <Button variant="outline" size="sm" data-testid="button-open-financial-control">
              Abrir control financiero
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(ceoMetrics.data ?? []).map(metric => (
            <Card
              key={metric.id}
              className="p-4 bg-card border-card-border"
              data-testid={`card-ceo-metric-${metric.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</div>
                  <div className="mt-2 text-lg font-semibold tabular" data-testid={`text-ceo-value-${metric.id}`}>
                    {formatCeoValue(metric)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${CEO_STATUS_CLASS[metric.status]}`}>
                    {metric.status}
                  </Badge>
                  {metric.id !== 'cash' && (
                    <Badge variant="outline" className="text-[9px] uppercase border-amber-500/35 text-amber-300 bg-amber-500/10">
                      seed/prototipo
                    </Badge>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.subtitle}</p>
              <div className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-foreground/85">
                {metric.action}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Indicadores clave">
        <KpiCard label="Ingresos netos" value={k ? formatCOP(k.ingresos) : '—'} icon={TrendingUp} emphasis="emerald" testId="kpi-ingresos"
          hint="Shopify: productos descontados + shipping - refunds" />
        <KpiCard label="COGS vendido" value={k ? formatCOP(k.cogsVendido ?? 0) : '—'} icon={Package} testId="kpi-cogs" hint="MM BOM × unidades vendidas" />
        <KpiCard label="Utilidad bruta" value={k ? formatCOP(k.utilidadBruta ?? 0) : '—'} icon={Wallet} emphasis="gold" testId="kpi-utilidad-bruta" hint={k ? `Margen bruto ${formatPct(k.margenBruto ?? 0)}` : ''} />
        <KpiCard label="Gastos operativos" value={k ? formatCOP(k.gastosOperativos ?? k.gastos) : '—'} icon={Receipt} testId="kpi-gastos" hint="Sheet/manual · excluye inventario/capital" />

        <KpiCard label="Utilidad neta" value={k ? formatCOP(k.utilidadNeta) : '—'} icon={Wallet} emphasis="gold" testId="kpi-utilidad" hint={k ? `Margen neto ${formatPct(k.margenEstimado)}` : ''} />
        <KpiCard label="Órdenes" value={k ? formatNumber(k.ordenes) : '—'} icon={ShoppingCart} testId="kpi-ordenes" hint="Shopify all-time" />
        <KpiCard label="AOV neto" value={k ? formatCOP(k.aov) : '—'} icon={Users} testId="kpi-aov" hint="Ingresos netos / órdenes" />
        <KpiCard label="Inventario excluido" value={k ? formatCOP(k.comprasInventarioExcluidas ?? 0) : '—'} icon={Package} testId="kpi-inventory-excluded" hint="No llevado a gasto directo" />
      </section>

      {/* Charts row */}
      <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 bg-card border-card-border" data-testid="card-monthly-profit">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Resultado mensual real</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ingresos netos vs COGS vs gastos operativos · utilidad neta por mes</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={monthlySort}
                onChange={e => setMonthlySort(e.target.value as ChartSortOrder)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-dashboard-chart-sort"
              >
                <option value="oldest">Viejo → nuevo</option>
                <option value="newest">Nuevo → viejo</option>
              </select>
              <Badge variant="outline" className="text-[11px]" data-testid="badge-source-monthly">Shopify + MM + gastos reales</Badge>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartRows} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{
                    background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))',
                    borderRadius: 8, fontSize: 12,
                  }}
                  formatter={(v: number) => formatCOP(v)}
                />
                <Bar dataKey="income" name="Ingresos" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cogs" name="COGS vendido" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos operativos" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="Utilidad neta" radius={[3, 3, 0, 0]}>
                  {monthlyChartRows.map((m, i) => (
                    <Cell key={i} fill={m.profit >= 0 ? 'hsl(var(--chart-3))' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-channel-split">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Canales de venta</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Mix por canal</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Shopify</Badge>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channels.data ?? []} dataKey="share" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                  {(channels.data ?? []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Alerts preview */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Alertas activas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Prioridades de revisión</p>
          </div>
          <Link href="/alertas"><Button variant="outline" size="sm" data-testid="button-ver-alertas">Ver todas</Button></Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(alerts.data ?? []).slice(0, 4).map(a => (
            <Card key={a.id} className="p-4 bg-card border-card-border" data-testid={`alert-card-${a.id}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md ${
                  a.level === 'critical' ? 'bg-destructive/15 text-destructive' :
                  a.level === 'warn' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-sky-500/15 text-sky-400'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{a.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{a.level}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </Layout>
  );
}
