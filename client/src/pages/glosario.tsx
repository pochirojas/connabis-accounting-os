import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import type { GlossaryTerm } from '@shared/schema';
import { BookOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const CATEGORIES = ['Todos', 'finanzas', 'shopify', 'margen', 'inventario', 'crecimiento'] as const;

export default function Glosario() {
  const glossary = useQuery<GlossaryTerm[]>({ queryKey: ['/api/glossary'] });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Todos');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (glossary.data ?? []).filter(item => {
      const matchesCategory = category === 'Todos' || item.category === category;
      const matchesSearch = !q || `${item.term} ${item.short} ${item.formula ?? ''} ${item.connabisExample}`.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [category, glossary.data, search]);

  return (
    <Layout
      title="Diccionario de métricas"
      subtitle="Qué significa cada cifra, cómo se calcula y qué decisión debería ayudarte a tomar"
    >
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar: margen, COGS, AOV, Draft Orders..."
            className="pl-9"
            data-testid="input-glossary-search"
          />
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as (typeof CATEGORIES)[number])}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
          data-testid="select-glossary-category"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map(term => (
          <Card key={term.id} className="p-5 bg-card border-card-border" data-testid={`card-glossary-${term.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold tracking-tight">{term.term}</h2>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase">{term.category}</Badge>
            </div>
            <p className="mt-3 text-sm text-foreground/90 leading-relaxed">{term.short}</p>
            {term.formula && (
              <div className="mt-3 rounded-md border border-border bg-muted/25 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Fórmula</div>
                <div className="mt-1 font-mono text-xs text-accent" data-testid={`text-formula-${term.id}`}>{term.formula}</div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ejemplo Connabis</div>
                <p className="mt-1 text-xs leading-relaxed">{term.connabisExample}</p>
              </div>
              <div className="rounded-md border border-border bg-emerald-500/5 p-3">
                <div className="text-[11px] uppercase tracking-wider text-emerald-300">Qué hacer con esto</div>
                <p className="mt-1 text-xs leading-relaxed">{term.action}</p>
              </div>
            </div>
          </Card>
        ))}
      </section>

      {filtered.length === 0 && (
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground" data-testid="empty-glossary">
          No encontré términos con esos filtros.
        </Card>
      )}
    </Layout>
  );
}
