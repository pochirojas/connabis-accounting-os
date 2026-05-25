import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCOP, formatPct } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Search, Package, AlertTriangle, ShieldCheck, Info, Download } from 'lucide-react';
import { useMemo, useState } from 'react';

type B2bTierRow = {
  units: number;
  price: number | null;
  connabisMargin: number | null;
  resellerMargin: number | null;
  flags: string[];
};

type B2bPricingRow = {
  id: string;
  name: string;
  sku?: string;
  family: string;
  active: boolean;
  presentation?: string | null;
  retailPrice: number;
  cogs: number | null;
  cogsSource: string;
  retailMargin: number | null;
  tiers: B2bTierRow[];
  status: 'sin_cogs' | 'margen_bajo' | 'ok_b2b';
  warnings: string[];
};

type B2bPricingResponse = {
  rows: B2bPricingRow[];
  summary: {
    eligible: number;
    excludedWaterSoluble: number;
    withoutCogs: number;
    avgRetailMargin: number;
    avgB2bMarginAt100: number;
    avgResellerMarginAt100: number;
  };
};

const TIER_UNITS = [25, 50, 100, 200, 500, 1000] as const;
type SortKey = 'name' | 'retailPrice' | 'retailMargin' | 'tier100Margin';

export default function ConnabisCo() {
  const query = useQuery<B2bPricingResponse>({ queryKey: ['/api/b2b-pricing'] });
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<'todos' | B2bPricingRow['status']>('todos');
  const [sortKey, setSortKey] = useState<SortKey>('retailMargin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = query.data?.rows ?? [];
  const summary = query.data?.summary;

  const families = useMemo(() => ['Todas', ...Array.from(new Set(rows.map(r => r.family)))], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter(r => {
      const matchesSearch = !q || `${r.name} ${r.sku ?? ''} ${r.family}`.toLowerCase().includes(q);
      const matchesFamily = family === 'Todas' || r.family === family;
      const matchesStatus = statusFilter === 'todos' || r.status === statusFilter;
      return matchesSearch && matchesFamily && matchesStatus;
    });
    const dirMul = sortDir === 'desc' ? -1 : 1;
    const getValue = (r: B2bPricingRow): number | string => {
      if (sortKey === 'name') return r.name;
      if (sortKey === 'retailPrice') return r.retailPrice;
      if (sortKey === 'retailMargin') return r.retailMargin ?? -1;
      if (sortKey === 'tier100Margin') return r.tiers.find(t => t.units === 100)?.connabisMargin ?? -1;
      return 0;
    };
    return result.slice().sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dirMul;
      return ((av as number) - (bv as number)) * dirMul;
    });
  }, [rows, search, family, statusFilter, sortKey, sortDir]);

  const exportCsv = () => {
    const header = [
      'Producto', 'SKU', 'Familia', 'Precio retail', 'COGS', 'Fuente COGS', 'Margen retail',
      ...TIER_UNITS.flatMap(u => [`Precio ${u}u`, `Margen Connabis ${u}u`, `Margen reseller ${u}u`]),
      'Estado', 'Advertencias',
    ];
    const lines = [header.join(',')];
    filtered.forEach(r => {
      const cells: (string | number)[] = [
        `"${r.name.replace(/"/g, '""')}"`,
        r.sku ?? '',
        r.family,
        r.retailPrice,
        r.cogs ?? '',
        r.cogsSource,
        r.retailMargin ?? '',
      ];
      TIER_UNITS.forEach(u => {
        const t = r.tiers.find(x => x.units === u);
        cells.push(t?.price ?? '');
        cells.push(t?.connabisMargin ?? '');
        cells.push(t?.resellerMargin ?? '');
      });
      cells.push(r.status);
      cells.push(`"${r.warnings.join(' · ')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `connabis-co-b2b-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <Layout
      title="Connabis & Co"
      subtitle="Precios B2B sugeridos por volumen · cálculo determinístico desde COGS y retail vigentes"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard
          icon={Package}
          label="Productos elegibles"
          value={String(summary?.eligible ?? '—')}
          hint={summary ? `${summary.excludedWaterSoluble} solubles excluidos` : undefined}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Sin COGS"
          value={String(summary?.withoutCogs ?? '—')}
          hint="Cargar BOM o unitCost"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Margen retail promedio"
          value={summary ? formatPct(summary.avgRetailMargin) : '—'}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Margen Connabis @ 100u"
          value={summary ? formatPct(summary.avgB2bMarginAt100) : '—'}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Margen reseller @ 100u"
          value={summary ? formatPct(summary.avgResellerMarginAt100) : '—'}
        />
      </div>

      <Card className="p-4 mb-5 border-l-4 border-l-amber-400/70" data-testid="card-explainer">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
          <div className="text-sm leading-relaxed">
            <p className="font-medium mb-1">Cómo se calculan los precios B2B (borrador / propuesta)</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong>COGS:</strong> fuente única — Material Manager BOM &gt; Shopify unitCost &gt; override manual.
                Si no hay COGS, la fila se marca <em>"Sin COGS"</em> y no se sugiere precio.
              </li>
              <li>
                <strong>Retail:</strong> precio actual del producto activo en Shopify; sirve de techo (máx ~95%).
              </li>
              <li>
                <strong>Margen objetivo Connabis</strong> por tier: 25u 55%, 50u 52%, 100u 48%, 200u 45%, 500u 42%, 1000u 40%.
              </li>
              <li>
                <strong>Margen reseller objetivo</strong> vs retail: 25u 15%, 50u 18%, 100u 22%, 200u 25%, 500u 30%, 1000u 35%.
              </li>
              <li>
                Si los objetivos chocan, se prioriza el margen de Connabis y se marca <em>"poco margen reseller"</em>.
              </li>
              <li>
                <strong>Redondeo:</strong> al múltiplo más cercano de 500 COP (&lt; 50k), 1.000 COP (&lt; 200k) o 5.000 COP (&gt;= 200k);
                nunca por debajo del piso de margen Connabis.
              </li>
              <li>Se excluyen productos <em>solubles en agua</em>.</li>
              <li>
                Esta tabla es <strong>propuesta interna</strong>; no se publica ni se escribe a Shopify.
                Ajustes de fórmula viven en <code>server/b2b-pricing.ts</code>.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nombre, SKU o familia…"
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-b2b"
            />
          </div>
          <select
            value={family}
            onChange={e => setFamily(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-family-b2b"
          >
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-status-b2b"
          >
            <option value="todos">Todos los estados</option>
            <option value="ok_b2b">OK B2B</option>
            <option value="margen_bajo">Margen bajo</option>
            <option value="sin_cogs">Sin COGS</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-b2b">
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
          <div className="text-xs text-muted-foreground ml-auto">
            {filtered.length} fila{filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto" data-testid="card-b2b-table">
        <Table className="text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('name')}>Producto</TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => setSort('retailPrice')}>Retail</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => setSort('retailMargin')}>Margen retail</TableHead>
              {TIER_UNITS.map(u => (
                <TableHead key={u} className="text-right whitespace-nowrap">
                  {u}u
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">Margen @ 100u</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Cargando precios…</TableCell></TableRow>
            )}
            {!query.isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Sin productos para los filtros actuales.</TableCell></TableRow>
            )}
            {filtered.map(r => {
              const tier100 = r.tiers.find(t => t.units === 100);
              const statusBadge =
                r.status === 'sin_cogs' ? <Badge variant="outline" className="text-amber-700 border-amber-400">Sin COGS</Badge> :
                r.status === 'margen_bajo' ? <Badge variant="outline" className="text-orange-700 border-orange-400">Margen bajo</Badge> :
                <Badge variant="outline" className="text-emerald-700 border-emerald-400">OK B2B</Badge>;
              return (
                <TableRow key={r.id} data-testid={`row-b2b-${r.id}`}>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.sku ?? '—'} · {r.family}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.retailPrice > 0 ? formatCOP(r.retailPrice) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cogs !== null ? formatCOP(r.cogs) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.retailMargin !== null ? formatPct(r.retailMargin) : '—'}</TableCell>
                  {TIER_UNITS.map(u => {
                    const t = r.tiers.find(x => x.units === u);
                    if (!t || t.price === null) {
                      return <TableCell key={u} className="text-right text-muted-foreground">—</TableCell>;
                    }
                    const low = t.flags.includes('poco_margen_reseller');
                    return (
                      <TableCell key={u} className="text-right tabular-nums">
                        <div className={low ? 'text-orange-600' : ''}>{formatCOP(t.price)}</div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {t.connabisMargin !== null ? formatPct(t.connabisMargin) : '—'} / {t.resellerMargin !== null ? formatPct(t.resellerMargin) : '—'}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums">
                    {tier100?.connabisMargin !== undefined && tier100?.connabisMargin !== null ? formatPct(tier100.connabisMargin) : '—'}
                  </TableCell>
                  <TableCell>{statusBadge}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Cada celda de tier muestra el precio sugerido y, debajo, <em>margen Connabis / margen reseller</em>.
        Texto naranja = margen reseller bajo el objetivo del tier.
      </p>
    </Layout>
  );
}
