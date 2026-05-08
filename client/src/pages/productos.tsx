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
import { Package, ShieldAlert, ShieldCheck, Pencil, Info, Search, Layers3, AlertTriangle } from 'lucide-react';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';

export default function Productos() {
  const products = useQuery<Product[]>({ queryKey: ['/api/products'] });
  const shopifyStatus = useQuery<{ connected: boolean; mode: string }>({ queryKey: ['/api/shopify/status'] });
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('Todas');
  const [selectedId, setSelectedId] = useState<string>('p1');

  const computed = useMemo(() => {
    return (products.data ?? []).filter(p => p.active).map(p => {
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

  const families = useMemo(() => ['Todas', ...Array.from(new Set(computed.map(p => p.family)))], [computed]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return computed.filter(p => {
      const matchesSearch = !q || `${p.name} ${p.sku ?? ''} ${p.family}`.toLowerCase().includes(q);
      const matchesFamily = family === 'Todas' || p.family === family;
      return matchesSearch && matchesFamily;
    });
  }, [computed, family, search]);
  const selected = computed.find(p => p.id === selectedId) ?? computed[0];

  const avgGM = computed.length ? computed.reduce((s, p) => s + p.grossMargin, 0) / computed.length : 0;
  const avgCM = computed.length ? computed.reduce((s, p) => s + p.contributionMargin, 0) / computed.length : 0;
  const missingCosts = computed.filter(p => p.cogsSource === 'fallback').length;
  const isLive = Boolean(shopifyStatus.data?.connected);
  const sourceLabel = (p: Product) => p.marginSource === 'material_manager' ? 'Material Manager' : p.cogsSource === 'shopify' ? 'Shopify' : 'Fallback temporal';

  return (
    <Layout
      title="Productos & Márgenes"
      subtitle={isLive ? 'Productos activos de Shopify · precios y costos unitarios leídos en modo solo lectura' : 'Phase 1: seed incompleto hasta conectar Shopify'}
    >
      <Card className={`mb-6 p-4 ${isLive ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-amber-500/30 bg-amber-500/8'}`} data-testid="banner-product-data-prototype">
        <div className="flex gap-3">
          <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${isLive ? 'text-emerald-300' : 'text-amber-300'}`} />
          <div>
            <h2 className={`text-sm font-semibold ${isLive ? 'text-emerald-200' : 'text-amber-200'}`}>
              {isLive ? 'Catálogo activo conectado' : 'Datos incompletos a propósito'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {isLive
                ? 'Esta vista usa todos los productos activos disponibles vía Shopify Admin API. Ingresos/unidades por SKU siguen en 0 hasta conectar el histórico de órdenes por variante.'
                : 'Esta tabla todavía no contiene todo el catálogo real. Cuando conectemos la API, Productos & Márgenes usará únicamente productos activos de Shopify.'}
            </p>
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="SKUs activos" value={formatNumber(computed.length)} icon={Package} emphasis="emerald" testId="kpi-prod-ingresos" />
        <KpiCard label="Margen bruto promedio" value={formatPct(avgGM, 1)} icon={ShieldCheck} testId="kpi-gm-prom" hint="(Precio − COGS) / Precio" />
        <KpiCard label="Margen contribución" value={formatPct(avgCM, 1)} icon={ShieldCheck} emphasis="gold" testId="kpi-cm-prom" hint="Después de fees, packaging, envío" />
        <KpiCard label="SKUs sin costo" value={`${missingCosts}`} icon={ShieldAlert} testId="kpi-skus-riesgo" hint="Variantes sin unitCost en Shopify" />
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-product-selector">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Selector de producto</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Busca cualquier producto activo de Shopify. Los sabores/variantes quedan agrupados en una sola fila porque comparten precio y costo base.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">{computed.length} productos</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_1fr] gap-3">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o familia..."
                className="pl-9"
                data-testid="input-product-search"
              />
            </label>
            <select
              value={family}
              onChange={e => setFamily(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-product-family"
            >
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select
              value={selected?.id ?? ''}
              onChange={e => setSelectedId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-product-detail"
            >
              {filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </Card>
      </section>

      {selected && (
        <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <Card className="p-5 bg-card border-card-border" data-testid="card-selected-product-cost">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">{selected.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  SKU base {selected.sku ?? 'sin SKU'} · {selected.family} · {(selected as Product & { variantCount?: number }).variantCount ?? 1} sabores/variantes · Fuente de costo: {sourceLabel(selected)}
                </p>
              </div>
              <Badge
                variant={selected.cogsSource === 'shopify' ? 'default' : 'outline'}
                className={`text-[10px] uppercase tracking-wide ${selected.cogsSource === 'fallback' ? 'border-amber-500/40 text-amber-300' : ''}`}
                data-testid="badge-selected-source"
              >
                {selected.marginSource === 'material_manager' ? 'MM BOM' : selected.cogsSource === 'shopify' ? 'Shopify cost' : 'Fallback'}
              </Badge>
            </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
              <MiniMetric label="Precio" value={formatCOP(selected.unitPrice)} testId="metric-selected-price" />
              <MiniMetric label="COGS usado" value={formatCOP(selected.cogsUsed)} testId="metric-selected-cogs" />
              <MiniMetric label="Margen bruto" value={formatPct(selected.grossMargin)} testId="metric-selected-gm" />
              <MiniMetric label="Margen contribución" value={formatPct(selected.contributionMargin)} testId="metric-selected-cm" />
              <MiniMetric label="Precio ideal" value={formatCOP(selected.idealPrice)} testId="metric-selected-ideal-price" />
              <MiniMetric label="Competencia" value={formatCOP(selected.competitorPrice)} testId="metric-selected-competitor-price" />
              <MiniMetric label="Descuento máximo" value={formatPct(selected.maxProfitableDiscount)} testId="metric-selected-max-discount" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4" data-testid="text-pricing-note">
              Precio ideal usa un objetivo de margen de contribución de 45%. Precio de competencia es placeholder hasta hacer scraping/research y debe reemplazarse con mercado real.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Componente del costo</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">% del COGS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.cogsBreakdown.map((item, idx) => (
                  <TableRow key={`${selected.id}-${idx}`} data-testid={`row-cost-component-${idx}`}>
                    <TableCell>
                      <div className="font-medium text-[13px]">{item.label}</div>
                      {item.note && <div className="text-[11px] text-muted-foreground mt-0.5">{item.note}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{item.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatCOP(item.amount)}</TableCell>
                    <TableCell className="text-right tabular">{selected.cogsUsed > 0 ? formatPct(item.amount / selected.cogsUsed) : '—'}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold">Subtotal COGS directo</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular font-semibold">{formatCOP(selected.cogsBreakdown.reduce((s, i) => s + i.amount, 0))}</TableCell>
                  <TableCell className="text-right tabular font-semibold">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          <Card className="p-5 bg-card border-card-border" data-testid="card-selected-contribution">
            <div className="flex items-center gap-2 mb-4">
              <Layers3 className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold tracking-tight">Qué se resta hasta llegar al margen real</h2>
            </div>
            <div className="space-y-3 text-sm">
              <CostLine label="Precio vendido" amount={selected.unitPrice} positive />
              <CostLine label="COGS producto" amount={-selected.cogsUsed} />
              <CostLine label="Empaque externo" amount={-selected.packaging} />
              <CostLine label="Fees Shopify/pago" amount={-(selected.unitPrice * selected.fees)} />
              <CostLine label="Subsidio de envío" amount={-selected.shippingSubsidy} />
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="font-semibold">Utilidad contribución por unidad</span>
                <span className={`font-semibold tabular ${selected.contributionMargin < 0.3 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {formatCOP(selected.unitPrice - selected.cogsUsed - selected.packaging - selected.unitPrice * selected.fees - selected.shippingSubsidy)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Este panel separa el costo directo del producto de los costos variables de venderlo. Así puedes saber si un descuento todavía deja margen o si solo sube ventas destruyendo utilidad.
              </p>
            </div>
          </Card>
        </section>
      )}

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-product-revenue-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Ingresos por SKU</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Top productos por ingresos all-time · catálogo expandido abajo</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={computed.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
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
                  {computed.slice(0, 10).map((p, i) => (
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
                  <TableHead className="text-right">Precio ideal</TableHead>
                  <TableHead className="text-right">Competencia</TableHead>
                  <TableHead className="text-right">Desc. máx.</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow
                    key={p.id}
                    data-testid={`row-product-${p.id}`}
                    className={selected?.id === p.id ? 'bg-muted/35' : undefined}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <TableCell className="font-medium text-[13px] leading-snug max-w-[300px]">
                      <div>{p.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular mt-0.5">
                        {p.sku ?? 'sin SKU'} · stock {formatNumber((p as Product & { inventoryQuantity?: number }).inventoryQuantity ?? 0)} · {p.revenue > 0 ? formatCOP(p.revenue) : 'ingresos por SKU pendiente'}
                        {' · '}{formatNumber((p as Product & { variantCount?: number }).variantCount ?? 1)} sabores
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
                              {p.marginSource === 'material_manager' ? 'MM BOM' : p.cogsSource === 'shopify' ? 'Shopify' : 'Fallback'}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-[11.5px]">
                          {p.marginSource === 'material_manager'
                            ? 'Costo desglosado desde Material Manager: cantidad de material usada × costo unitario por material.'
                            : p.cogsSource === 'shopify'
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
                    <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.idealPrice)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.competitorPrice)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatPct(p.maxProfitableDiscount)}</TableCell>
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
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="empty-products">
                No encontré productos con esos filtros.
              </div>
            )}
          </div>
        </Card>
      </section>
    </Layout>
  );
}

function MiniMetric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3" data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular">{value}</div>
    </div>
  );
}

function CostLine({ label, amount, positive }: { label: string; amount: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium ${positive ? 'text-emerald-300' : 'text-rose-200'}`}>
        {positive ? formatCOP(amount) : `- ${formatCOP(Math.abs(amount))}`}
      </span>
    </div>
  );
}
