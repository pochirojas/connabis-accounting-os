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
import { formatCOP, formatDate, formatNumber } from '@/lib/format';
import {
  ArrowLeft, Bell, Boxes as BoxesIcon, ChevronRight, Edit2, Mail, Save, Trash2, TrendingUp, Truck,
} from 'lucide-react';
import type { MaterialDetail } from '@shared/schema';

type Props = {
  materialId: string;
  onBack: () => void;
  onOpenVariant?: (variantId: string) => void;
};

function postJson(url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  }).then(async response => {
    if (!response.ok) throw new Error(`${url} → ${response.status}`);
    return response.json();
  });
}

export function MaterialDetailView({ materialId, onBack, onOpenVariant }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const detail = useQuery<MaterialDetail>({ queryKey: [`/api/material-manager/materials/${materialId}`] });
  const [draftEdits, setDraftEdits] = useState<Record<number, { quantity?: number; note?: string }>>({});

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/material-manager/materials/${materialId}`] });
    queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
  };

  const updateDraft = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { quantity?: number; note?: string } }) =>
      postJson(`/api/material-manager/bom-drafts/${id}`, payload, 'PATCH'),
    onSuccess: () => {
      toast({ title: 'Draft actualizado', description: 'Local-only · no se sincroniza con MM/Shopify.' });
      refetch();
    },
    onError: (error) => toast({ title: 'No se pudo actualizar', description: String(error), variant: 'destructive' }),
  });

  const deleteDraft = useMutation({
    mutationFn: (id: number) => postJson(`/api/material-manager/bom-drafts/${id}`, null, 'DELETE'),
    onSuccess: () => {
      toast({ title: 'Draft eliminado' });
      refetch();
    },
  });

  const productsUsing = detail.data?.productsUsing ?? [];
  const latestCost = detail.data?.costHistory?.[0];

  // Materials sold trend from BOM rows: quantity used per product (proxy for usage intensity).
  const usageByProduct = useMemo(() => {
    const map = new Map<string, { product: string; qty: number; variants: Set<string> }>();
    productsUsing.forEach(row => {
      const key = row.productName || 'Sin nombre';
      const current = map.get(key) ?? { product: key, qty: 0, variants: new Set<string>() };
      current.qty += row.quantity;
      current.variants.add(row.variantId);
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [productsUsing]);

  if (detail.isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Cargando material…</p>
      </Card>
    );
  }
  if (!detail.data) {
    return (
      <Card className="p-6">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Volver</Button>
        <p className="text-sm text-muted-foreground mt-3">Material no encontrado.</p>
      </Card>
    );
  }

  const m = detail.data.material;

  return (
    <div className="space-y-4" data-testid="material-detail">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <button onClick={onBack} className="hover:text-foreground inline-flex items-center gap-1" data-testid="button-material-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Materiales
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{m.name}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {m.isInsumo && <Badge variant="outline" className="text-[10px]">Insumo</Badge>}
          {m.isNoid && <Badge variant="outline" className="text-[10px]">Noid</Badge>}
          {m.updateShopifyInventory && <Badge variant="outline" className="text-[10px]">Sync Shopify</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Left column — material info + products using this material */}
        <div className="space-y-4">
          <Card className="p-5" data-testid="card-material-info">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{m.name}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {m.category || 'Sin categoría'} · SKU <span className="font-mono">{m.sku || '—'}</span>
                  {m.barcode ? <> · Barcode <span className="font-mono">{m.barcode}</span></> : null}
                </p>
              </div>
              <Badge variant="outline" className="text-[11px] tabular">{m.currencyCode}</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <Field label="Costo unitario" value={formatCOP(m.cost)} testId="field-mat-cost" />
              <Field label="Medida" value={m.measurement || '—'} testId="field-mat-measurement" />
              <Field label="Stock" value={formatNumber(m.stock)} testId="field-mat-stock" />
              <Field label="Proveedor" value={m.supplier || '—'} testId="field-mat-supplier" />
              <Field label="Used in all orders" value={m.materialsUsedInAllOrders || '—'} testId="field-mat-used-in-orders" />
              <Field label="ID Material Manager" value={m.id} mono testId="field-mat-id" />
            </div>

            {m.description ? (
              <div className="mt-4 rounded-md border border-border bg-muted/25 p-3 text-xs leading-relaxed" data-testid="field-mat-description">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">Descripción</div>
                {m.description}
              </div>
            ) : null}
          </Card>

          <Card className="p-5" data-testid="card-products-using-material">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Productos que usan este material</h3>
                <p className="text-xs text-muted-foreground">
                  {detail.data.totals.bomVariantCount} variante(s) en BOM · {detail.data.totals.draftVariantCount} en drafts locales.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px]">{productsUsing.length} filas</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto · Variante</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsUsing.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">Ningún producto usa este material aún.</TableCell></TableRow>
                  ) : null}
                  {productsUsing.map(row => (
                    <TableRow key={`${row.variantId}-${row.isDraft ? 'draft' : 'mm'}`} data-testid={`row-products-using-${row.variantId}`}>
                      <TableCell className="text-[12.5px]">
                        <div>{row.productName || '—'}</div>
                        <div className="text-[11px] text-muted-foreground">{row.variantName || row.variantId}</div>
                      </TableCell>
                      <TableCell className="text-right tabular">{formatNumber(row.quantity)}</TableCell>
                      <TableCell>
                        {row.isDraft
                          ? <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">Draft local</Badge>
                          : <Badge variant="outline" className="text-[10px]">MM imported</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {onOpenVariant ? (
                          <Button variant="ghost" size="sm" onClick={() => onOpenVariant(row.variantId)} data-testid={`button-open-variant-${row.variantId}`}>
                            Abrir BOM
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {detail.data.bomDrafts.length > 0 ? (
            <Card className="p-5 border-amber-500/30 bg-amber-500/8" data-testid="card-material-drafts">
              <h3 className="text-sm font-semibold tracking-tight text-amber-200">Drafts locales para este material</h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Estos drafts NO se exportan en el round-trip MM. Solo viven en este OS hasta promoverlos a Material Manager manualmente.
              </p>
              <div className="mt-3 space-y-2">
                {detail.data.bomDrafts.map(d => {
                  const edited = draftEdits[d.id] ?? {};
                  return (
                    <div key={d.id} className="rounded-md border border-amber-500/30 bg-card p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-[12.5px]">{d.productName || '—'}</div>
                          <div className="text-[11px] text-muted-foreground">{d.variantName || d.variantId}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            className="h-8 w-[100px] text-right tabular"
                            value={edited.quantity ?? d.quantity}
                            onChange={(e) => setDraftEdits(prev => ({ ...prev, [d.id]: { ...prev[d.id], quantity: Number(e.target.value) || 0 } }))}
                            data-testid={`input-draft-qty-${d.id}`}
                          />
                          <span className="text-[11px] text-muted-foreground">{d.unit || '—'}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateDraft.mutate({ id: d.id, payload: { quantity: edited.quantity ?? d.quantity, note: edited.note } })}
                            data-testid={`button-save-draft-${d.id}`}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDraft.mutate(d.id)}
                            data-testid={`button-delete-draft-${d.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                          </Button>
                        </div>
                      </div>
                      {d.note ? <div className="text-[11px] text-muted-foreground mt-1">{d.note}</div> : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right column — Inventory / Procurement / Materials sold / Notifications */}
        <div className="space-y-4">
          <Card className="p-4" data-testid="card-material-inventory">
            <div className="flex items-center gap-2"><BoxesIcon className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Inventario</h3></div>
            <dl className="mt-3 text-[12.5px] space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted-foreground">Stock disponible</dt><dd className="tabular font-semibold">{formatNumber(m.stock)} {m.measurement}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Update Shopify inventory</dt><dd>{m.updateShopifyInventory ? 'Sí' : 'No'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Limit Shopify inventory</dt><dd>{m.limitShopifyInventory ? 'Sí' : 'No'}</dd></div>
            </dl>
            <p className="text-[10.5px] text-muted-foreground mt-3 leading-relaxed">
              Lectura desde el mirror MM. Las escrituras a Shopify quedan bloqueadas en Phase 2.1.
            </p>
          </Card>

          <Card className="p-4" data-testid="card-material-procurement">
            <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Procurement</h3></div>
            <dl className="mt-3 text-[12.5px] space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted-foreground">Proveedor</dt><dd>{m.supplier || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Último costo</dt><dd className="tabular">{latestCost ? formatCOP(latestCost.unitCostCop) : formatCOP(m.cost)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Última compra</dt><dd>{latestCost ? formatDate(latestCost.date) : '—'}</dd></div>
            </dl>
            {detail.data.costHistory.length ? (
              <div className="mt-3 pt-2 border-t border-card-border">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Historial reciente</div>
                <ul className="mt-1.5 space-y-1 text-[11.5px]">
                  {detail.data.costHistory.slice(0, 5).map(row => (
                    <li key={row.id} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{row.date}</span>
                      <span className="tabular">{formatCOP(row.unitCostCop)}</span>
                      <span className="text-[10px] text-muted-foreground">{row.sourceSheet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card className="p-4" data-testid="card-material-usage-trend">
            <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Materials sold (BOM usage)</h3></div>
            {usageByProduct.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mt-2">Sin uso registrado todavía.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-[12px]">
                {usageByProduct.map(row => (
                  <li key={row.product} className="flex items-center justify-between">
                    <span className="truncate max-w-[60%]">{row.product}</span>
                    <span className="tabular text-muted-foreground">{formatNumber(row.qty)} {m.measurement}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10.5px] text-muted-foreground mt-3 leading-relaxed">
              Estimado por cantidad declarada en BOM. Se reemplazará con ventas reales × BOM cuando agreguemos ese cálculo al servidor.
            </p>
          </Card>

          <Card className="p-4" data-testid="card-material-notifications">
            <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Notificaciones</h3></div>
            <ul className="mt-3 space-y-2 text-[12px]">
              {m.stock <= 0 ? (
                <li className="rounded-md border border-rose-500/30 bg-rose-500/8 p-2 text-rose-200">Sin stock disponible.</li>
              ) : m.stock < 50 ? (
                <li className="rounded-md border border-amber-500/30 bg-amber-500/8 p-2 text-amber-200">Stock bajo ({formatNumber(m.stock)} {m.measurement}).</li>
              ) : (
                <li className="rounded-md border border-emerald-500/30 bg-emerald-500/8 p-2 text-emerald-200">Stock OK.</li>
              )}
              {productsUsing.length === 0 ? (
                <li className="rounded-md border border-border bg-muted/25 p-2 text-muted-foreground">Nadie consume este material todavía — candidato a depurar.</li>
              ) : null}
              <li className="rounded-md border border-border bg-muted/25 p-2 text-muted-foreground inline-flex items-start gap-1.5">
                <Mail className="h-3 w-3 mt-0.5" /> Email/Slack alerts pendientes (Phase 2.2).
              </li>
            </ul>
          </Card>

          <Card className="p-4" data-testid="card-material-actions">
            <div className="flex items-center gap-2"><Edit2 className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Acciones</h3></div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Editar material local + bottones Guardar/Eliminar llegarán cuando habilitemos escritura. Phase 2.1 es solo lectura.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" disabled>Editar (próximo)</Button>
              <Button variant="outline" size="sm" disabled>Eliminar (próximo)</Button>
              <Button variant="outline" size="sm" onClick={onBack}>Volver</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, testId }: { label: string; value: string; mono?: boolean; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-2.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[12.5px] font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

