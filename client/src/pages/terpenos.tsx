import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { MmMaterialRow } from '@shared/schema';

// Local-only types — mirror server/terpene-rotation.ts.
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

const CONTAINER_OPTIONS = ['1ml', '2.25ml', '4ml', 'Jeringa'] as const;

async function postJson<T>(method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<T | null> {
  const response = await apiRequest(method, url, method === 'DELETE' ? undefined : body);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as T : null;
}

export default function Terpenos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const slots = useQuery<RotationSlot[]>({ queryKey: ['/api/terpene-rotation/slots'] });
  const drafts = useQuery<ReplacementDraft[]>({ queryKey: ['/api/terpene-rotation/drafts'] });
  const materials = useQuery<MmMaterialRow[]>({ queryKey: ['/api/material-manager/materials'] });

  const terpeneMaterials = useMemo(() => {
    return (materials.data ?? []).filter(m => /terpeno/i.test(m.name));
  }, [materials.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-rotation/slots'] });
    queryClient.invalidateQueries({ queryKey: ['/api/terpene-rotation/drafts'] });
  };

  const saveSlot = useMutation({
    mutationFn: (payload: Partial<RotationSlot>) => postJson<RotationSlot>('POST', '/api/terpene-rotation/slots', payload),
    onSuccess: () => { invalidate(); toast({ title: 'Slot guardado' }); },
    onError: (error) => toast({ title: 'No se pudo guardar', description: String(error), variant: 'destructive' }),
  });
  const deleteSlot = useMutation({
    mutationFn: (id: number) => postJson<{ deleted: boolean }>('DELETE', `/api/terpene-rotation/slots/${id}`),
    onSuccess: () => { invalidate(); toast({ title: 'Slot eliminado' }); },
  });
  const saveDraft = useMutation({
    mutationFn: (payload: Partial<ReplacementDraft>) => postJson<ReplacementDraft>('POST', '/api/terpene-rotation/drafts', payload),
    onSuccess: () => { invalidate(); toast({ title: 'Borrador guardado · sin aplicar a BOM' }); },
    onError: (error) => toast({ title: 'No se pudo guardar', description: String(error), variant: 'destructive' }),
  });
  const deleteDraft = useMutation({
    mutationFn: (id: number) => postJson<{ deleted: boolean }>('DELETE', `/api/terpene-rotation/drafts/${id}`),
    onSuccess: () => { invalidate(); toast({ title: 'Borrador eliminado' }); },
  });

  // ----- New slot form -----
  const nextSlotIndex = useMemo(() => {
    const used = new Set((slots.data ?? []).map(s => s.slotIndex));
    let i = 1;
    while (used.has(i)) i += 1;
    return i;
  }, [slots.data]);
  const [newSlot, setNewSlot] = useState<{ displayName: string; status: RotationSlot['status']; materialIdHint: string }>({
    displayName: '',
    status: 'active',
    materialIdHint: '',
  });

  // ----- New draft form -----
  const [newDraft, setNewDraft] = useState<{
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

  const activeCount = (slots.data ?? []).filter(s => s.status === 'active').length;

  return (
    <Layout
      title="Rotación de terpenos"
      subtitle="Phase 2 · gestión local de la rotación activa (~10 terpenos) y borradores de reemplazo. No aplica cambios a MM/BOM."
    >
      <Card className="mb-4 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-terpene-draft-only">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-amber-300 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-200">Solo borradores · no destructivo</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Esta sección administra la <strong>lista canónica</strong> de terpenos activos y mapea reemplazos
              (terpeno saliente → terpeno entrante) por familia de variante (1ml / 2.25ml / 4ml / Jeringa).
              Los borradores se guardan localmente y <em>no</em> tocan el BOM ni Shopify. La aplicación masiva
              a BOM se mueve a Phase 4 (editor de blends).
            </p>
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
        {/* Slots */}
        <Card className="p-5" data-testid="card-rotation-slots">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Rotación actual</h3>
              <p className="text-xs text-muted-foreground">
                {activeCount} activos · objetivo ~10. Edita inline; ancla a un material MM (opcional) si quieres mostrar costo.
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
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">Sin slots. Agrega el primero abajo.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 rounded-md border border-border bg-muted/25 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Agregar slot</div>
            <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_110px_1fr_auto] gap-2 items-center">
              <Input className="h-9 tabular text-right" type="number" min="1" value={nextSlotIndex} readOnly aria-label="Slot index" />
              <Input className="h-9" placeholder="Nombre canónico (ej. ACDC)" value={newSlot.displayName} onChange={e => setNewSlot(s => ({ ...s, displayName: e.target.value }))} data-testid="input-new-slot-name" />
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={newSlot.status} onChange={e => setNewSlot(s => ({ ...s, status: e.target.value as RotationSlot['status'] }))}>
                <option value="active">Activo</option>
                <option value="incoming">Entrante</option>
                <option value="retired">Retirado</option>
              </select>
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={newSlot.materialIdHint} onChange={e => setNewSlot(s => ({ ...s, materialIdHint: e.target.value }))}>
                <option value="">(sin material)</option>
                {terpeneMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button
                size="sm"
                disabled={!newSlot.displayName.trim() || saveSlot.isPending}
                onClick={() => {
                  saveSlot.mutate({
                    slotIndex: nextSlotIndex,
                    displayName: newSlot.displayName.trim(),
                    status: newSlot.status,
                    materialIdHint: newSlot.materialIdHint || null,
                  });
                  setNewSlot({ displayName: '', status: 'active', materialIdHint: '' });
                }}
                data-testid="button-add-slot"
              >
                <Plus className="h-3 w-3 mr-1" /> Agregar
              </Button>
            </div>
          </div>
        </Card>

        {/* Replacement drafts */}
        <Card className="p-5" data-testid="card-replacement-drafts">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Borradores de reemplazo</h3>
              <p className="text-xs text-muted-foreground">
                Mapea terpeno saliente → entrante y marca qué variantes (1ml/2.25ml/4ml/Jeringa) cambian.
                Las acciones de BOM bulk replace son Phase 4.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">{(drafts.data ?? []).length} borradores</Badge>
          </div>

          <div className="rounded-md border border-border bg-muted/25 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Nuevo reemplazo</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input placeholder="Terpeno saliente (ej. Pineapple OG)" value={newDraft.fromName} onChange={e => setNewDraft(d => ({ ...d, fromName: e.target.value }))} data-testid="input-draft-from" />
              <Input placeholder="Terpeno entrante (ej. Banana Mimosa)" value={newDraft.toName} onChange={e => setNewDraft(d => ({ ...d, toName: e.target.value }))} data-testid="input-draft-to" />
              <Input className="sm:col-span-2" placeholder="Patrón de variantes afectadas (texto libre)" value={newDraft.affectedVariantPattern} onChange={e => setNewDraft(d => ({ ...d, affectedVariantPattern: e.target.value }))} data-testid="input-draft-pattern" />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]">
              {CONTAINER_OPTIONS.map(c => (
                <label key={c} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(newDraft.containers[c])}
                    onChange={e => setNewDraft(d => ({ ...d, containers: { ...d.containers, [c]: e.target.checked } }))}
                  /> {c}
                </label>
              ))}
            </div>
            <Input className="mt-2" placeholder="Notas (opcional)" value={newDraft.notes} onChange={e => setNewDraft(d => ({ ...d, notes: e.target.value }))} data-testid="input-draft-notes" />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={!newDraft.fromName.trim() || !newDraft.toName.trim() || saveDraft.isPending}
                onClick={() => {
                  const containers = CONTAINER_OPTIONS.filter(c => newDraft.containers[c]).join(',');
                  saveDraft.mutate({
                    fromName: newDraft.fromName.trim(),
                    toName: newDraft.toName.trim(),
                    affectedVariantPattern: newDraft.affectedVariantPattern.trim() || null,
                    containerVariants: containers,
                    notes: newDraft.notes.trim() || null,
                  });
                  setNewDraft({ fromName: '', toName: '', affectedVariantPattern: '', containers: { '1ml': true, '2.25ml': true, '4ml': true, Jeringa: true }, notes: '' });
                }}
                data-testid="button-add-draft"
              >
                <Plus className="h-3 w-3 mr-1" /> Guardar borrador
              </Button>
            </div>
          </div>

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
              <p className="text-xs text-muted-foreground text-center py-3">Sin borradores. Crea el primero arriba.</p>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5" data-testid="card-terpene-notes">
          <h3 className="text-sm font-semibold tracking-tight">Notas operativas</h3>
          <ul className="mt-2 text-[12.5px] text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">
            <li>El nombre canónico de cada slot se usa para etiquetar variantes en la UI y para hacer match con materiales MM.</li>
            <li>Los borradores de reemplazo no tocan el BOM. Cuando aprobemos la aplicación bulk será una acción separada (Phase 4) con doble confirmación.</li>
            <li>Excluidos del bulk replace (Phase 4): mushrooms, solubles y distillates puros.</li>
            <li>Containers/variantes considerados: 1ml, 2.25ml, 4ml y Jeringa. Otros formatos requieren mapping manual.</li>
          </ul>
        </Card>
      </section>
    </Layout>
  );
}

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
