import { Layout } from '@/components/layout';
import { KpiCard } from '@/components/kpi-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Receipt, Wallet, Percent, ShoppingCart, Users,
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
  const kpis = useQuery<DashboardKPIs>({ queryKey: ['/api/kpis'] });
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
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
            <h2 className="text-sm font-semibold text-amber-200">MVP con data parcial</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Los ingresos agregados vienen del reporte Shopify/Sheet actualizado, pero productos, costos, márgenes, inventario y performance diaria siguen siendo seed de prototipo. La versión real debe sincronizar productos activos, precios y costos desde Shopify, y márgenes desde Material Manager/Shopify.
            </p>
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
                <Badge variant="outline" className={`text-[10px] uppercase ${CEO_STATUS_CLASS[metric.status]}`}>
                  {metric.status}
                </Badge>
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
        <KpiCard label="Ingresos totales" value={k ? formatCOP(k.ingresos) : '—'} icon={TrendingUp} emphasis="emerald" testId="kpi-ingresos"
          hint="Shopify all-time" />
        <KpiCard label="Gastos totales" value={k ? formatCOP(k.gastos) : '—'} icon={Receipt} testId="kpi-gastos" hint="Sheet + Shopify" />
        <KpiCard label="Utilidad neta all-time" value={k ? formatCOP(k.utilidadNeta) : '—'} icon={Wallet} emphasis="gold" testId="kpi-utilidad" hint={k ? `Histórico seed · margen ${formatPct(k.margenEstimado)}` : ''} />
        <KpiCard label="Margen estimado" value={k ? formatPct(k.margenEstimado, 2) : '—'} icon={Percent} testId="kpi-margen" hint="Sobre ingresos all-time" />

        <KpiCard label="AOV" value={k ? formatCOP(k.aov) : '—'} icon={ShoppingCart} testId="kpi-aov" hint="Ticket promedio" />
        <KpiCard label="Órdenes" value={k ? formatNumber(k.ordenes) : '—'} icon={Package} testId="kpi-ordenes" hint="All-time Shopify" />
        <KpiCard label="Clientes recurrentes" value={k ? `${formatNumber(k.clientesRecurrentes)}` : '—'} icon={Users} testId="kpi-recurrentes" hint={k ? `${formatPct(k.clientesRecurrentesPct)} del total` : ''} />
        <KpiCard label="Familia top" value={k?.topProductFamily ?? '—'} icon={Package} testId="kpi-top-family" hint="Por ingresos" />
      </section>

      {/* Charts row */}
      <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 bg-card border-card-border" data-testid="card-monthly-profit">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Resultado mensual 2026</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ingresos vs gastos · utilidad por mes</p>
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
              <Badge variant="outline" className="text-[11px]" data-testid="badge-source-monthly">Sheet contable</Badge>
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
                <Bar dataKey="expenses" name="Gastos" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="Utilidad" radius={[3, 3, 0, 0]}>
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
