import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import type { Alert } from '@shared/schema';
import { AlertTriangle, AlertCircle, Info, ArrowRight } from 'lucide-react';

const LEVEL_META = {
  critical: { icon: AlertTriangle, label: 'Crítica', cls: 'bg-destructive/15 text-rose-300 border-destructive/30' },
  warn:     { icon: AlertCircle,   label: 'Atención', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  info:     { icon: Info,           label: 'Aviso',   cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
} as const;

export default function Alertas() {
  const alerts = useQuery<Alert[]>({ queryKey: ['/api/alerts'] });

  const grouped = (alerts.data ?? []).reduce((acc, a) => {
    (acc[a.level] ||= []).push(a);
    return acc;
  }, {} as Record<Alert['level'], Alert[]>);

  return (
    <Layout title="Alertas" subtitle="Prioridades operativas y financieras">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(['critical', 'warn', 'info'] as const).map(lvl => {
          const meta = LEVEL_META[lvl];
          const Icon = meta.icon;
          const count = grouped[lvl]?.length ?? 0;
          return (
            <Card key={lvl} className={`p-5 bg-card border-card-border`} data-testid={`card-summary-${lvl}`}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${meta.cls}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-[26px] font-semibold tabular leading-none" data-testid={`count-${lvl}`}>{count}</div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1">{meta.label}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        {(alerts.data ?? []).map(a => {
          const meta = LEVEL_META[a.level];
          const Icon = meta.icon;
          return (
            <Card key={a.id} className="p-5 bg-card border-card-border" data-testid={`alert-${a.id}`}>
              <div className="flex items-start gap-4">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${meta.cls}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold tracking-tight" data-testid={`alert-title-${a.id}`}>{a.title}</h3>
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${meta.cls}`}>
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {a.area}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed" data-testid={`alert-desc-${a.id}`}>{a.description}</p>
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-card-border bg-muted/30 px-3 py-2.5">
                    <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <p className="text-[13px] leading-relaxed" data-testid={`alert-rec-${a.id}`}>
                      <span className="font-medium">Acción sugerida — </span>
                      {a.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </section>
    </Layout>
  );
}
