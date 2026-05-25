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
import {
  Search, Package, AlertTriangle, ShieldCheck, Info, Download,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

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

// ── Grouping ──────────────────────────────────────────────────────────────────
// Categories shown in the default "Vista simple" view. Each row is one
// presentation/blend tier that shares (or should share) the same retail and
// pricing behavior. CBDoble is split out because its retail differs.
//
// We don't change any pricing math here — we only bucket the existing rows so
// the page can be presented to a B2B prospect without overwhelming them.
function isCbDoble(r: B2bPricingRow): boolean {
  return /cb[\s-]?doble|cbdoble/i.test(`${r.name} ${r.sku ?? ''}`);
}

function categoryFor(r: B2bPricingRow): string {
  const name = r.name.toLowerCase();
  const fam = r.family.toLowerCase();
  const cb = isCbDoble(r);

  if (fam.includes('hongo')) {
    if (/30\s*gramos|· 30/.test(r.name)) return 'Hongos funcionales · 30 g';
    if (/90\s*gramos|· 90/.test(r.name)) return 'Hongos funcionales · 90 g';
    return 'Hongos funcionales';
  }

  if (name.includes('desechable')) {
    return cb
      ? 'Desechables 4 mL · CBDoble'
      : 'Desechables 4 mL · cannabinoides';
  }

  if (name.includes('cartucho')) {
    const is225 = /2\.?25\s*ml/.test(name);
    const is1 = /\b1\s*ml\b/.test(name);
    if (is225) return cb ? 'Cartuchos 2.25 mL · CBDoble' : 'Cartuchos 2.25 mL · cannabinoides';
    if (is1) return cb ? 'Cartuchos 1 mL · CBDoble' : 'Cartuchos 1 mL · cannabinoides';
    return 'Cartuchos';
  }

  if (fam.includes('recarga') || name.includes('jeringa') || name.includes('destilado')) {
    const isDestilado = name.includes('destilado');
    const pres = (r.presentation ?? '').toLowerCase();
    const presName = pres || (
      /tarro\s*5/.test(name) ? 'tarro 5ml' :
      /tarro\s*10/.test(name) ? 'tarro 10ml' :
      /jeringa\s*10/.test(name) ? 'jeringa 10ml' :
      /jeringa\s*5/.test(name) ? 'jeringa 5ml' :
      /jeringa\s*1/.test(name) ? 'jeringa 1ml' :
      'jeringa'
    );

    const presLabel =
      /tarro\s*10/.test(presName) ? 'Tarro 10 mL' :
      /tarro\s*5/.test(presName) ? 'Tarro 5 mL' :
      /jeringa\s*10/.test(presName) ? 'Jeringa 10 mL' :
      /jeringa\s*5/.test(presName) ? 'Jeringa 5 mL' :
      /jeringa\s*1/.test(presName) ? 'Jeringa 1 mL' :
      'Jeringa';

    if (isDestilado) return `Destilados a granel · ${presLabel}`;
    return cb
      ? `Recargas · CBDoble · ${presLabel}`
      : `Recargas · cannabinoides · ${presLabel}`;
  }

  return r.family || 'Otros';
}

type GroupRow = {
  key: string;
  category: string;
  items: B2bPricingRow[];
  // Aggregations
  retailMin: number;
  retailMax: number;
  cogsMin: number | null;
  cogsMax: number | null;
  retailMarginMin: number | null;
  retailMarginMax: number | null;
  tier100MarginMin: number | null;
  tier100MarginMax: number | null;
  // Tier price ranges
  tierRanges: { units: number; min: number | null; max: number | null; allEqual: boolean }[];
  // Status: worst across the group (sin_cogs > margen_bajo > ok_b2b)
  status: B2bPricingRow['status'];
  // True when retail prices match across the group (so we can show one number).
  retailAllEqual: boolean;
  // True when COGS values match exactly (rare but possible).
  cogsAllEqual: boolean;
};

function aggregateGroup(category: string, items: B2bPricingRow[]): GroupRow {
  const retails = items.map(r => r.retailPrice).filter(v => v > 0);
  const cogs = items.map(r => r.cogs).filter((v): v is number => v !== null);
  const retailMargins = items.map(r => r.retailMargin).filter((v): v is number => v !== null);
  const tier100Margins = items
    .map(r => r.tiers.find(t => t.units === 100)?.connabisMargin)
    .filter((v): v is number => v !== null && v !== undefined);

  const tierRanges = TIER_UNITS.map(u => {
    const prices = items
      .map(r => r.tiers.find(t => t.units === u)?.price)
      .filter((v): v is number => v !== null && v !== undefined);
    if (prices.length === 0) return { units: u, min: null, max: null, allEqual: true };
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { units: u, min, max, allEqual: min === max };
  });

  const statusRank = { sin_cogs: 2, margen_bajo: 1, ok_b2b: 0 } as const;
  const status = items.reduce<B2bPricingRow['status']>((acc, r) => {
    return statusRank[r.status] > statusRank[acc] ? r.status : acc;
  }, 'ok_b2b');

  return {
    key: category,
    category,
    items,
    retailMin: retails.length ? Math.min(...retails) : 0,
    retailMax: retails.length ? Math.max(...retails) : 0,
    cogsMin: cogs.length ? Math.min(...cogs) : null,
    cogsMax: cogs.length ? Math.max(...cogs) : null,
    retailMarginMin: retailMargins.length ? Math.min(...retailMargins) : null,
    retailMarginMax: retailMargins.length ? Math.max(...retailMargins) : null,
    tier100MarginMin: tier100Margins.length ? Math.min(...tier100Margins) : null,
    tier100MarginMax: tier100Margins.length ? Math.max(...tier100Margins) : null,
    tierRanges,
    status,
    retailAllEqual: retails.length > 0 && Math.min(...retails) === Math.max(...retails),
    cogsAllEqual: cogs.length > 0 && Math.min(...cogs) === Math.max(...cogs),
  };
}

function formatRange(min: number | null, max: number | null, fmt: (v: number) => string): string {
  if (min === null || max === null) return '—';
  if (min === max) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

export default function ConnabisCo() {
  const query = useQuery<B2bPricingResponse>({ queryKey: ['/api/b2b-pricing'] });
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<'todos' | B2bPricingRow['status']>('todos');
  const [sortKey, setSortKey] = useState<SortKey>('retailMargin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [view, setView] = useState<'simple' | 'detallada'>('simple');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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

  // Build grouped view from the same filtered rows so search/filter still works.
  const groups = useMemo<GroupRow[]>(() => {
    const buckets = new Map<string, B2bPricingRow[]>();
    for (const r of filtered) {
      const cat = categoryFor(r);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(r);
    }
    return Array.from(buckets.entries())
      .map(([cat, items]) => aggregateGroup(cat, items))
      .sort((a, b) => a.category.localeCompare(b.category, 'es'));
  }, [filtered]);

  const totalGroups = groups.length;
  const totalDetail = filtered.length;

  const exportCsv = () => {
    const header = [
      'Categoría', 'Producto', 'SKU', 'Familia', 'Precio retail', 'COGS', 'Fuente COGS', 'Margen retail',
      ...TIER_UNITS.flatMap(u => [`Precio ${u}u`, `Margen Connabis ${u}u`, `Margen reseller ${u}u`]),
      'Estado', 'Advertencias',
    ];
    const lines = [header.join(',')];
    filtered.forEach(r => {
      const cells: (string | number)[] = [
        `"${categoryFor(r).replace(/"/g, '""')}"`,
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

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    groups.forEach(g => { all[g.key] = true; });
    setOpenGroups(all);
  };
  const collapseAll = () => setOpenGroups({});

  const statusBadge = (status: B2bPricingRow['status']) =>
    status === 'sin_cogs' ? <Badge variant="outline" className="text-amber-700 border-amber-400">Sin COGS</Badge> :
    status === 'margen_bajo' ? <Badge variant="outline" className="text-orange-700 border-orange-400">Margen bajo</Badge> :
    <Badge variant="outline" className="text-emerald-700 border-emerald-400">OK B2B</Badge>;

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
            <p className="font-medium mb-1">
              Vista para presentar B2B · abre una categoría para ver SKUs exactos
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong>Vista simple</strong> (por defecto): una fila por categoría/blend con el precio retail
                de referencia y el rango de precios B2B por tier. Ideal para mostrar a un cliente o reseller
                sin saturarlo.
              </li>
              <li>
                <strong>Vista detallada</strong>: una fila por SKU/variante exacta. Usar para cerrar la cotización.
              </li>
              <li>
                <strong>Blends de cannabinoides</strong>: hoy comparten retail (excepto <em>CBDoble</em>, que es
                más económico). Se agrupan dentro de cada categoría; CBDoble va aparte.
              </li>
              <li>
                <strong>Hongos funcionales</strong>: comparten retail por presentación (30 g / 90 g) pero el COGS
                varía por especie. La vista simple muestra <em>rango</em> de COGS y de precios B2B; los exactos
                viven en el dropdown.
              </li>
              <li>
                <strong>Fórmula</strong> sin cambios: COGS via Material Manager &gt; Shopify &gt; override.
                Margen objetivo Connabis 55→40% según tier; reseller 15→35% vs retail. Techo retail 95%.
                Detalle en <code>B2B_PRICING.md</code>.
              </li>
              <li>
                Texto naranja = margen reseller bajo el objetivo del tier. Esta tabla es <strong>propuesta
                interna</strong>; no se publica ni se escribe a Shopify.
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
          <div className="inline-flex rounded-md border border-input overflow-hidden" data-testid="toggle-view-b2b">
            <button
              type="button"
              onClick={() => setView('simple')}
              className={`px-3 h-9 text-sm ${view === 'simple' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}
            >
              Vista simple
            </button>
            <button
              type="button"
              onClick={() => setView('detallada')}
              className={`px-3 h-9 text-sm border-l border-input ${view === 'detallada' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}
            >
              Vista detallada
            </button>
          </div>
          {view === 'simple' && (
            <div className="inline-flex gap-1">
              <Button variant="ghost" size="sm" onClick={expandAll}>Abrir todo</Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>Cerrar todo</Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-b2b">
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV (detallado)
          </Button>
          <div className="text-xs text-muted-foreground ml-auto">
            {view === 'simple'
              ? `${totalGroups} categoría${totalGroups === 1 ? '' : 's'} · ${totalDetail} SKU${totalDetail === 1 ? '' : 's'}`
              : `${totalDetail} fila${totalDetail === 1 ? '' : 's'}`}
          </div>
        </div>
      </Card>

      {view === 'simple' ? (
        <Card className="overflow-x-auto" data-testid="card-b2b-table-grouped">
          <Table className="text-[12.5px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Categoría / blend</TableHead>
                <TableHead className="text-right whitespace-nowrap">Retail</TableHead>
                <TableHead className="text-right whitespace-nowrap">COGS</TableHead>
                <TableHead className="text-right whitespace-nowrap">Margen retail</TableHead>
                {TIER_UNITS.map(u => (
                  <TableHead key={u} className="text-right whitespace-nowrap">{u}u</TableHead>
                ))}
                <TableHead className="text-right whitespace-nowrap">Margen @ 100u</TableHead>
                <TableHead>SKUs</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-6">Cargando precios…</TableCell></TableRow>
              )}
              {!query.isLoading && groups.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-6">Sin productos para los filtros actuales.</TableCell></TableRow>
              )}
              {groups.map(g => {
                const open = !!openGroups[g.key];
                return (
                  <Fragment key={g.key}>
                    <TableRow
                      data-testid={`group-row-${g.key}`}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggleGroup(g.key)}
                    >
                      <TableCell>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{g.category}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {g.items.length} producto{g.items.length === 1 ? '' : 's'}
                          {g.retailAllEqual ? ' · mismo retail' : ' · retail varía'}
                          {g.cogsAllEqual ? ' · mismo COGS' : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRange(g.retailMin || null, g.retailMax || null, formatCOP)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRange(g.cogsMin, g.cogsMax, formatCOP)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRange(g.retailMarginMin, g.retailMarginMax, v => formatPct(v))}
                      </TableCell>
                      {g.tierRanges.map(tr => (
                        <TableCell key={tr.units} className="text-right tabular-nums">
                          {tr.min === null ? '—' :
                            tr.allEqual ? formatCOP(tr.min) :
                            <>
                              <div>{formatCOP(tr.min!)}</div>
                              <div className="text-[10.5px] text-muted-foreground">– {formatCOP(tr.max!)}</div>
                            </>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {formatRange(g.tier100MarginMin, g.tier100MarginMax, v => formatPct(v))}
                      </TableCell>
                      <TableCell className="tabular-nums">{g.items.length}</TableCell>
                      <TableCell>{statusBadge(g.status)}</TableCell>
                    </TableRow>
                    {open && g.items.map(r => {
                      const tier100 = r.tiers.find(t => t.units === 100);
                      return (
                        <TableRow key={`${g.key}::${r.id}`} data-testid={`detail-row-${r.id}`} className="bg-muted/20">
                          <TableCell />
                          <TableCell className="pl-8">
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
                          <TableCell />
                          <TableCell>{statusBadge(r.status)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
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
                return (
                  <TableRow key={r.id} data-testid={`row-b2b-${r.id}`}>
                    <TableCell className="font-medium">
                      <div>{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.sku ?? '—'} · {r.family} · {categoryFor(r)}</div>
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
                    <TableCell>{statusBadge(r.status)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        {view === 'simple'
          ? 'Cada fila agrupa SKUs que comparten retail y comportamiento de pricing. Si los precios de tier difieren dentro del grupo, se muestra el rango (mín – máx); abre la fila para ver el detalle por SKU.'
          : 'Cada celda de tier muestra el precio sugerido y, debajo, margen Connabis / margen reseller. Texto naranja = margen reseller bajo el objetivo del tier.'}
      </p>
    </Layout>
  );
}
