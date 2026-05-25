import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import type { MmMaterialRow, PoLineMatchSuggestion } from '@shared/schema';

// Read-only suggestions UI for historical PO lines that don't yet have a
// canonical material id. The user MUST click "Aplicar" to commit a match — the
// matcher never auto-applies destructive changes.
export function PoLineMatcher() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [includeAll, setIncludeAll] = useState(false);
  const [overrideById, setOverrideById] = useState<Record<number, string>>({});

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
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Matcher de líneas de PO sin material</h3>
          <p className="text-xs text-muted-foreground max-w-prose">
            Sugiere un material canónico (SKU exacto &gt; nombre exacto &gt; coincidencia parcial). Nada se aplica hasta que
            tú hagas click — preserva todas las POs históricas que ya importamos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">{totalUnmatched} líneas</Badge>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={includeAll} onChange={e => setIncludeAll(e.target.checked)} data-testid="checkbox-match-include-all" />
            Mostrar también ya matched
          </label>
        </div>
      </div>

      {suggestions.isLoading ? (
        <p className="text-xs text-muted-foreground py-4">Calculando sugerencias…</p>
      ) : totalUnmatched === 0 ? (
        <p className="text-xs text-emerald-300 py-3 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Todas las líneas de PO tienen material canónico.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Línea (producto · SKU)</TableHead>
                <TableHead>Sugerencias</TableHead>
                <TableHead>Asignar manual</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suggestions.data ?? []).slice(0, 200).map(row => {
                const picks: Array<{ id: string; label: string; tag: string }> = [];
                if (row.exactSkuMatch) picks.push({ id: row.exactSkuMatch.materialId, label: row.exactSkuMatch.name, tag: 'exact SKU' });
                if (row.exactNameMatch) picks.push({ id: row.exactNameMatch.materialId, label: row.exactNameMatch.name, tag: 'exact name' });
                row.fuzzySuggestions.forEach(f => {
                  if (!picks.find(p => p.id === f.materialId)) {
                    picks.push({ id: f.materialId, label: f.name, tag: `fuzzy ${(f.score * 100).toFixed(0)}%` });
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
                        <span className="text-[11px] text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Sin sugerencias automáticas</span>
                      ) : picks.map(p => (
                        <div key={p.id} className="text-[11.5px] flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9.5px] uppercase tracking-wider">{p.tag}</Badge>
                          <span className="truncate" title={p.label}>{p.label}</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <select
                        value={manual}
                        onChange={e => setOverrideById(prev => ({ ...prev, [row.lineId]: e.target.value }))}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px]"
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
                      <Button
                        size="sm"
                        disabled={!applyTarget || apply.isPending}
                        onClick={() => apply.mutate({ lineId: row.lineId, materialId: applyTarget })}
                        data-testid={`button-apply-match-${row.lineId}`}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Aplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clear.mutate(row.lineId)}
                        disabled={clear.isPending}
                        data-testid={`button-clear-match-${row.lineId}`}
                      >
                        Limpiar
                      </Button>
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
