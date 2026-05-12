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
  const shopifyStatus = useQuery<{
    connected: boolean;
    mode: string;
    shopName?: string;
    shopDomain?: string;
    primaryDomain?: string;
    apiVersion?: string;
    scopes?: string[];
    note?: string;
  }>({ queryKey: ['/api/shopify/status'] });

  return (
      <Layout
        title="Plan de integración"
        subtitle="Arquitectura interna: Shopify + Material Manager + gastos reales hoy; MM replacement en Phase 2; Dataico futuro"
    >
      <section className="mb-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-shopify-live-status">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Shopify live check</div>
              <h2 className="text-sm font-semibold tracking-tight">
                {shopifyStatus.data?.connected ? 'Admin API conectada en modo solo lectura' : 'Shopify todavía en modo prototipo'}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {shopifyStatus.data?.connected
                  ? `${shopifyStatus.data.shopName} · ${shopifyStatus.data.shopDomain} · API ${shopifyStatus.data.apiVersion}`
                  : shopifyStatus.data?.note || 'Esperando configuración de OAuth/scopes.'}
              </p>
            </div>
            <Badge
              variant="outline"
              className={shopifyStatus.data?.connected ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}
              data-testid="badge-shopify-live-status"
            >
              {shopifyStatus.data?.connected ? 'LIVE READ-ONLY' : 'SEED'}
            </Badge>
          </div>
          {shopifyStatus.data?.scopes && shopifyStatus.data.scopes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {shopifyStatus.data.scopes.map(scope => (
                <code key={scope} className="text-[11.5px] font-mono px-2 py-1 rounded bg-background border border-card-border" data-testid={`scope-${scope}`}>
                  {scope}
                </code>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="mb-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-architecture-note">
          <h2 className="text-sm font-semibold tracking-tight mb-3">Arquitectura objetivo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px] leading-relaxed">
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium text-primary mb-1">Shopify = ingresos y catálogo</div>
              <p className="text-muted-foreground">
                Pedidos, ventas totales, shipping cobrado, refunds, productos activos, variantes y SKUs viven en Shopify. Es el gold standard de ingresos y productos.
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium text-accent mb-1">Material Manager = BOM / COGS</div>
              <p className="text-muted-foreground">
                BOM, proporciones de materiales, costos unitarios e inventario de materiales siguen viniendo de MM hasta que Phase 2 lo reemplace dentro del OS.
              </p>
            </div>
            <div className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium mb-1">Sheet / manual = gastos reales</div>
              <p className="text-muted-foreground">
                Gastos históricos y gastos agregados en la app alimentan utilidad neta. Compras de inventario y capex se separan del gasto operativo mensual.
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-primary font-medium mb-2">Shopify (gold standard ingresos/productos)</div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>• Órdenes, ventas totales, line items, refunds, descuentos</li>
                <li>• Shipping cobrado al usuario incluido en ventas totales</li>
                <li>• Productos activos, variantes, SKU e inventario de Shopify</li>
                <li>• Canales y clientes para análisis comercial</li>
                <li>• Customers, segmentos, recurrencia</li>
                <li>• Canales: Online Store, Draft Orders, Mobile</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-accent font-medium mb-2">MM + Sheet/manual</div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>• Material Manager: BOM, COGS, materiales, proporciones</li>
                <li>• Sheet Expenses: gastos históricos reales</li>
                <li>• Manual OS: gastos nuevos, pagado con, moneda, TRM</li>
                <li>• Caja operativa: Nequi, Nu, Mercado Pago y deuda Nu crédito</li>
                <li>• Dataico: Phase 3 futura, no implementado todavía</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
            Plan: Phase 2 reemplaza Material Manager dentro del OS; Phase 3 evalúa Dataico para capa fiscal/contable, sin asumir integración hoy.
          </div>
        </Card>
      </section>
    </Layout>
  );
}
