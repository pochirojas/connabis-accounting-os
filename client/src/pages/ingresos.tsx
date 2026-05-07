import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import type { Channel, YearSummary, MonthlyRow, IncomeDetail } from '@shared/schema';
import { formatCOP, formatCOPCompact, formatNumber, formatPct } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { TrendingUp, ShoppingBag, BadgePercent, Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];

export default function Ingresos() {
  const channels = useQuery<Channel[]>({ queryKey: ['/api/channels'] });
  const years = useQuery<YearSummary[]>({ queryKey: ['/api/years'] });
  const months = useQuery<MonthlyRow[]>({ queryKey: ['/api/months'] });
  const incomeDetails = useQuery<IncomeDetail[]>({ queryKey: ['/api/income-details'] });
  const [detailMonth, setDetailMonth] = useState('all');
  const [detailChannel, setDetailChannel] = useState('all');

  const yr2026 = years.data?.find(y => y.year === 2026);
  const total = years.data?.reduce((s, y) => s + y.revenue, 0) ?? 0;
  const totalOrders = years.data?.reduce((s, y) => s + y.orders, 0) ?? 0;
  const filteredDetails = useMemo(() => {
    return (incomeDetails.data ?? [])
      .filter(row => detailMonth === 'all' || row.month === detailMonth)
      .filter(row => detailChannel === 'all' || row.channel === detailChannel)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [incomeDetails.data, detailMonth, detailChannel]);
  const detailTotals = filteredDetails.reduce((acc, row) => {
    acc.gross += row.grossRevenue;
    acc.discounts += row.discounts;
    acc.shipping += row.shipping;
    acc.refunds += row.refunds;
    acc.net += row.netRevenue;
    acc.qty += row.qty;
    return acc;
  }, { gross: 0, discounts: 0, shipping: 0, refunds: 0, net: 0, qty: 0 });
  const detailMonths = Array.from(new Set((incomeDetails.data ?? []).map(row => row.month))).sort().reverse();
  const detailChannels = Array.from(new Set((incomeDetails.data ?? []).map(row => row.channel))).sort();

  return (
    <Layout title="Ingresos" subtitle="Shopify es la fuente de verdad · all-time, por año y por canal">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos all-time" value={formatCOP(94_107_261)} icon={TrendingUp} emphasis="emerald" testId="kpi-ingresos-all" />
        <KpiCard label="Órdenes all-time" value={formatNumber(663)} icon={ShoppingBag} testId="kpi-ordenes-all" />
        <KpiCard label="AOV all-time" value={formatCOP(130_328)} icon={BadgePercent} testId="kpi-aov-all" />
        <KpiCard label="Proyección 2026" value={yr2026?.projected ? formatCOP(yr2026.projected) : '—'} icon={Calendar} emphasis="gold" testId="kpi-proy-2026" hint="Realista" />
      </section>

      <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Year breakdown */}
        <Card className="lg:col-span-2 p-5 bg-card border-card-border" data-testid="card-year-breakdown">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Desempeño anual</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Órdenes, ingresos y AOV por año</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Shopify</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">Órdenes</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">AOV</TableHead>
                <TableHead className="text-right">Proy.</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(years.data ?? []).map(y => (
                <TableRow key={y.year} data-testid={`row-year-${y.year}`}>
                  <TableCell className="font-medium tabular">{y.year}</TableCell>
                  <TableCell className="text-right tabular" data-testid={`text-year-orders-${y.year}`}>{formatNumber(y.orders)}</TableCell>
                  <TableCell className="text-right tabular" data-testid={`text-year-revenue-${y.year}`}>{formatCOP(y.revenue)}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(y.aov)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{y.projected ? formatCOP(y.projected) : '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{y.note ?? '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell className="font-semibold">All-time</TableCell>
                <TableCell className="text-right font-semibold tabular">663</TableCell>
                <TableCell className="text-right font-semibold tabular">{formatCOP(94_107_261)}</TableCell>
                <TableCell className="text-right font-semibold tabular">{formatCOP(130_328)}</TableCell>
                <TableCell colSpan={2} className="text-[11px] text-muted-foreground">Cifras anuales son aproximadas; all-time desde Shopify</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>

        {/* Channel split */}
        <Card className="p-5 bg-card border-card-border" data-testid="card-channels">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Mix de canales</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Distribución de ingresos</p>
            </div>
          </div>
          <div className="space-y-3">
            {(channels.data ?? []).map((c, i) => (
              <div key={c.name} data-testid={`row-channel-${i}`}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular text-muted-foreground">{formatPct(c.share)}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.share * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular">
                  <span>{formatCOP(c.revenue)}</span>
                  <span>{formatNumber(c.orders)} órdenes</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Monthly revenue 2026 */}
      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-monthly-revenue">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Ingresos mensuales 2026</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Récord en abril: 75 órdenes, 13.3M COP, AOV ~177K
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Shopify</Badge>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months.data ?? []} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatCOP(v)}
                />
                <Bar dataKey="income" name="Ingresos" radius={[4, 4, 0, 0]}>
                  {(months.data ?? []).map((m, i) => (
                    <Cell key={i} fill={m.partial ? 'hsl(var(--muted-foreground))' : 'hsl(var(--chart-1))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-income-details">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold tracking-tight">Detalle de ingresos</h2>
                <Badge variant="outline" className="text-[11px]">Shopify Orders · seed</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
                Vista prototipo de órdenes, canal, producto, descuentos, envíos, devoluciones e ingreso neto.
                Al conectar API, esta tabla debe venir directo de Shopify Orders + Line Items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={detailMonth}
                onChange={e => setDetailMonth(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-income-detail-month"
              >
                <option value="all">Todos los meses</option>
                {detailMonths.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              <select
                value={detailChannel}
                onChange={e => setDetailChannel(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                data-testid="select-income-detail-channel"
              >
                <option value="all">Todos los canales</option>
                {detailChannels.map(channel => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <MiniStat label="Bruto" value={formatCOP(detailTotals.gross)} />
            <MiniStat label="Descuentos" value={formatCOP(detailTotals.discounts)} tone="warn" />
            <MiniStat label="Envíos cobrados" value={formatCOP(detailTotals.shipping)} />
            <MiniStat label="Devoluciones" value={formatCOP(detailTotals.refunds)} tone="danger" />
            <MiniStat label="Neto" value={formatCOP(detailTotals.net)} tone="good" />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Desc.</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDetails.map(row => (
                  <TableRow key={row.id} data-testid={`row-income-${row.id}`}>
                    <TableCell className="font-medium tabular">{row.orderName}</TableCell>
                    <TableCell className="text-xs tabular">{row.date}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10.5px]">{row.channel}</Badge></TableCell>
                    <TableCell className="text-xs capitalize">{row.customerType}</TableCell>
                    <TableCell className="min-w-[260px]">
                      <div className="text-[13px] font-medium">{row.product}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{row.sku}</div>
                    </TableCell>
                    <TableCell className="text-right tabular">{detailTotals.qty ? row.qty : '—'}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.grossRevenue)}</TableCell>
                    <TableCell className="text-right tabular text-amber-300">{formatCOP(row.discounts)}</TableCell>
                    <TableCell className="text-right tabular font-semibold">{formatCOP(row.netRevenue)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge className="w-fit text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                          {row.paymentStatus}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{row.fulfillmentStatus}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>
    </Layout>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'danger' }) {
  const toneClass = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'danger' ? 'text-rose-300' : '';
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3" data-testid={`mini-income-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular ${toneClass}`}>{value}</div>
    </div>
  );
}
