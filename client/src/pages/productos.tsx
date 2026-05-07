import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import type { Product } from '@shared/schema';
import { formatCOP, formatCOPCompact, formatNumber, formatPct } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Package, ShieldAlert, ShieldCheck, Pencil, Info } from 'lucide-react';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';

export default function Productos() {
  const products = useQuery<Product[]>({ queryKey: ['/api/products'] });
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const computed = useMemo(() => {
    return (products.data ?? []).map(p => {
      const override = overrides[p.id];
      const cogs = override ?? p.cogsUsed;
      const variableCost = cogs + p.packaging + p.unitPrice * p.fees + p.shippingSubsidy;
      const grossMargin = (p.unitPrice - cogs) / p.unitPrice;
      const contributionMargin = (p.unitPrice - variableCost) / p.unitPrice;
      let alert: Product['alert'] = 'ok';
      let alertReason: string | undefined;
      if (p.cogsSource === 'fallback' && override === undefined) { alert = 'warn'; alertReason = 'Costo Shopify ausente — usando estimación'; }
      if (contributionMargin < 0.30) { alert = 'warn'; alertReason = 'Margen de contribución bajo'; }
      if (contributionMargin < 0.10) { alert = 'danger'; alertReason = 'Margen crítico — riesgo con descuentos'; }
      return { ...p, cogsUsed: cogs, grossMargin, contributionMargin, alert, alertReason, edited: override !== undefined };
    });
  }, [products.data, overrides]);

  const totalRev = computed.reduce((s, p) => s + p.revenue, 0);
  const avgGM = computed.length ? computed.reduce((s, p) => s + p.grossMargin, 0) / computed.length : 0;
  const avgCM = computed.length ? computed.reduce((s, p) => s + p.contributionMargin, 0) / computed.length : 0;
  const danger = computed.filter(p => p.alert === 'danger').length;

  return (
    <Layout
      title="Productos & Márgenes"
      subtitle="COGS desde campo cost de Shopify (variant.cost) · fallback solo si está vacío"
    >
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos top SKUs" value={formatCOP(totalRev)} icon={Package} emphasis="emerald" testId="kpi-prod-ingresos" />
        <KpiCard label="Margen bruto promedio" value={formatPct(avgGM, 1)} icon={ShieldCheck} testId="kpi-gm-prom" hint="(Precio − COGS) / Precio" />
        <KpiCard label="Margen contribución" value={formatPct(avgCM, 1)} icon={ShieldCheck} emphasis="gold" testId="kpi-cm-prom" hint="Después de fees, packaging, envío" />
        <KpiCard label="SKUs en riesgo" value={`${danger}`} icon={ShieldAlert} testId="kpi-skus-riesgo" hint="CM < 10%" />
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-product-revenue-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Ingresos por SKU</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Top 9 productos por ingresos all-time</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={computed} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10.5}
                  width={240} tickLine={false} axisLine={false} interval={0}
                  tickFormatter={(v: string) => v.length > 38 ? v.slice(0, 36) + '…' : v} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatCOP(v)}
                />
                <Bar dataKey="revenue" radius={[0, 3, 3, 0]}>
                  {computed.map((p, i) => (
                    <Cell key={i} fill={p.alert === 'danger' ? 'hsl(var(--destructive))' : p.alert === 'warn' ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-margin-table">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Tabla de márgenes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Editar COGS para simular escenarios. <span className="text-accent">Origen del costo</span> indica si viene de Shopify o de fallback.
              </p>
            </div>
            {Object.keys(overrides).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setOverrides({})} data-testid="button-reset-overrides">
                Restablecer
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Producto</TableHead>
                  <TableHead>Familia</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Empaque</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Subsidio envío</TableHead>
                  <TableHead className="text-right">GM</TableHead>
                  <TableHead className="text-right">CM</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.map(p => (
                  <TableRow key={p.id} data-testid={`row-product-${p.id}`}>
                    <TableCell className="font-medium text-[13px] leading-snug max-w-[300px]">
                      <div>{p.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular mt-0.5">
                        {formatNumber(p.unitsSold)} u · {formatCOP(p.revenue)}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10.5px]">{p.family}</Badge></TableCell>
                    <TableCell className="text-right tabular">{formatCOP(p.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          value={p.cogsUsed}
                          type="number"
                          onChange={e => {
                            const val = Number(e.target.value);
                            setOverrides(prev => ({ ...prev, [p.id]: Number.isFinite(val) ? val : 0 }));
                          }}
                          className="h-8 w-[110px] text-right tabular text-[12.5px]"
                          data-testid={`input-cogs-${p.id}`}
                        />
                        {p.edited && <Pencil className="h-3 w-3 text-accent" aria-label="Editado" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Badge
                              variant={p.cogsSource === 'shopify' ? 'default' : 'outline'}
                              className={`text-[10px] uppercase tracking-wide cursor-help ${p.cogsSource === 'fallback' ? 'border-amber-500/40 text-amber-300' : ''}`}
                              data-testid={`badge-source-${p.id}`}
                            >
                              <Info className="h-2.5 w-2.5 mr-1" />
                              {p.cogsSource === 'shopify' ? 'Shopify' : 'Fallback'}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-[11.5px]">
                          {p.cogsSource === 'shopify'
                            ? 'Costo tomado del campo cost de la variante en Shopify.'
                            : 'Costo Shopify vacío. Usando estimación de costo aterrizado. Cargar costo en Shopify para fuente única de verdad.'}
                        </TooltipContent>
                      </UiTooltip>
                    </TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.packaging)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatPct(p.fees)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.shippingSubsidy)}</TableCell>
                    <TableCell className="text-right tabular font-medium" data-testid={`text-gm-${p.id}`}>{formatPct(p.grossMargin)}</TableCell>
                    <TableCell className={`text-right tabular font-semibold ${
                      p.contributionMargin < 0.10 ? 'text-rose-400' :
                      p.contributionMargin < 0.30 ? 'text-amber-300' :
                      'text-emerald-400'
                    }`} data-testid={`text-cm-${p.id}`}>{formatPct(p.contributionMargin)}</TableCell>
                    <TableCell>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase tracking-wider cursor-help ${
                                p.alert === 'danger' ? 'border-destructive/50 text-rose-300 bg-destructive/10' :
                                p.alert === 'warn' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' :
                                'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                              }`}
                              data-testid={`badge-alert-${p.id}`}
                            >
                              {p.alert === 'danger' ? 'Crítico' : p.alert === 'warn' ? 'Revisar' : 'OK'}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        {p.alertReason && (
                          <TooltipContent className="max-w-xs text-[11.5px]">{p.alertReason}</TooltipContent>
                        )}
                      </UiTooltip>
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
