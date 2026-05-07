import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { AccountingSuggestion, RestockRecommendation } from '@shared/schema';
import { formatCOP, formatDate, formatNumber } from '@/lib/format';
import { Bell, Brain, Calculator, CalendarCheck, Lightbulb, PackageCheck, WalletCards } from 'lucide-react';
import { KpiCard } from '@/components/kpi-card';
import { useMemo } from 'react';

const ICONS = {
  prediccion: Brain,
  analisis: Calculator,
  sugerencia: Lightbulb,
  recordatorio: Bell,
};

export default function Sugerencias() {
  const suggestions = useQuery<AccountingSuggestion[]>({ queryKey: ['/api/accounting-suggestions'] });
  const restock = useQuery<RestockRecommendation[]>({ queryKey: ['/api/restock-plan'] });
  const restockRows = restock.data ?? [];
  const criticalCount = restockRows.filter(row => row.risk === 'crítico' || row.risk === 'alto').length;
  const purchaseNeed = restockRows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const nextRestock = restockRows.slice().sort((a, b) => a.suggestedOrderDate.localeCompare(b.suggestedOrderDate))[0];
  const calendar = useMemo(() => {
    return restockRows
      .filter(row => row.recommendedQty > 0)
      .slice()
      .sort((a, b) => a.suggestedOrderDate.localeCompare(b.suggestedOrderDate))
      .reduce<Array<{ date: string; items: RestockRecommendation[]; total: number }>>((acc, row) => {
        const group = acc.find(item => item.date === row.suggestedOrderDate);
        if (group) {
          group.items.push(row);
          group.total += row.monthCashImpact;
        } else {
          acc.push({ date: row.suggestedOrderDate, items: [row], total: row.monthCashImpact });
        }
        return acc;
      }, []);
  }, [restockRows]);

  return (
    <Layout
      title="Predicciones & sugerencias"
      subtitle="Análisis contable, recomendaciones y recordatorios tributarios · Phase 2 para automatización"
    >
      <Card className="p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-suggestions-phase2">
        <h2 className="text-sm font-semibold text-amber-200">Phase 2: inteligencia contable y recordatorios</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Esta sección define qué debe analizar el sistema cuando conectemos datos reales. Los recordatorios tributarios de Colombia deben validarse con contador antes de automatizarlos.
        </p>
      </Card>

      <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Materiales urgentes" value={`${criticalCount}`} icon={PackageCheck} emphasis="gold" testId="kpi-restock-urgent" />
        <KpiCard label="Compra sugerida" value={formatCOP(purchaseNeed)} icon={WalletCards} emphasis="emerald" testId="kpi-restock-purchase" />
        <KpiCard label="Próximo punto" value={nextRestock ? formatDate(nextRestock.suggestedOrderDate) : '—'} icon={CalendarCheck} testId="kpi-restock-next" hint={nextRestock?.material} />
        <KpiCard label="Eventos calendario" value={`${calendar.length}`} icon={Bell} testId="kpi-restock-events" />
      </section>

      <section className="mt-6 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card className="p-5 bg-card border-card-border" data-testid="card-restock-dashboard">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Dashboard de restock</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-3xl leading-relaxed">
                Modelo seed para decidir cuándo comprar y cuánto comprar sin romper disponibilidad ni balance mensual.
                Luego usará ventas reales por SKU, BOM, inventario y lead times de proveedores.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Phase 2 model</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Punto restock</TableHead>
                  <TableHead className="text-right">Comprar</TableHead>
                  <TableHead className="text-right">Costo est.</TableHead>
                  <TableHead>Fecha ideal</TableHead>
                  <TableHead>Riesgo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restockRows.map(row => (
                  <TableRow key={row.id} data-testid={`row-restock-${row.id}`}>
                    <TableCell className="min-w-[260px]">
                      <div className="text-[13px] font-medium">{row.material}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Impacta: {row.productsImpacted.slice(0, 2).join(', ')}{row.productsImpacted.length > 2 ? ` +${row.productsImpacted.length - 2}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatNumber(row.currentStock)} {row.unit}</TableCell>
                    <TableCell className="text-right tabular">{row.daysOnHand.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular">{formatNumber(row.reorderPoint)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{formatNumber(row.recommendedQty)}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.estimatedCost)}</TableCell>
                    <TableCell className="text-xs tabular">{formatDate(row.suggestedOrderDate)}</TableCell>
                    <TableCell><RiskBadge risk={row.risk} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-restock-calendar">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Calendario automático</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Fechas sugeridas por disponibilidad, lead time y caja.</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Restock</Badge>
          </div>
          <div className="space-y-3">
            {calendar.map(event => (
              <div key={event.date} className="rounded-md border border-border bg-muted/20 p-3" data-testid={`card-restock-event-${event.date}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{formatDate(event.date)}</div>
                    <div className="text-[11px] text-muted-foreground">{event.items.length} compra(s) sugerida(s)</div>
                  </div>
                  <div className="text-right text-xs tabular font-semibold text-emerald-300">{formatCOP(event.total)}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {event.items.map(item => (
                    <div key={item.id} className="rounded-md bg-background/40 border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{item.material}</span>
                        <RiskBadge risk={item.risk} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{item.balanceNote}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(suggestions.data ?? []).map(item => {
          const Icon = ICONS[item.type];
          return (
            <Card key={item.id} className="p-5 bg-card border-card-border" data-testid={`card-suggestion-${item.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold tracking-tight">{item.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.phase === 1 ? 'default' : 'outline'} className="text-[10px]">Phase {item.phase}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${
                      item.priority === 'alta' ? 'border-rose-500/40 text-rose-300' :
                      item.priority === 'media' ? 'border-amber-500/40 text-amber-300' :
                      'border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    {item.priority}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{item.description}</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Por qué importa</div>
                  <p className="mt-1 text-xs leading-relaxed">{item.whyItMatters}</p>
                </div>
                <div className="rounded-md border border-border bg-emerald-500/5 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-300">Acción sugerida</div>
                  <p className="mt-1 text-xs leading-relaxed">{item.suggestedAction}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>
    </Layout>
  );
}

function RiskBadge({ risk }: { risk: RestockRecommendation['risk'] }) {
  const cls = risk === 'crítico'
    ? 'border-rose-500/40 text-rose-300'
    : risk === 'alto'
      ? 'border-amber-500/40 text-amber-300'
      : risk === 'medio'
        ? 'border-sky-500/40 text-sky-300'
        : 'border-emerald-500/40 text-emerald-300';
  return <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>{risk}</Badge>;
}
