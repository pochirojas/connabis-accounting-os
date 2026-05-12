import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatCOP, formatNumber } from '@/lib/format';
import { Plus, Trash2 } from 'lucide-react';
import type { MmBomRow, MmBomDraftRow, MmMaterialRow, ProductBomDetail } from '@shared/schema';

type Variant = { id: string; name?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  productName?: string;
  variants: Variant[];           // legacy/numeric Shopify variant ids to pick from
  initialVariantId?: string;
};

function postJson(url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  }).then(async response => {
    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      throw new Error(errPayload.error || `${url} → ${response.status}`);
    }
    return response.json();
  });
}

export function ProductBomEditor({ open, onClose, productName, variants, initialVariantId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [variantId, setVariantId] = useState(initialVariantId ?? variants[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [newQty, setNewQty] = useState<Record<string, string>>({});

  // Reset variantId when initialVariantId changes
  useMemo(() => {
    if (initialVariantId && initialVariantId !== variantId) setVariantId(initialVariantId);
  }, [initialVariantId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const detail = useQuery<ProductBomDetail>({
    queryKey: [`/api/material-manager/variants/${variantId}/bom`],
    enabled: open && Boolean(variantId),
  });
  const materials = useQuery<MmMaterialRow[]>({
    queryKey: ['/api/material-manager/materials'],
    enabled: open,
  });

  const refetchDetail = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/material-manager/variants/${variantId}/bom`] });
    queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/material-manager/bom-drafts'] });
  };

  const createDraft = useMutation({
    mutationFn: (payload: { materialId: string; quantity: number; unit?: string }) =>
      postJson('/api/material-manager/bom-drafts', {
        variantId,
        materialId: payload.materialId,
        quantity: payload.quantity,
        unit: payload.unit,
        productName,
        variantName: variants.find(v => v.id === variantId)?.name,
      }),
    onSuccess: () => {
      toast({ title: 'Material añadido', description: 'Guardado como draft local (no se envía a MM/Shopify).' });
      refetchDetail();
    },
    onError: (error) => toast({ title: 'No se pudo añadir', description: String(error), variant: 'destructive' }),
  });

  const updateDraft = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      postJson(`/api/material-manager/bom-drafts/${id}`, { quantity }, 'PATCH'),
    onSuccess: () => { toast({ title: 'Draft actualizado' }); refetchDetail(); },
  });

  const deleteDraft = useMutation({
    mutationFn: (id: number) => postJson(`/api/material-manager/bom-drafts/${id}`, null, 'DELETE'),
    onSuccess: () => { toast({ title: 'Draft eliminado' }); refetchDetail(); },
  });

  const filteredMaterials = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = materials.data ?? [];
    if (!term) return list.slice(0, 25);
    return list.filter(m =>
      m.name.toLowerCase().includes(term) ||
      m.sku.toLowerCase().includes(term) ||
      m.category.toLowerCase().includes(term),
    ).slice(0, 25);
  }, [materials.data, search]);

  const imported = detail.data?.imported ?? [];
  const drafts = detail.data?.drafts ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-product-bom-editor">
        <DialogHeader>
          <DialogTitle>Raw materials · {productName ?? 'Producto'}</DialogTitle>
          <DialogDescription className="text-[12px]">
            <span className="inline-block rounded bg-amber-500/15 text-amber-200 px-2 py-0.5 text-[10.5px] uppercase tracking-wider mr-1">Draft OS BOM</span>
            <span>Editor local. Las filas <em>MM imported</em> son la fuente de verdad de Material Manager (solo lectura). Los <em>drafts locales</em> se guardan aparte y no se sincronizan con Shopify/MM hasta que decidamos promocionarlos.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Variante</div>
              <select
                value={variantId}
                onChange={e => setVariantId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-bom-variant"
              >
                {variants.length === 0 ? <option value="">Sin variantes disponibles</option> : null}
                {variants.map(v => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border bg-muted/25 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">COGS MM</div>
                <div className="mt-1 text-[12.5px] font-semibold tabular">{formatCOP(detail.data?.totalCost.imported ?? 0)}</div>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/8 p-2">
                <div className="text-[10px] uppercase tracking-wider text-amber-200">Draft Δ</div>
                <div className="mt-1 text-[12.5px] font-semibold tabular text-amber-200">+{formatCOP(detail.data?.totalCost.draftDelta ?? 0)}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/25 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Combinado</div>
                <div className="mt-1 text-[12.5px] font-semibold tabular">{formatCOP(detail.data?.totalCost.combined ?? 0)}</div>
              </div>
            </div>
          </div>

          <Card className="p-3" data-testid="card-bom-imported">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold tracking-tight">BOM Material Manager (solo lectura)</h3>
              <Badge variant="outline" className="text-[10px]">{imported.length} filas</Badge>
            </div>
            <BomRowsTable rows={imported} kind="mm" />
          </Card>

          <Card className="p-3 border-amber-500/30 bg-amber-500/8" data-testid="card-bom-drafts">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold tracking-tight text-amber-200">Draft local (no sincronizado)</h3>
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">{drafts.length} filas</Badge>
            </div>
            {drafts.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Sin drafts todavía. Añade materiales desde el selector abajo.</p>
            ) : (
              <DraftRowsTable
                rows={drafts}
                onUpdate={(id, qty) => updateDraft.mutate({ id, quantity: qty })}
                onDelete={(id) => deleteDraft.mutate(id)}
              />
            )}
          </Card>

          <Card className="p-3" data-testid="card-bom-add-material">
            <h3 className="text-sm font-semibold tracking-tight">Añadir material</h3>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar material por nombre, SKU o categoría…"
              className="mt-2"
              data-testid="input-bom-add-search"
            />
            <div className="mt-2 max-h-[260px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map(m => (
                    <TableRow key={m.id} data-testid={`row-add-material-${m.id}`}>
                      <TableCell>
                        <div className="text-[12.5px] font-medium">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground">{m.sku || '—'} · {m.measurement || '—'}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.category || '—'}</Badge></TableCell>
                      <TableCell className="text-right tabular text-[12px]">{formatCOP(m.cost)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-8 w-[90px] text-right tabular"
                          value={newQty[m.id] ?? ''}
                          onChange={e => setNewQty(prev => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder="0"
                          data-testid={`input-add-qty-${m.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!variantId || !newQty[m.id] || Number(newQty[m.id]) <= 0}
                          onClick={() => {
                            const qty = Number(newQty[m.id]);
                            if (!qty) return;
                            createDraft.mutate({ materialId: m.id, quantity: qty, unit: m.measurement });
                            setNewQty(prev => ({ ...prev, [m.id]: '' }));
                          }}
                          data-testid={`button-add-material-${m.id}`}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Añadir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredMaterials.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-[11.5px] text-muted-foreground py-3">Sin coincidencias.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Variante: <span className="font-mono">{variantId || '—'}</span>
          </p>
          <Button variant="outline" onClick={onClose} data-testid="button-bom-close">Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BomRowsTable({ rows, kind }: { rows: MmBomRow[]; kind: 'mm' }) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Esta variante no tiene materiales en {kind === 'mm' ? 'Material Manager' : 'drafts'}.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Material</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={`${r.materialId}-${r.variantId}`} data-testid={`row-mm-row-${r.materialId}`}>
            <TableCell className="text-[12.5px]">{r.materialName}</TableCell>
            <TableCell className="text-right tabular">{formatNumber(r.quantity)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DraftRowsTable({ rows, onUpdate, onDelete }: { rows: MmBomDraftRow[]; onUpdate: (id: number, qty: number) => void; onDelete: (id: number) => void; }) {
  const [edits, setEdits] = useState<Record<number, string>>({});
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Material</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead>Unidad</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(d => (
          <TableRow key={d.id} data-testid={`row-draft-${d.id}`}>
            <TableCell className="text-[12.5px]">{d.materialName}</TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                className="h-8 w-[100px] text-right tabular ml-auto"
                value={edits[d.id] ?? d.quantity}
                onChange={e => setEdits(prev => ({ ...prev, [d.id]: e.target.value }))}
                onBlur={() => {
                  const next = Number(edits[d.id] ?? d.quantity);
                  if (Number.isFinite(next) && next !== d.quantity) onUpdate(d.id, next);
                }}
                data-testid={`input-draft-row-qty-${d.id}`}
              />
            </TableCell>
            <TableCell className="text-[12px] text-muted-foreground">{d.unit || '—'}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onDelete(d.id)} data-testid={`button-draft-delete-${d.id}`}>
                <Trash2 className="h-3.5 w-3.5 text-rose-300" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
