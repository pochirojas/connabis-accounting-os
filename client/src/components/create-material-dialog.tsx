import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { MmMaterialRow } from '@shared/schema';

type FormState = {
  name: string;
  sku: string;
  category: string;
  bucket: '' | 'noids' | 'materials' | 'supplements' | 'insumos';
  measurement: string;
  supplier: string;
  cost: string;
  currencyCode: string;
  stock: string;
  barcode: string;
  description: string;
  imageUrl: string;
  updateShopifyInventory: boolean;
  limitShopifyInventory: boolean;
};

function emptyForm(): FormState {
  return {
    name: '', sku: '', category: '', bucket: '', measurement: 'unit', supplier: '',
    cost: '0', currencyCode: 'COP', stock: '0', barcode: '', description: '', imageUrl: '',
    updateShopifyInventory: false, limitShopifyInventory: false,
  };
}

// Manual material creator (P0 — replaces "request to MM team" workflow). The
// new material is stored locally (origin='local') and surfaces in cost dashes,
// PO line pickers, and BOM, but is NEVER round-tripped to the MM CSV export so
// the rollback contract stays intact.
export function CreateMaterialDialog({ trigger, onCreated }: { trigger?: React.ReactNode; onCreated?: (m: MmMaterialRow) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        category: form.category.trim() || undefined,
        measurement: form.measurement.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        cost: form.cost === '' ? undefined : Number(form.cost),
        currencyCode: form.currencyCode || 'COP',
        stock: form.stock === '' ? undefined : Number(form.stock),
        barcode: form.barcode.trim() || undefined,
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        updateShopifyInventory: form.updateShopifyInventory,
        limitShopifyInventory: form.limitShopifyInventory,
      };
      if (form.bucket) payload.bucket = form.bucket;
      const response = await apiRequest('POST', '/api/material-manager/materials', payload);
      return response.json() as Promise<MmMaterialRow>;
    },
    onSuccess: (created) => {
      toast({ title: 'Material creado (local)', description: `${created.name} · no se exporta al CSV de MM hasta promoverlo manualmente.` });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/cost-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/cost-breakdown/dash'] });
      setForm(emptyForm());
      setOpen(false);
      onCreated?.(created);
    },
    onError: (error) => toast({ title: 'No se pudo crear el material', description: String(error), variant: 'destructive' }),
  });

  const valid = form.name.trim().length > 0;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setForm(emptyForm()); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" data-testid="button-open-create-material">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear material
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo material</DialogTitle>
          <DialogDescription>
            Crea un material desde cero. Se guarda como <code>origin=local</code> y aparece en cost dashes,
            POs y BOM. <strong>No</strong> se exporta al CSV de Material Manager (preserva el rollback bit-exact).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre *">
            <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. CBD Distillate 99%" data-testid="input-new-material-name" autoFocus />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={e => update('sku', e.target.value)} placeholder="ej. CBD-99" data-testid="input-new-material-sku" />
          </Field>
          <Field label="Categoría">
            <Input value={form.category} onChange={e => update('category', e.target.value)} placeholder="ej. Distillate" data-testid="input-new-material-category" />
          </Field>
          <Field label="Bucket de inventario">
            <select
              value={form.bucket}
              onChange={e => update('bucket', e.target.value as FormState['bucket'])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-new-material-bucket"
            >
              <option value="">Auto (por categoría)</option>
              <option value="noids">Noids (cannabinoides)</option>
              <option value="materials">Materials</option>
              <option value="supplements">Supplements</option>
              <option value="insumos">Insumos (no inventario)</option>
            </select>
          </Field>
          <Field label="Medida / Unidad">
            <Input value={form.measurement} onChange={e => update('measurement', e.target.value)} placeholder="g / ml / unit" data-testid="input-new-material-unit" />
          </Field>
          <Field label="Proveedor">
            <Input value={form.supplier} onChange={e => update('supplier', e.target.value)} placeholder="Nombre del proveedor" data-testid="input-new-material-supplier" />
          </Field>
          <Field label="Costo unitario">
            <Input type="number" step="any" min="0" value={form.cost} onChange={e => update('cost', e.target.value)} data-testid="input-new-material-cost" />
          </Field>
          <Field label="Moneda">
            <Input value={form.currencyCode} onChange={e => update('currencyCode', e.target.value.toUpperCase().slice(0, 8))} placeholder="COP" data-testid="input-new-material-currency" />
          </Field>
          <Field label="Stock inicial">
            <Input type="number" step="any" min="0" value={form.stock} onChange={e => update('stock', e.target.value)} data-testid="input-new-material-stock" />
          </Field>
          <Field label="Barcode (opcional)">
            <Input value={form.barcode} onChange={e => update('barcode', e.target.value)} data-testid="input-new-material-barcode" />
          </Field>
          <Field label="Foto URL (opcional)">
            <Input value={form.imageUrl} onChange={e => update('imageUrl', e.target.value)} placeholder="https://…" data-testid="input-new-material-image" />
          </Field>
        </div>

        <div className="mt-2">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">Descripción</div>
          <textarea
            value={form.description}
            onChange={e => update('description', e.target.value)}
            className="w-full min-h-[60px] rounded-md border border-input bg-background p-2 text-sm"
            placeholder="Notas internas opcionales…"
            data-testid="textarea-new-material-description"
          />
        </div>

        <div className="flex flex-wrap gap-3 text-[12px] mt-1">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={form.updateShopifyInventory} onChange={e => update('updateShopifyInventory', e.target.checked)} data-testid="checkbox-new-material-update-shopify" />
            Update Shopify Inventory
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={form.limitShopifyInventory} onChange={e => update('limitShopifyInventory', e.target.checked)} data-testid="checkbox-new-material-limit-shopify" />
            Limit Shopify Inventory
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setForm(emptyForm()); setOpen(false); }}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending} data-testid="button-submit-new-material">
            {create.isPending ? 'Creando…' : 'Crear material'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
