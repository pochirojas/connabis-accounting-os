import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import type { IntegrationPhase } from '@shared/schema';
import { Check, Clock, Circle, KeyRound, ExternalLink } from 'lucide-react';

const STATUS_META = {
  completado:  { label: 'Completado',  icon: Check,  cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  en_progreso: { label: 'En progreso', icon: Clock,  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  planificado: { label: 'Planificado', icon: Circle, cls: 'bg-muted text-muted-foreground border-border' },
} as const;

export default function Integracion() {
  const phases = useQuery<IntegrationPhase[]>({ queryKey: ['/api/integration-phases'] });

  return (
    <Layout
      title="Plan de integración"
      subtitle="Hoja de ruta para llevar Connabis Accounting OS de prototipo a app embebida en Shopify"
    >
      <section className="mb-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-architecture-note">
          <h2 className="text-sm font-semibold tracking-tight mb-3">Arquitectura objetivo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px] leading-relaxed">
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium text-primary mb-1">Shopify = fuente única</div>
              <p className="text-muted-foreground">
                Pedidos, productos, variantes, inventario y <span className="font-mono text-accent">variant.cost</span> viven en Shopify. Es el gold standard de ingresos y de costos.
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium text-accent mb-1">Sheet = puente temporal</div>
              <p className="text-muted-foreground">
                La hoja contable solo aporta gastos históricos y registros que aún no existen en Shopify. Se reemplaza fila por fila a medida que se cargan en la plataforma.
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium mb-1">Connabis OS = capa de análisis</div>
              <p className="text-muted-foreground">
                Calcula márgenes, alertas y P&L sobre los datos sincronizados. No reemplaza la contabilidad oficial; la enriquece con visión operativa.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        {(phases.data ?? []).map(p => {
          const meta = STATUS_META[p.status];
          const Icon = meta.icon;
          return (
            <Card key={p.phase} className="p-5 bg-card border-card-border" data-testid={`phase-${p.phase}`}>
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary text-sm font-semibold tabular">
                    {p.phase}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold tracking-tight" data-testid={`phase-title-${p.phase}`}>{p.title}</h3>
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${meta.cls}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {p.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed" data-testid={`phase-bullet-${p.phase}-${i}`}>
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: b.replace(/`([^`]+)`/g, '<code class="font-mono text-accent text-[12px]">$1</code>') }} />
                      </li>
                    ))}
                  </ul>
                  {p.requiresCredentials && p.requiresCredentials.length > 0 && (
                    <div className="mt-4 rounded-md border border-card-border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
                        <KeyRound className="h-3 w-3" />
                        Credenciales requeridas
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.requiresCredentials.map(c => (
                          <code key={c} className="text-[11.5px] font-mono px-2 py-1 rounded bg-background border border-card-border" data-testid={`cred-${p.phase}-${c}`}>
                            {c}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-data-sources">
          <h2 className="text-sm font-semibold tracking-tight mb-3">Mapeo de datos por origen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-primary font-medium mb-2">Shopify (gold standard)</div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>• Órdenes, line items, refunds, descuentos</li>
                <li>• Productos, variantes, SKU, inventario</li>
                <li>• <span className="font-mono text-foreground">variant.cost</span> → COGS por SKU</li>
                <li>• Shopify Payments fees, payouts</li>
                <li>• Customers, segmentos, recurrencia</li>
                <li>• Canales: Online Store, Draft Orders, Mobile</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-accent font-medium mb-2">Sheet (bridge temporal)</div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>• Gastos históricos antes de la migración</li>
                <li>• Servicios, software, arriendos, nómina</li>
                <li>• Marketing pagado fuera de Shopify</li>
                <li>• Ajustes manuales y categorización contable</li>
                <li>• Costos antiguos hasta cargar en Shopify <span className="font-mono text-foreground">variant.cost</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
            Plan: cada categoría del Sheet se reemplaza por su equivalente nativo en Shopify hasta retirar la hoja por completo.
          </div>
        </Card>
      </section>
    </Layout>
  );
}
