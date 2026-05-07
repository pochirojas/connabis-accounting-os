import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import type { AccountingSuggestion } from '@shared/schema';
import { Bell, Brain, Calculator, Lightbulb } from 'lucide-react';

const ICONS = {
  prediccion: Brain,
  analisis: Calculator,
  sugerencia: Lightbulb,
  recordatorio: Bell,
};

export default function Sugerencias() {
  const suggestions = useQuery<AccountingSuggestion[]>({ queryKey: ['/api/accounting-suggestions'] });

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
