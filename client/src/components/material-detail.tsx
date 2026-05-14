import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatCOP, formatDate, formatNumber, formatQty } from '@/lib/format';
import {
  ArrowLeft, Bell, Boxes as BoxesIcon, ChevronRight, Edit2, Mail, RotateCcw, Save, Trash2, TrendingUp, Truck,
} from 'lucide-react';
import type { MaterialDetail } from '@shared/schema';

type Props = {
  materialId: string;
  onBack: () => void;
  onOpenVariant?: (variantId: string) => void;
  // Existing category strings from the materials list. Used to populate the
  // category combobox in the detail view so the user can pick or type a new one.
  categoryOptions?: string[];
};

async function postJson(url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  const response = await apiRequest(method, url, method === 'DELETE' ? undefined : body);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

type MaterialEditState = {
  name: string;
  description: string;
  measurement: string;
  sku: string;
  barcode: string;
  category: string;
  supplier: string;
  cost: string;
  currencyCode: string;
  stock: string;
  materialsUsedInAllOrders: string;
  updateShopifyInventory: boolean;
  limitShopifyInventory: boolean;
  // Local-only notification fields encoded in the override `note` JSON blob.
  // Never sent to Shopify / never part of the round-trip MM CSV.
  notifyEmail: string;
  lowStockThreshold: string;
  // Local photo URL. MM does not currently expose a `photo_url` column in the
  // round-trip CSV, so until the canonical field lands we store it in the same
  // override note JSON. When the canonical MM field is added we will read from
  // it preferentially and treat this as a fallback.
  imageUrl: string;
};

// Notification fields live inside the override `note` column as JSON so we
// don't have to alter the override schema. The note field is otherwise a free
// text — wrapping the JSON with a sentinel keeps it backwards-compatible.
const NOTE_JSON_PREFIX = '__matnote__:';

function parseNoteJson(note: string | null | undefined): { notifyEmail: string; lowStockThreshold: string; imageUrl: string; raw: string } {
  const fallback = { notifyEmail: '', lowStockThreshold: '', imageUrl: '', raw: '' };
  if (!note) return fallback;
  if (!note.startsWith(NOTE_JSON_PREFIX)) return { ...fallback, raw: note };
  try {
    const parsed = JSON.parse(note.slice(NOTE_JSON_PREFIX.length));
    return {
      notifyEmail: typeof parsed.notifyEmail === 'string' ? parsed.notifyEmail : '',
      lowStockThreshold: parsed.lowStockThreshold != null ? String(parsed.lowStockThreshold) : '',
      imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : '',
      raw: typeof parsed.raw === 'string' ? parsed.raw : '',
    };
  } catch {
    return fallback;
  }
}

function serializeNoteJson(state: { notifyEmail: string; lowStockThreshold: string; imageUrl?: string }, raw?: string): string | null {
  const hasContent = state.notifyEmail.trim() || state.lowStockThreshold.trim() || (state.imageUrl ?? '').trim() || (raw ?? '').trim();
  if (!hasContent) return null;
  return NOTE_JSON_PREFIX + JSON.stringify({
    notifyEmail: state.notifyEmail.trim() || undefined,
    lowStockThreshold: state.lowStockThreshold.trim() ? Number(state.lowStockThreshold) : undefined,
    imageUrl: (state.imageUrl ?? '').trim() || undefined,
    raw: (raw ?? '').trim() || undefined,
  });
}

function toEditState(m: MaterialDetail['material'] | undefined | null): MaterialEditState {
  const note = parseNoteJson(m?.override?.note ?? null);
  return {
    name: m?.name ?? '',
    description: m?.description ?? '',
    measurement: m?.measurement ?? '',
    sku: m?.sku ?? '',
    barcode: m?.barcode ?? '',
    category: m?.category ?? '',
    supplier: m?.supplier ?? '',
    cost: m?.cost != null ? String(m.cost) : '',
    currencyCode: m?.currencyCode ?? 'COP',
    stock: m?.stock != null ? String(m.stock) : '0',
    materialsUsedInAllOrders: m?.materialsUsedInAllOrders ?? '',
    updateShopifyInventory: Boolean(m?.updateShopifyInventory),
    limitShopifyInventory: Boolean(m?.limitShopifyInventory),
    notifyEmail: note.notifyEmail,
    lowStockThreshold: note.lowStockThreshold,
    imageUrl: note.imageUrl,
  };
}

export function MaterialDetailView({ materialId, onBack, onOpenVariant, categoryOptions }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const detail = useQuery<MaterialDetail>({ queryKey: [`/api/material-manager/materials/${materialId}`] });
  const [draftEdits, setDraftEdits] = useState<Record<number, { quantity?: number; note?: string }>>({});
  const [edit, setEdit] = useState<MaterialEditState>(() => toEditState(detail.data?.material));
  const [dirty, setDirty] = useState(false);

  // Reset the local edit buffer whenever the loaded material changes (e.g.
  // after navigating between materials or after a successful save refetch).
  useEffect(() => {
    if (detail.data?.material) {
      setEdit(toEditState(detail.data.material));
      setDirty(false);
    }
  }, [detail.data?.material]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/material-manager/materials/${materialId}`] });
    queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials'] });
  };

  const saveOverride = useMutation({
    mutationFn: (payload: MaterialEditState) =>
      postJson(`/api/material-manager/materials/${materialId}/override`, {
        name: payload.name,
        description: payload.description,
        measurement: payload.measurement,
        sku: payload.sku,
        barcode: payload.barcode,
        category: payload.category,
        supplier: payload.supplier,
        cost: payload.cost === '' ? null : Number(payload.cost),
        currencyCode: payload.currencyCode,
        stock: payload.stock === '' ? null : Number(payload.stock),
        materialsUsedInAllOrders: payload.materialsUsedInAllOrders,
        updateShopifyInventory: payload.updateShopifyInventory,
        limitShopifyInventory: payload.limitShopifyInventory,
        note: serializeNoteJson({
          notifyEmail: payload.notifyEmail,
          lowStockThreshold: payload.lowStockThreshold,
          imageUrl: payload.imageUrl,
        }),
      }, 'PATCH'),
    onSuccess: () => {
      toast({ title: 'Material guardado (edición local)', description: 'No se envía a Shopify ni a Material Manager. El export de rollback sigue mostrando los valores originales.' });
      refetch();
    },
    onError: (error) => toast({ title: 'No se pudo guardar', description: String(error), variant: 'destructive' }),
  });

  const clearOverride = useMutation({
    mutationFn: () => postJson(`/api/material-manager/materials/${materialId}/override`, null, 'DELETE'),
    onSuccess: () => {
      toast({ title: 'Edición local descartada', description: 'El material vuelve a los valores originales de Material Manager.' });
      refetch();
    },
    onError: (error) => toast({ title: 'No se pudo restablecer', description: String(error), variant: 'destructive' }),
  });

  const onFieldChange = <K extends keyof MaterialEditState>(key: K, value: MaterialEditState[K]) => {
    setEdit(prev => ({ ...prev, [key]: value }));
    setDirty(true);
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
            <div className="flex items-start gap-4">
              <MaterialPhoto
                imageUrl={edit.imageUrl}
                alt={edit.name || m.name}
                onChange={(v) => onFieldChange('imageUrl', v)}
              />
              <div className="flex-1 flex items-start justify-between gap-3">
              <div className="flex-1">
                <Input
                  value={edit.name}
                  onChange={(e) => onFieldChange('name', e.target.value)}
                  className="text-base font-semibold tracking-tight h-9"
                  placeholder="Nombre del material"
                  data-testid="input-material-name"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1.5">
                  ID MM <span className="font-mono">{m.id}</span>
                  {m.hasLocalEdit ? (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300" data-testid="badge-local-edit">
                      Edición local · no sincronizada
                    </Badge>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge variant="outline" className="text-[11px] tabular">{edit.currencyCode || m.currencyCode}</Badge>
                {dirty ? <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">Sin guardar</Badge> : null}
              </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <EditField label="Costo unitario" testId="field-mat-cost">
                <Input
                  type="number"
                  step="0.01"
                  value={edit.cost}
                  onChange={(e) => onFieldChange('cost', e.target.value)}
                  className="h-8"
                  data-testid="input-material-cost"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Original MM: {formatCOP(m.baseMaterial?.cost ?? m.cost)}</p>
              </EditField>
              <EditField label="Moneda" testId="field-mat-currency">
                <Input
                  value={edit.currencyCode}
                  onChange={(e) => onFieldChange('currencyCode', e.target.value.toUpperCase().slice(0, 8))}
                  className="h-8"
                  data-testid="input-material-currency"
                />
              </EditField>
              <EditField label="Medida / Unidad" testId="field-mat-measurement">
                <Input
                  value={edit.measurement}
                  onChange={(e) => onFieldChange('measurement', e.target.value)}
                  className="h-8"
                  data-testid="input-material-measurement"
                />
              </EditField>
              <EditField label="Stock" testId="field-mat-stock">
                <Input
                  type="number"
                  step="any"
                  value={edit.stock}
                  onChange={(e) => onFieldChange('stock', e.target.value)}
                  className="h-8"
                  data-testid="input-material-stock"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Original MM: {formatQty(m.baseMaterial?.stock ?? m.stock)}</p>
              </EditField>
              <EditField label="SKU" testId="field-mat-sku">
                <Input
                  value={edit.sku}
                  onChange={(e) => onFieldChange('sku', e.target.value)}
                  className="h-8 font-mono text-[12.5px]"
                  data-testid="input-material-sku"
                />
              </EditField>
              <EditField label="Barcode" testId="field-mat-barcode">
                <Input
                  value={edit.barcode}
                  onChange={(e) => onFieldChange('barcode', e.target.value)}
                  className="h-8 font-mono text-[12.5px]"
                  data-testid="input-material-barcode"
                />
              </EditField>
              <EditField label="Categoría" testId="field-mat-category">
                <Input
                  list={`mat-cat-options-${materialId}`}
                  value={edit.category}
                  onChange={(e) => onFieldChange('category', e.target.value)}
                  className="h-8"
                  placeholder="Categoría o nueva categoría"
                  data-testid="input-material-category"
                />
                {categoryOptions && categoryOptions.length > 0 ? (
                  <datalist id={`mat-cat-options-${materialId}`}>
                    {categoryOptions.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                ) : null}
                <p className="text-[10px] text-muted-foreground mt-1">Original MM: {m.baseMaterial?.category || '—'}</p>
              </EditField>
              <EditField label="Proveedor" testId="field-mat-supplier">
                <Input
                  value={edit.supplier}
                  onChange={(e) => onFieldChange('supplier', e.target.value)}
                  className="h-8"
                  data-testid="input-material-supplier"
                />
              </EditField>
              <EditField label="Used in all orders (qty)" testId="field-mat-used-in-orders">
                <Input
                  value={edit.materialsUsedInAllOrders}
                  onChange={(e) => onFieldChange('materialsUsedInAllOrders', e.target.value)}
                  className="h-8"
                  placeholder="ej. 1"
                  data-testid="input-material-used-in-orders"
                />
              </EditField>
              <EditField label="Sync flags Shopify" testId="field-mat-flags">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center justify-between gap-2 text-[12px]">
                    <span>Update Shopify inventory</span>
                    <Switch
                      checked={edit.updateShopifyInventory}
                      onCheckedChange={(v) => onFieldChange('updateShopifyInventory', Boolean(v))}
                      data-testid="switch-update-shopify"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px]">
                    <span>Limit Shopify inventory</span>
                    <Switch
                      checked={edit.limitShopifyInventory}
                      onCheckedChange={(v) => onFieldChange('limitShopifyInventory', Boolean(v))}
                      data-testid="switch-limit-shopify"
                    />
                  </label>
                </div>
              </EditField>
            </div>

            <div className="mt-4 rounded-md border border-border bg-muted/25 p-3 text-xs leading-relaxed" data-testid="field-mat-description">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">Descripción</div>
              <textarea
                value={edit.description}
                onChange={(e) => onFieldChange('description', e.target.value)}
                className="w-full min-h-[60px] resize-y bg-transparent text-[12.5px] leading-relaxed focus:outline-none"
                placeholder="Notas y descripción del material…"
                data-testid="textarea-material-description"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => saveOverride.mutate(edit)}
                disabled={!dirty || saveOverride.isPending}
                data-testid="button-save-material"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saveOverride.isPending ? 'Guardando…' : 'Guardar edición local'}
              </Button>
              {m.hasLocalEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearOverride.mutate()}
                  disabled={clearOverride.isPending}
                  data-testid="button-clear-material-override"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Restablecer al MM original
                </Button>
              ) : null}
              <p className="text-[10.5px] text-muted-foreground flex-1 min-w-[200px]">
                Los cambios se guardan localmente como override. El export round-trip a Material Manager sigue usando los valores originales.
              </p>
            </div>
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
                      <TableCell className="text-right tabular">{formatQty(row.quantity)}</TableCell>
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
                            step="any"
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
            <div className="mt-3 space-y-2 text-[12.5px]">
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Stock disponible</span>
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="any"
                    value={edit.stock}
                    onChange={(e) => onFieldChange('stock', e.target.value)}
                    className="h-7 w-[110px] text-right tabular"
                    data-testid="input-material-stock-side"
                  />
                  <span className="text-[11px] text-muted-foreground">{edit.measurement || m.measurement}</span>
                </span>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Update Shopify inventory</span>
                <Switch
                  checked={edit.updateShopifyInventory}
                  onCheckedChange={(v) => onFieldChange('updateShopifyInventory', Boolean(v))}
                  data-testid="switch-update-shopify-side"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Limit Shopify inventory</span>
                <Switch
                  checked={edit.limitShopifyInventory}
                  onCheckedChange={(v) => onFieldChange('limitShopifyInventory', Boolean(v))}
                  data-testid="switch-limit-shopify-side"
                />
              </label>
            </div>
            <p className="text-[10.5px] text-muted-foreground mt-3 leading-relaxed">
              Edición local · override sobre el mirror MM. Las escrituras a Shopify quedan bloqueadas en Phase 2.1.
              {/* TODO Phase 2.5: full inventory adjustment history (movements log).
                  Por ahora el historial de costos en "Procurement" hace de placeholder. */}
            </p>
          </Card>

          <Card className="p-4" data-testid="card-material-procurement">
            <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Procurement</h3></div>
            <div className="mt-3 space-y-2 text-[12.5px]">
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Proveedor</span>
                <Input
                  value={edit.supplier}
                  onChange={(e) => onFieldChange('supplier', e.target.value)}
                  className="h-7 w-[55%]"
                  data-testid="input-material-supplier-side"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Costo unitario</span>
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    value={edit.cost}
                    onChange={(e) => onFieldChange('cost', e.target.value)}
                    className="h-7 w-[110px] text-right tabular"
                    data-testid="input-material-cost-side"
                  />
                  <Input
                    value={edit.currencyCode}
                    onChange={(e) => onFieldChange('currencyCode', e.target.value.toUpperCase().slice(0, 8))}
                    className="h-7 w-[60px] uppercase"
                    data-testid="input-material-currency-side"
                  />
                </span>
              </label>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Último costo (compra)</span>
                <span className="tabular">{latestCost ? formatCOP(latestCost.unitCostCop) : formatCOP(m.cost)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">Última compra</span>
                <span>{latestCost ? formatDate(latestCost.date) : '—'}</span>
              </div>
            </div>
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
                    <span className="tabular text-muted-foreground">{formatQty(row.qty)} {m.measurement}</span>
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
            <div className="mt-3 space-y-2 text-[12px]">
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
                <Input
                  type="email"
                  value={edit.notifyEmail}
                  onChange={(e) => onFieldChange('notifyEmail', e.target.value)}
                  className="h-7 w-[60%]"
                  placeholder="alertas@…"
                  data-testid="input-material-notify-email"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Umbral stock bajo</span>
                <Input
                  type="number"
                  step="any"
                  value={edit.lowStockThreshold}
                  onChange={(e) => onFieldChange('lowStockThreshold', e.target.value)}
                  className="h-7 w-[110px] text-right tabular"
                  placeholder="50"
                  data-testid="input-material-low-stock-threshold"
                />
              </label>
            </div>
            <ul className="mt-3 space-y-2 text-[12px]">
              {(() => {
                const threshold = Number(edit.lowStockThreshold) || 50;
                if (m.stock <= 0) return <li className="rounded-md border border-rose-500/30 bg-rose-500/8 p-2 text-rose-200">Sin stock disponible.</li>;
                if (m.stock < threshold) return <li className="rounded-md border border-amber-500/30 bg-amber-500/8 p-2 text-amber-200">Stock bajo ({formatQty(m.stock)} {m.measurement}) · umbral {threshold}.</li>;
                return <li className="rounded-md border border-emerald-500/30 bg-emerald-500/8 p-2 text-emerald-200">Stock OK (umbral {threshold}).</li>;
              })()}
              {productsUsing.length === 0 ? (
                <li className="rounded-md border border-border bg-muted/25 p-2 text-muted-foreground">Nadie consume este material todavía — candidato a depurar.</li>
              ) : null}
              <li className="rounded-md border border-border bg-muted/25 p-2 text-muted-foreground text-[10.5px]">
                Email/Slack alerts efectivos pendientes (Phase 2.5). Por ahora se guardan localmente en el override.
              </li>
            </ul>
          </Card>

          <Card className="p-4" data-testid="card-material-actions">
            <div className="flex items-center gap-2"><Edit2 className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">Acciones</h3></div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Editar campos directamente arriba y pulsar <strong>Guardar edición local</strong>. Los cambios viven en una capa override; el round-trip MM exporta los valores originales.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveOverride.mutate(edit)}
                disabled={!dirty || saveOverride.isPending}
                data-testid="button-save-material-bottom"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar edición local
              </Button>
              {m.hasLocalEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearOverride.mutate()}
                  disabled={clearOverride.isPending}
                  data-testid="button-clear-material-override-bottom"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restablecer MM
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={onBack}>Volver</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Material thumbnail + URL editor. MM does not expose a `photo_url` column in
// the current round-trip CSV, so the URL is persisted in the local override
// `note` JSON. When the canonical MM field lands we will switch to reading
// from it first and keep this as a manual fallback. The image is rendered
// only when a URL is present; otherwise a neutral placeholder is shown so the
// layout stays stable.
function MaterialPhoto({ imageUrl, alt, onChange }: { imageUrl: string; alt: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const trimmed = (imageUrl || '').trim();
  return (
    <div className="shrink-0 w-[88px]" data-testid="material-photo">
      <div
        className="aspect-square w-full rounded-md border border-border bg-muted/40 overflow-hidden flex items-center justify-center cursor-pointer"
        title={trimmed ? 'Click para cambiar foto' : 'Click para agregar URL de foto (local, no sincroniza con MM)'}
        onClick={() => setOpen(v => !v)}
        data-testid="material-photo-thumb"
      >
        {trimmed && !broken ? (
          <img
            src={trimmed}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => setBroken(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center text-muted-foreground">
            <BoxesIcon className="h-6 w-6 opacity-70" />
            <span className="text-[9px] uppercase tracking-wider mt-0.5">Sin foto</span>
          </div>
        )}
      </div>
      {open ? (
        <div className="mt-1">
          <Input
            value={imageUrl}
            onChange={(e) => { setBroken(false); onChange(e.target.value); }}
            placeholder="https://… (foto)"
            className="h-7 text-[11px] font-mono"
            data-testid="input-material-photo-url"
          />
          <p className="text-[9.5px] text-muted-foreground mt-1 leading-tight">
            URL local (override note). Mientras MM no exporte un campo <code>photo_url</code> en el CSV, el editor MM seguirá guardando foto manualmente aquí.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function EditField({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-2.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      {children}
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

