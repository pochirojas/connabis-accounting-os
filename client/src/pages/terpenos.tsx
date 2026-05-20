import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Save, Trash2, Sparkles, ArrowUp, ArrowDown,
  CheckCircle2, CircleOff, Database, RefreshCcw, Code2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { MmMaterialRow } from '@shared/schema';

// -------- Legacy rotation-slot / replacement-draft types (Phase 2.0) --------
type RotationSlot = {
  id: number;
  slotIndex: number;
  displayName: string;
  materialIdHint: string | null;
  status: 'active' | 'incoming' | 'retired';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReplacementDraft = {
  id: number;
  fromName: string;
  toName: string;
  affectedVariantPattern: string | null;
  containerVariants: string;
  status: 'draft' | 'reviewed' | 'archived';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// -------- Metaobject catalog types (Phase 2.2 · matches server) --------
type TerpeneEstado = 'En Rotación' | 'Agotado';
type TerpeneTipo = 'Sativa' | 'Hibrido' | 'Indica' | '';
type CatalogEntry = {
  handle: string;
  nombre: string;
  nombreFloraplex: string | null;
  tipo: TerpeneTipo;
  estado: TerpeneEstado;
  orden: number | null;
  mascotaUrl: string | null;
  perfilSabor: string | null;
  dirty: boolean;
  updatedAt: string | null;
};
type CatalogResponse = {
  activeLimit: number;
  totalBaseline: number;
  entries: CatalogEntry[];
};
type ShopifyPreviewResponse = {
  adminApiVersion: string;
  metaobjectType: string;
  note: string;
  payloads: Array<{
    handle: string;
    nombre: string;
    estado: TerpeneEstado;
    orden: number | null;
    mutation: string;
    variables: unknown;
  }>;
};

const CONTAINER_OPTIONS = ['1ml', '2.25ml', '4ml', 'Jeringa'] as const;

async function postJson<T>(method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<T | null> {
  const response = await apiRequest(method, url, method === 'DELETE' ? undefined : body);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as T : null;
}

// Badge colors mirror the Shopify storefront snippet conventions documented in
// the Terpene Rotation System PDF.
function TipoBadge({ tipo }: { tipo: TerpeneTipo }) {
  if (!tipo) return null;
  const map: Record<string, { bg: string; label: string }> = {
    Sativa:  { bg: '#E65100', label: 'SATIVA' },
    Hibrido: { bg: '#01696F', label: 'HYBRID' },
    Indica:  { bg: '#311B92', label: 'INDICA' },
  };
  const cfg = map[tipo];
  if (!cfg) return null;
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white" style={{ backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  );
}
function AmpBadge({ nombre }: { nombre: string }) {
  if (!/\bAMP\b/i.test(nombre)) return null;
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white" style={{ backgroundColor: '#33691E' }}>
      AMP
    </span>
  );
}
function EnRotacionBadge({ estado }: { estado: TerpeneEstado }) {
  if (estado !== 'En Rotación') return null;
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white" style={{ backgroundColor: '#1b5e20' }}>
      EN ROTACIÓN
    </span>
  );
}

export default function Terpenos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'catalog' | 'slots' | 'drafts'>('catalog');

  // Catalog data + preview
  const catalog = useQuery<CatalogResponse>({ queryKey: ['/api/terpene-catalog'] });
  const preview = useQuery<ShopifyPreviewResponse>({ queryKey: ['/api/terpene-catalog/shopify-preview'] });

  // Legacy data
  const slots = useQuery<RotationSlot[]>({ queryKey: ['/api/terpene-rotation/slots'] });
  const drafts = useQuery<ReplacementDraft[]>({ queryKey: ['/api/terpene-rotation/drafts'] });
  const materials = useQuery<MmMaterialRow[]>({ queryKey: ['/api/material-manager/materials'] });
  const terpeneMaterials = useMemo(() => {
    return (materials.data ?? []).filter(m => /terpeno/i.test(m.name));
  }, [materials.data]);

  const invalidateCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-catalog'] });
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-catalog/shopify-preview'] });
  };
  const invalidateLegacy = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-rotation/slots'] });
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-rotation/drafts'] });
  };

  // -------- Catalog mutations --------
  const saveCatalogBatch = useMutation({
    mutationFn: (patches: Array<{ handle: string; tipo?: TerpeneTipo | null; estado?: TerpeneEstado | null; orden?: number | null; mascotaUrl?: string | null; perfilSabor?: string | null }>) =>
      postJson<{ saved: CatalogEntry[]; errors: Array<{ handle: string; error: string }> }>('POST', '/api/terpene-catalog/batch', { patches }),
    onSuccess: () => { invalidateCatalog(); toast({ title: 'Catálogo guardado · local · no enviado a Shopify' }); },
    onError: (error) => toast({ title: 'No se pudo guardar el catálogo', description: String(error), variant: 'destructive' }),
  });
  const resetCatalog = useMutation({
    mutationFn: () => postJson<{ cleared: number }>('POST', '/api/terpene-catalog/reset', {}),
    onSuccess: (res) => { invalidateCatalog(); toast({ title: 'Catálogo restablecido', description: `${res?.cleared ?? 0} ediciones locales borradas` }); },
  });

  // -------- Legacy mutations --------
  const saveSlot = useMutation({
    mutationFn: (payload: Partial<RotationSlot>) => postJson<RotationSlot>('POST', '/api/terpene-rotation/slots', payload),
    onSuccess: () => { invalidateLegacy(); toast({ title: 'Slot guardado' }); },
    onError: (error) => toast({ title: 'No se pudo guardar', description: String(error), variant: 'destructive' }),
  });
  const deleteSlot = useMutation({
    mutationFn: (id: number) => postJson<{ deleted: boolean }>('DELETE', `/api/terpene-rotation/slots/${id}`),
    onSuccess: () => { invalidateLegacy(); toast({ title: 'Slot eliminado' }); },
  });
  const saveDraft = useMutation({
    mutationFn: (payload: Partial<ReplacementDraft>) => postJson<ReplacementDraft>('POST', '/api/terpene-rotation/drafts', payload),
    onSuccess: () => { invalidateLegacy(); toast({ title: 'Borrador guardado · sin aplicar a BOM' }); },
    onError: (error) => toast({ title: 'No se pudo guardar', description: String(error), variant: 'destructive' }),
  });
  const deleteDraft = useMutation({
    mutationFn: (id: number) => postJson<{ deleted: boolean }>('DELETE', `/api/terpene-rotation/drafts/${id}`),
    onSuccess: () => { invalidateLegacy(); toast({ title: 'Borrador eliminado' }); },
  });

  const entries = catalog.data?.entries ?? [];
  const activeEntries = entries.filter(e => e.estado === 'En Rotación');
  const agotadoEntries = entries.filter(e => e.estado === 'Agotado');
  const activeLimit = catalog.data?.activeLimit ?? 10;
  const dirtyCount = entries.filter(e => e.dirty).length;

  // Catalog actions
  const promote = (handle: string) => {
    const usedOrden = new Set(activeEntries.map(e => e.orden ?? 0));
    let next = 1;
    while (usedOrden.has(next) && next <= activeLimit) next += 1;
    if (next > activeLimit) {
      toast({ title: 'Rotación llena', description: `Máximo ${activeLimit} terpenos En Rotación`, variant: 'destructive' });
      return;
    }
    saveCatalogBatch.mutate([{ handle, estado: 'En Rotación', orden: next }]);
  };
  const retire = (handle: string) => {
    saveCatalogBatch.mutate([{ handle, estado: 'Agotado', orden: null }]);
  };
  const move = (handle: string, dir: -1 | 1) => {
    const me = activeEntries.find(e => e.handle === handle);
    if (!me || me.orden == null) return;
    const targetOrden = me.orden + dir;
    if (targetOrden < 1 || targetOrden > activeLimit) return;
    const other = activeEntries.find(e => e.orden === targetOrden);
    const patches: Array<{ handle: string; orden: number }> = [{ handle, orden: targetOrden }];
    if (other) patches.push({ handle: other.handle, orden: me.orden });
    saveCatalogBatch.mutate(patches);
  };

  return (
    <Layout
      title="Rotación de terpenos"
      subtitle="Phase 2 · catálogo metaobject (33) + slots de rotación + borradores de reemplazo. Cambios locales. Sync a Shopify pendiente."
    >
      <Card className="mb-4 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-terpene-draft-only">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-amber-300 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-200">Solo borradores · no destructivo · sin sync a Shopify</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              El OS administra una réplica local del Shopify Metaobject <code className="text-amber-100/90">terpeno</code>
              (33 entradas: 10 En Rotación + 23 Agotado) y los borradores históricos de reemplazo por variante.
              Los cambios se guardan en SQLite del OS y <strong>no</strong> tocan Shopify. La sincronización vive en un proxy backend
              futuro y requerirá confirmación explícita. El snippet <code>deepdive-terpenos-v6.liquid</code> es estático
              hoy — actualizarlo requiere redeploy del tema; ver <code>TERPENE_ROTATION_SYSTEM.md</code>.
            </p>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="mb-2">
        <TabsList data-testid="tabs-terpene">
          <TabsTrigger value="catalog" data-testid="tab-catalog">Catálogo (33)</TabsTrigger>
          <TabsTrigger value="slots" data-testid="tab-slots">Slots Phase 2.0</TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">Reemplazos / BOM</TabsTrigger>
        </TabsList>

        {/* ================== CATALOG TAB ================== */}
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <section className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
            <Card className="p-4" data-testid="card-catalog-summary">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Catálogo metaobject <code className="text-[11px] text-muted-foreground">terpeno</code></h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeEntries.length}/{activeLimit} En Rotación · {agotadoEntries.length} Agotado · {entries.length} total ·
                    {' '}<span className={dirtyCount ? 'text-amber-300' : ''}>{dirtyCount} con cambios locales</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => resetCatalog.mutate()} disabled={resetCatalog.isPending || dirtyCount === 0} data-testid="button-catalog-reset">
                    <RefreshCcw className="h-3 w-3 mr-1" /> Restablecer al baseline PDF
                  </Button>
                </div>
              </div>
            </Card>
            <Card className="p-4" data-testid="card-catalog-shopify-preview">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="h-4 w-4 text-sky-300" />
                <h3 className="text-sm font-semibold tracking-tight">Preview Shopify Admin GraphQL</h3>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vista previa de lo que el proxy backend enviaría a <code>metaobjectUpdateByHandle</code> (Admin API {preview.data?.adminApiVersion ?? '2024-01'}) por cada terpeno con cambios locales. No se envía nada.
              </p>
              <div className="mt-2">
                <Badge variant="outline" className="text-[10px]">{preview.data?.payloads.length ?? 0} payloads listos</Badge>
              </div>
            </Card>
          </section>

          {/* En Rotación section */}
          <Card className="p-5" data-testid="card-catalog-active">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold tracking-tight">En Rotación · {activeEntries.length}/{activeLimit} slots</h3>
              <Badge variant="outline" className="text-[11px]">orden 1..{activeLimit}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="w-16">Mascota</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Badges</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mascota URL</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeEntries.map(e => (
                    <CatalogActiveRow
                      key={e.handle}
                      entry={e}
                      activeLimit={activeLimit}
                      onMove={(dir) => move(e.handle, dir)}
                      onRetire={() => retire(e.handle)}
                      onSaveField={(patch) => saveCatalogBatch.mutate([{ handle: e.handle, ...patch }])}
                    />
                  ))}
                  {activeEntries.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-4">Sin terpenos activos. Promueve uno desde el banco.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Banco / Agotado section */}
          <Card className="p-5" data-testid="card-catalog-bank">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold tracking-tight">Banco · Agotado · {agotadoEntries.length}</h3>
              <Badge variant="outline" className="text-[11px]">Promueve para llenar slots vacíos</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Mascota</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Badges</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agotadoEntries.map(e => (
                    <CatalogBankRow
                      key={e.handle}
                      entry={e}
                      canPromote={activeEntries.length < activeLimit}
                      onPromote={() => promote(e.handle)}
                      onSaveField={(patch) => saveCatalogBatch.mutate([{ handle: e.handle, ...patch }])}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Shopify payload preview details */}
          <Card className="p-5" data-testid="card-catalog-payloads">
            <h3 className="text-sm font-semibold tracking-tight mb-1">Payloads pendientes de sincronización</h3>
            <p className="text-[11.5px] text-muted-foreground mb-3">
              {preview.data?.note ?? 'Preview-only. No network call.'}
            </p>
            {(preview.data?.payloads ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Sin cambios locales. El baseline actual coincide con la documentación PDF.</p>
            ) : (
              <div className="space-y-3">
                {(preview.data?.payloads ?? []).map(p => (
                  <details key={p.handle} className="rounded border border-border bg-muted/25 p-3">
                    <summary className="cursor-pointer text-[12.5px] font-medium leading-snug">
                      <span className="text-sky-200">{p.nombre}</span>{' '}
                      <span className="text-muted-foreground">· {p.handle} · {p.estado}{p.orden != null ? ` · #${p.orden}` : ''}</span>
                    </summary>
                    <pre className="mt-2 rounded bg-background/60 p-2 text-[10.5px] leading-relaxed overflow-x-auto whitespace-pre">
{JSON.stringify(p.variables, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ================== LEGACY SLOTS TAB ================== */}
        <TabsContent value="slots" className="mt-4">
          <Card className="p-5" data-testid="card-rotation-slots">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Slots Phase 2.0 (anclaje a Material Manager)</h3>
                <p className="text-xs text-muted-foreground">
                  Estos slots son la integración previa con MM (cost anchor). El nuevo Catálogo metaobject los sustituye para
                  estado/orden público; mantén esto si todavía anclas costos a un material MM.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px]">{(slots.data ?? []).length} slots</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nombre canónico</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Material MM</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(slots.data ?? []).map(slot => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      materials={terpeneMaterials}
                      onSave={(next) => saveSlot.mutate({ ...next, id: slot.id })}
                      onDelete={() => deleteSlot.mutate(slot.id)}
                    />
                  ))}
                  {(slots.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">Sin slots Phase 2.0.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ================== REPLACEMENT DRAFTS TAB ================== */}
        <TabsContent value="drafts" className="mt-4">
          <Card className="p-5" data-testid="card-replacement-drafts">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Borradores de reemplazo (BOM bulk swap · Phase 4)</h3>
                <p className="text-xs text-muted-foreground">
                  Mapea terpeno saliente → entrante por familia de variante (1ml/2.25ml/4ml/Jeringa). Las acciones bulk de BOM son Phase 4.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px]">{(drafts.data ?? []).length} borradores</Badge>
            </div>
            <ReplacementDraftCreator
              isPending={saveDraft.isPending}
              onSubmit={payload => saveDraft.mutate(payload)}
            />
            <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {(drafts.data ?? []).map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  onSave={(next) => saveDraft.mutate({ ...next, id: draft.id })}
                  onDelete={() => deleteDraft.mutate(draft.id)}
                />
              ))}
              {(drafts.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Sin borradores.</p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <section className="mt-6">
        <Card className="p-5" data-testid="card-terpene-notes">
          <h3 className="text-sm font-semibold tracking-tight">Notas operativas</h3>
          <ul className="mt-2 text-[12.5px] text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">
            <li>El catálogo refleja el Metaobject Shopify <code>terpeno</code> (33 entradas). Edits locales actúan como overlay; el push a Shopify es Phase 2.3 vía proxy backend.</li>
            <li>El widget de producto, Aprende Más y Deepdive son las 3 superficies. Estado, orden, perfil_sabor y mascota actualizan widget + Aprende Más automáticamente cuando se sincronicen. <strong>Deepdive es estático</strong> hasta convertir <code>deepdive-terpenos-v6.liquid</code> a un loop sobre metaobjects.</li>
            <li>Slots Phase 2.0 siguen disponibles para anclar costos a materiales MM; coexisten con el catálogo.</li>
            <li>Borradores de reemplazo no tocan BOM. La aplicación bulk a BOM es Phase 4 con doble confirmación.</li>
          </ul>
        </Card>
      </section>
    </Layout>
  );
}

// -------- Catalog row components --------

function CatalogActiveRow({ entry, activeLimit, onMove, onRetire, onSaveField }: {
  entry: CatalogEntry;
  activeLimit: number;
  onMove: (dir: -1 | 1) => void;
  onRetire: () => void;
  onSaveField: (patch: { tipo?: TerpeneTipo; mascotaUrl?: string | null }) => void;
}) {
  const [mascota, setMascota] = useState(entry.mascotaUrl ?? '');
  const [tipo, setTipo] = useState<TerpeneTipo>(entry.tipo);
  const mascotaDirty = mascota !== (entry.mascotaUrl ?? '');
  const tipoDirty = tipo !== entry.tipo;
  return (
    <TableRow data-testid={`row-catalog-active-${entry.handle}`} className={entry.dirty ? 'bg-amber-500/5' : undefined}>
      <TableCell className="tabular text-right">{entry.orden ?? '—'}</TableCell>
      <TableCell>
        {entry.mascotaUrl ? (
          <img src={entry.mascotaUrl} alt={entry.nombre} className="h-9 w-9 object-contain rounded" loading="lazy" />
        ) : (
          <div className="h-9 w-9 rounded bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">—</div>
        )}
      </TableCell>
      <TableCell className="font-medium text-[13px]">{entry.nombre}</TableCell>
      <TableCell className="font-mono text-[10.5px] text-muted-foreground">{entry.handle}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <TipoBadge tipo={entry.tipo} />
          <AmpBadge nombre={entry.nombre} />
          <EnRotacionBadge estado={entry.estado} />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <select className="h-7 rounded-md border border-input bg-background px-2 text-[11px]" value={tipo} onChange={e => setTipo(e.target.value as TerpeneTipo)}>
            <option value="">(sin)</option>
            <option value="Sativa">Sativa</option>
            <option value="Hibrido">Hibrido</option>
            <option value="Indica">Indica</option>
          </select>
          {tipoDirty && (
            <Button size="icon" variant="ghost" onClick={() => onSaveField({ tipo })} aria-label="Guardar tipo">
              <Save className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            className="h-7 text-[11px] max-w-[260px]"
            value={mascota}
            onChange={e => setMascota(e.target.value)}
            placeholder="https://cdn.shopify.com/…"
          />
          {mascotaDirty && (
            <Button size="icon" variant="ghost" onClick={() => onSaveField({ mascotaUrl: mascota.trim() || null })} aria-label="Guardar mascota">
              <Save className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button size="icon" variant="ghost" disabled={(entry.orden ?? 1) <= 1} onClick={() => onMove(-1)} aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" disabled={(entry.orden ?? activeLimit) >= activeLimit} onClick={() => onMove(1)} aria-label="Bajar">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onRetire} aria-label="Retirar al banco" title="Mover a Agotado">
          <CircleOff className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CatalogBankRow({ entry, canPromote, onPromote, onSaveField }: {
  entry: CatalogEntry;
  canPromote: boolean;
  onPromote: () => void;
  onSaveField: (patch: { tipo?: TerpeneTipo }) => void;
}) {
  const [tipo, setTipo] = useState<TerpeneTipo>(entry.tipo);
  const tipoDirty = tipo !== entry.tipo;
  return (
    <TableRow data-testid={`row-catalog-bank-${entry.handle}`} className={entry.dirty ? 'bg-amber-500/5' : undefined}>
      <TableCell>
        {entry.mascotaUrl ? (
          <img src={entry.mascotaUrl} alt={entry.nombre} className="h-9 w-9 object-contain rounded opacity-70" loading="lazy" />
        ) : (
          <div className="h-9 w-9 rounded bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">—</div>
        )}
      </TableCell>
      <TableCell className="font-medium text-[13px]">{entry.nombre}</TableCell>
      <TableCell className="font-mono text-[10.5px] text-muted-foreground">{entry.handle}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <TipoBadge tipo={entry.tipo} />
          <AmpBadge nombre={entry.nombre} />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <select className="h-7 rounded-md border border-input bg-background px-2 text-[11px]" value={tipo} onChange={e => setTipo(e.target.value as TerpeneTipo)}>
            <option value="">(sin)</option>
            <option value="Sativa">Sativa</option>
            <option value="Hibrido">Hibrido</option>
            <option value="Indica">Indica</option>
          </select>
          {tipoDirty && (
            <Button size="icon" variant="ghost" onClick={() => onSaveField({ tipo })} aria-label="Guardar tipo">
              <Save className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button size="sm" variant="outline" disabled={!canPromote} onClick={onPromote} data-testid={`button-promote-${entry.handle}`}>
          <CheckCircle2 className="h-3 w-3 mr-1" /> Promover a rotación
        </Button>
      </TableCell>
    </TableRow>
  );
}

// -------- Legacy components (Phase 2.0) --------

function SlotRow({ slot, materials, onSave, onDelete }: {
  slot: RotationSlot;
  materials: MmMaterialRow[];
  onSave: (next: { slotIndex: number; displayName: string; status: RotationSlot['status']; materialIdHint: string | null; notes?: string | null }) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState({
    slotIndex: slot.slotIndex,
    displayName: slot.displayName,
    status: slot.status,
    materialIdHint: slot.materialIdHint ?? '',
  });
  const dirty = edit.slotIndex !== slot.slotIndex
    || edit.displayName !== slot.displayName
    || edit.status !== slot.status
    || edit.materialIdHint !== (slot.materialIdHint ?? '');
  return (
    <TableRow data-testid={`row-slot-${slot.id}`}>
      <TableCell>
        <Input className="h-8 w-14 tabular text-right" type="number" min="1" value={edit.slotIndex} onChange={e => setEdit(s => ({ ...s, slotIndex: Number(e.target.value) || 1 }))} />
      </TableCell>
      <TableCell>
        <Input className="h-8" value={edit.displayName} onChange={e => setEdit(s => ({ ...s, displayName: e.target.value }))} />
      </TableCell>
      <TableCell>
        <select className="h-8 rounded-md border border-input bg-background px-2 text-[12px]" value={edit.status} onChange={e => setEdit(s => ({ ...s, status: e.target.value as RotationSlot['status'] }))}>
          <option value="active">Activo</option>
          <option value="incoming">Entrante</option>
          <option value="retired">Retirado</option>
        </select>
      </TableCell>
      <TableCell>
        <select className="h-8 rounded-md border border-input bg-background px-2 text-[12px] max-w-[220px]" value={edit.materialIdHint} onChange={e => setEdit(s => ({ ...s, materialIdHint: e.target.value }))}>
          <option value="">(sin material)</option>
          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button size="icon" variant="ghost" disabled={!dirty} onClick={() => onSave({ ...edit, materialIdHint: edit.materialIdHint || null })} aria-label="Guardar slot">
          <Save className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Eliminar slot">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ReplacementDraftCreator({ isPending, onSubmit }: {
  isPending: boolean;
  onSubmit: (payload: { fromName: string; toName: string; affectedVariantPattern: string | null; containerVariants: string; notes: string | null }) => void;
}) {
  const [draft, setDraft] = useState<{
    fromName: string;
    toName: string;
    affectedVariantPattern: string;
    containers: Record<string, boolean>;
    notes: string;
  }>({
    fromName: '',
    toName: '',
    affectedVariantPattern: '',
    containers: { '1ml': true, '2.25ml': true, '4ml': true, Jeringa: true },
    notes: '',
  });
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Nuevo reemplazo</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input placeholder="Terpeno saliente (ej. Pineapple OG)" value={draft.fromName} onChange={e => setDraft(d => ({ ...d, fromName: e.target.value }))} data-testid="input-draft-from" />
        <Input placeholder="Terpeno entrante (ej. Banana Mimosa)" value={draft.toName} onChange={e => setDraft(d => ({ ...d, toName: e.target.value }))} data-testid="input-draft-to" />
        <Input className="sm:col-span-2" placeholder="Patrón de variantes afectadas (texto libre)" value={draft.affectedVariantPattern} onChange={e => setDraft(d => ({ ...d, affectedVariantPattern: e.target.value }))} data-testid="input-draft-pattern" />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]">
        {CONTAINER_OPTIONS.map(c => (
          <label key={c} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(draft.containers[c])}
              onChange={e => setDraft(d => ({ ...d, containers: { ...d.containers, [c]: e.target.checked } }))}
            /> {c}
          </label>
        ))}
      </div>
      <Input className="mt-2" placeholder="Notas (opcional)" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} data-testid="input-draft-notes" />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={!draft.fromName.trim() || !draft.toName.trim() || isPending}
          onClick={() => {
            const containers = CONTAINER_OPTIONS.filter(c => draft.containers[c]).join(',');
            onSubmit({
              fromName: draft.fromName.trim(),
              toName: draft.toName.trim(),
              affectedVariantPattern: draft.affectedVariantPattern.trim() || null,
              containerVariants: containers,
              notes: draft.notes.trim() || null,
            });
            setDraft({ fromName: '', toName: '', affectedVariantPattern: '', containers: { '1ml': true, '2.25ml': true, '4ml': true, Jeringa: true }, notes: '' });
          }}
          data-testid="button-add-draft"
        >
          <Plus className="h-3 w-3 mr-1" /> Guardar borrador
        </Button>
      </div>
    </div>
  );
}

function DraftRow({ draft, onSave, onDelete }: {
  draft: ReplacementDraft;
  onSave: (next: Partial<ReplacementDraft>) => void;
  onDelete: () => void;
}) {
  const containers = (draft.containerVariants || '').split(',').filter(Boolean);
  const [status, setStatus] = useState(draft.status);
  return (
    <div className="rounded-md border border-border bg-muted/15 p-3" data-testid={`row-draft-${draft.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-snug">
            <span className="text-rose-300">{draft.fromName}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="text-emerald-300">{draft.toName}</span>
          </div>
          {draft.affectedVariantPattern ? (
            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{draft.affectedVariantPattern}</div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1">
            {containers.length === 0
              ? <span className="text-[10.5px] text-muted-foreground">Sin variantes seleccionadas</span>
              : containers.map(c => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
          </div>
          {draft.notes ? <div className="text-[11px] text-muted-foreground mt-1">{draft.notes}</div> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <select
            value={status}
            onChange={e => { const next = e.target.value as ReplacementDraft['status']; setStatus(next); onSave({ status: next }); }}
            className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
          >
            <option value="draft">Borrador</option>
            <option value="reviewed">Revisado</option>
            <option value="archived">Archivado</option>
          </select>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Eliminar borrador">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Database icon import was unused; keep `Database` referenced to avoid tree-shaking surprises
// when adding Material Manager linkage; remove if not consumed.
void Database;
