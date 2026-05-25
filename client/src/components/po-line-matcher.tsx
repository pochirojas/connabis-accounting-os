import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, AlertTriangle, Sparkles, HelpCircle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import type { MmMaterialRow, PoLineMatchSuggestion } from '@shared/schema';

// Read-only suggestions UI for historical PO lines that don't yet have a
// canonical material id. The user MUST click "Aplicar" to commit a match — the
// matcher never auto-applies destructive changes.

// Small helper: wrap any node with a hover tooltip without changing layout.
function Hint({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[11.5px] leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

function InfoDot({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Más información" className="text-muted-foreground hover:text-foreground transition-colors">
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[11.5px] leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

export function PoLineMatcher() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [includeAll, setIncludeAll] = useState(false);
  const [overrideById, setOverrideById] = useState<Record<number, string>>({});
  const [helpOpen, setHelpOpen] = useState(false);

  const suggestions = useQuery<PoLineMatchSuggestion[]>({
    queryKey: ['/api/material-manager/purchase-orders/match/suggestions', includeAll ? 'all' : 'unmatched'],
    queryFn: async () => {
      const url = `/api/material-manager/purchase-orders/match/suggestions${includeAll ? '?all=1' : ''}`;
      const response = await apiRequest('GET', url);
      return response.json();
    },
  });
  const materials = useQuery<MmMaterialRow[]>({ queryKey: ['/api/material-manager/materials'] });

  const apply = useMutation({
    mutationFn: async ({ lineId, materialId }: { lineId: number; materialId: string }) => {
      const response = await apiRequest('POST', `/api/material-manager/purchase-orders/lines/${lineId}/match`, { materialId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Match aplicado', description: 'La línea ya apunta a un material canónico. Recibir la PO ahora actualiza stock.' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders/match/suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders'] });
    },
    onError: (error) => toast({ title: 'No se pudo aplicar', description: String(error), variant: 'destructive' }),
  });

  const clear = useMutation({
    mutationFn: async (lineId: number) => {
      const response = await apiRequest('DELETE', `/api/material-manager/purchase-orders/lines/${lineId}/match`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Match limpiado' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders/match/suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders'] });
    },
  });

  const totalUnmatched = useMemo(() => (suggestions.data ?? []).length, [suggestions.data]);

  return (
    <Card className="p-5" data-testid="card-po-matcher">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight inline-flex items-center gap-1.5">
            Matcher de líneas de PO sin material
            <InfoDot text="Conecta líneas importadas de POs históricas con materiales canónicos. Cuando hay match, recibir la PO crea batches de inventario y actualiza el costo del material. No toca el CSV original." />
          </h3>
          <p className="text-xs text-muted-foreground max-w-prose">
            Sugiere un material canónico (SKU exacto &gt; nombre exacto &gt; coincidencia parcial).
            <strong className="text-foreground/80"> Nada se aplica hasta que tú hagas click en “Aplicar”</strong> —
            el CSV histórico no cambia, solo se asocia la línea a un material existente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Hint text={`${totalUnmatched} línea(s) de PO que aún no tienen material canónico asociado. Recibir estas POs no afecta stock hasta resolverlas.`}>
            <Badge variant="outline" className="text-[11px]" data-testid="badge-matcher-count">{totalUnmatched} líneas</Badge>
          </Hint>
          <Hint text="Si está activo, también lista las líneas que YA tienen material asignado, para que puedas re-asignar o limpiar. Si está apagado, solo verás las pendientes.">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={includeAll} onChange={e => setIncludeAll(e.target.checked)} data-testid="checkbox-match-include-all" />
              Mostrar también ya matched
            </label>
          </Hint>
        </div>
      </div>

      {/* Inline collapsible help — short, plain-Spanish explanation. */}
      <div className="mb-3 rounded-md border border-border/50 bg-muted/20">
        <button
          type="button"
          onClick={() => setHelpOpen(v => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-matcher-help"
        >
          {helpOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <HelpCircle className="h-3.5 w-3.5" />
          ¿Qué significa esto?
        </button>
        {helpOpen ? (
          <ul className="px-3 pb-3 pt-1 text-[11.5px] text-muted-foreground space-y-1.5 list-disc list-inside marker:text-muted-foreground/60">
            <li>
              <strong className="text-foreground/85">Por qué importa:</strong> las POs históricas se importaron desde CSV con nombres y SKUs sueltos.
              Si una línea no apunta a un material canónico, recibir esa PO <em>no</em> sube stock ni actualiza el costo del material.
            </li>
            <li>
              <strong className="text-foreground/85">Qué pasa al aplicar:</strong> guardamos un puntero <code>línea de PO → material</code>.
              El CSV no se modifica. La próxima vez que recibas la PO, esa línea creará un batch de inventario con el costo aterrizado correcto.
            </li>
            <li>
              <strong className="text-foreground/85">Si la sugerencia está mal:</strong> elegí el material correcto en “Asignar manual” antes de aplicar,
              o usá “Limpiar” para borrar un match previo equivocado.
            </li>
          </ul>
        ) : null}
      </div>

      {suggestions.isLoading ? (
        <p className="text-xs text-muted-foreground py-4">Calculando sugerencias…</p>
      ) : totalUnmatched === 0 ? (
        <div className="py-6 text-center space-y-1.5" data-testid="state-matcher-empty">
          <p className="text-sm text-emerald-300 inline-flex items-center gap-1.5 justify-center">
            <CheckCircle2 className="h-4 w-4" />
            {includeAll ? 'No hay líneas para mostrar.' : 'Todas las líneas de PO tienen material canónico.'}
          </p>
          {!includeAll ? (
            <p className="text-[11px] text-muted-foreground">
              Recibir cualquier PO ahora actualiza stock y costo correctamente. Activá “Mostrar también ya matched” para revisar asignaciones existentes.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Hint text="Número de la orden de compra de la cual viene esta línea (ej: PO09).">
                    <span className="inline-flex items-center gap-1">PO <Info className="h-3 w-3 text-muted-foreground/70" /></span>
                  </Hint>
                </TableHead>
                <TableHead>
                  <Hint text="Producto y SKU tal como aparecen en el CSV importado. Lo que el proveedor escribió.">
                    <span className="inline-flex items-center gap-1">Línea (producto · SKU) <Info className="h-3 w-3 text-muted-foreground/70" /></span>
                  </Hint>
                </TableHead>
                <TableHead>
                  <Hint text="Materiales canónicos candidatos. Orden: SKU exacto > nombre exacto > coincidencia parcial. El primero es la sugerencia top que se aplica si no eliges manual.">
                    <span className="inline-flex items-center gap-1">Sugerencias <Info className="h-3 w-3 text-muted-foreground/70" /></span>
                  </Hint>
                </TableHead>
                <TableHead>
                  <Hint text="Forzar un material específico. Si seleccionás uno acá, gana sobre la sugerencia top al aplicar.">
                    <span className="inline-flex items-center gap-1">Asignar manual <Info className="h-3 w-3 text-muted-foreground/70" /></span>
                  </Hint>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suggestions.data ?? []).slice(0, 200).map(row => {
                const picks: Array<{ id: string; label: string; tag: string; kind: 'exact-sku' | 'exact-name' | 'fuzzy' }> = [];
                if (row.exactSkuMatch) picks.push({ id: row.exactSkuMatch.materialId, label: row.exactSkuMatch.name, tag: 'exact SKU', kind: 'exact-sku' });
                if (row.exactNameMatch) picks.push({ id: row.exactNameMatch.materialId, label: row.exactNameMatch.name, tag: 'exact name', kind: 'exact-name' });
                row.fuzzySuggestions.forEach(f => {
                  if (!picks.find(p => p.id === f.materialId)) {
                    picks.push({ id: f.materialId, label: f.name, tag: `fuzzy ${(f.score * 100).toFixed(0)}%`, kind: 'fuzzy' });
                  }
                });
                const manual = overrideById[row.lineId] ?? '';
                const bestPick = picks[0];
                const applyTarget = manual || bestPick?.id || '';
                return (
                  <TableRow key={row.lineId} data-testid={`row-matcher-${row.lineId}`}>
                    <TableCell className="text-[12px] font-mono">{row.poNumber}</TableCell>
                    <TableCell className="text-[12.5px]">
                      <div className="font-medium">{row.product || '—'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{row.sku || 'sin SKU'}</div>
                    </TableCell>
                    <TableCell className="space-y-1 max-w-[280px]">
                      {picks.length === 0 ? (
                        <Hint text="No encontramos ningún material canónico que coincida. Asignalo manualmente con el dropdown de la derecha.">
                          <span className="text-[11px] text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Sin sugerencias automáticas</span>
                        </Hint>
                      ) : picks.map(p => {
                        const tagTip =
                          p.kind === 'exact-sku' ? 'Coincidencia exacta de SKU — alta confianza.' :
                          p.kind === 'exact-name' ? 'Coincidencia exacta del nombre del producto — alta confianza.' :
                          'Coincidencia parcial / difusa. Revisá antes de aplicar; el % indica qué tan parecido es.';
                        return (
                          <div key={p.id} className="text-[11.5px] flex items-center gap-1.5">
                            <Hint text={tagTip}>
                              <Badge variant="outline" className="text-[9.5px] uppercase tracking-wider cursor-help">{p.tag}</Badge>
                            </Hint>
                            <span className="truncate" title={p.label}>{p.label}</span>
                          </div>
                        );
                      })}
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <select
                        value={manual}
                        onChange={e => setOverrideById(prev => ({ ...prev, [row.lineId]: e.target.value }))}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px]"
                        title="Elegí un material específico para esta línea. Si lo dejás en '— usar sugerencia top —', al aplicar se usa el primer candidato de la columna Sugerencias."
                        data-testid={`select-manual-match-${row.lineId}`}
                      >
                        <option value="">— usar sugerencia top —</option>
                        {(materials.data ?? []).map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.sku ? `· ${m.sku}` : ''}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Hint text="Guarda el match línea → material. No modifica el CSV. Al recibir la PO, esta línea creará movimiento de inventario.">
                        <Button
                          size="sm"
                          disabled={!applyTarget || apply.isPending}
                          onClick={() => apply.mutate({ lineId: row.lineId, materialId: applyTarget })}
                          data-testid={`button-apply-match-${row.lineId}`}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Aplicar
                        </Button>
                      </Hint>
                      <Hint text="Borra el material asociado a esta línea. La línea vuelve a quedar sin material canónico (no afecta inventario ya recibido).">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => clear.mutate(row.lineId)}
                          disabled={clear.isPending}
                          data-testid={`button-clear-match-${row.lineId}`}
                        >
                          Limpiar
                        </Button>
                      </Hint>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalUnmatched > 200 ? (
            <p className="text-[10.5px] text-muted-foreground mt-2">Mostrando 200 de {totalUnmatched}. Aplica matches para reducir la cola.</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
