import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Save, ShieldAlert } from 'lucide-react';

type MmSettings = {
  syncMaterialInventory: boolean;
  syncAssembledInventory: boolean;
  syncCostPerItem: boolean;
  blockCheckoutWhenShared: boolean;
  poPrefix: string;
  poLogoUrl: string;
  locations: Array<{ id: string; label: string; active: boolean }>;
  shopifyWritesEnabled: boolean;
  updatedAt: string;
};

// Local-only settings panel (Phase 2.6 P0). Mirrors the Material Manager
// settings screen, but **no Shopify writes happen** — every toggle is a
// future-intent flag persisted in the OS DB. The card banner makes that
// contract explicit so the user is not surprised when Shopify variants stay
// untouched after flipping a switch.
export function MmSettingsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settings = useQuery<MmSettings>({ queryKey: ['/api/material-manager/settings'] });
  const [draft, setDraft] = useState<MmSettings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings.data && !dirty) setDraft(settings.data);
  }, [settings.data, dirty]);

  const save = useMutation({
    mutationFn: async (next: MmSettings) => {
      const response = await apiRequest('PATCH', '/api/material-manager/settings', next);
      return response.json() as Promise<MmSettings>;
    },
    onSuccess: () => {
      toast({ title: 'Settings guardados', description: 'Almacenado localmente en el OS (no se envía a Shopify).' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/settings'] });
      setDirty(false);
    },
    onError: (error) => toast({ title: 'No se pudieron guardar', description: String(error), variant: 'destructive' }),
  });

  if (!draft) return <Card className="p-5"><p className="text-sm text-muted-foreground">Cargando settings…</p></Card>;

  const update = <K extends keyof MmSettings>(key: K, value: MmSettings[K]) => {
    setDraft({ ...draft, [key]: value });
    setDirty(true);
  };
  const updateLocation = (idx: number, active: boolean) => {
    const next = draft.locations.slice();
    next[idx] = { ...next[idx], active };
    setDraft({ ...draft, locations: next });
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border-amber-500/30 bg-amber-500/8" data-testid="card-settings-warning">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-200">Sin escrituras a Shopify</h3>
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
          Estos toggles se guardan localmente en el OS. Las escrituras a Shopify están bloqueadas en Phase 2.6 —
          cuando exista el proxy backend, los flags activados aquí determinarán qué se sincroniza.
        </p>
      </Card>

      <Card className="p-5" data-testid="card-settings-shopify-sync">
        <h3 className="text-sm font-semibold tracking-tight">Shopify sync (futuro)</h3>
        <p className="text-[11.5px] text-muted-foreground mt-1 max-w-prose">
          Controla qué se actualizará en Shopify cuando se hagan cambios en Material Manager. Hoy el efecto es solo informativo.
        </p>
        <div className="mt-4 space-y-3 text-[12.5px]">
          <SwitchRow
            label="Sync material inventory"
            description="Actualiza el inventario de las variantes Shopify a partir de los materiales (a futuro)."
            checked={draft.syncMaterialInventory}
            onCheckedChange={(v) => update('syncMaterialInventory', v)}
            testId="switch-sync-material"
          />
          <SwitchRow
            label="Sync assembled inventory"
            description="Actualiza el inventario de variantes según la receta ensamblada."
            checked={draft.syncAssembledInventory}
            onCheckedChange={(v) => update('syncAssembledInventory', v)}
            testId="switch-sync-assembled"
          />
          <SwitchRow
            label="Sync cost per item"
            description="Cuando esté en true, el cost-per-item de cada variante Shopify se calculará a partir del costo de los materiales (misma moneda)."
            checked={draft.syncCostPerItem}
            onCheckedChange={(v) => update('syncCostPerItem', v)}
            testId="switch-sync-cost"
          />
          <SwitchRow
            label="Block checkout when shared materials are insufficient"
            description="Bloquea el checkout cuando dos productos en el carrito comparten materiales y la demanda excede el stock disponible."
            checked={draft.blockCheckoutWhenShared}
            onCheckedChange={(v) => update('blockCheckoutWhenShared', v)}
            testId="switch-block-checkout"
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Switch
            checked={draft.shopifyWritesEnabled}
            disabled
            data-testid="switch-shopify-writes-enabled"
          />
          <span className="text-[11.5px] text-muted-foreground">Enable Shopify writes <Badge variant="outline" className="ml-1 text-[10px]">requiere proxy backend</Badge></span>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-settings-po">
        <h3 className="text-sm font-semibold tracking-tight">Purchase orders</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">Prefijo de número de PO</div>
            <Input
              value={draft.poPrefix}
              onChange={(e) => update('poPrefix', e.target.value.slice(0, 20))}
              placeholder="PO"
              data-testid="input-po-prefix"
            />
            <p className="text-[10.5px] text-muted-foreground mt-1">Las POs existentes no se renombran. El siguiente número usará este prefijo.</p>
          </label>
          <label className="block">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">URL del logo del PO</div>
            <Input
              value={draft.poLogoUrl}
              onChange={(e) => update('poLogoUrl', e.target.value)}
              placeholder="https://… (altura recomendada 42px)"
              data-testid="input-po-logo-url"
            />
            {draft.poLogoUrl ? (
              <img src={draft.poLogoUrl} alt="PO logo preview" className="mt-2 h-10 rounded border border-border" referrerPolicy="no-referrer" />
            ) : null}
          </label>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-settings-locations">
        <h3 className="text-sm font-semibold tracking-tight">Habilitar / deshabilitar ubicaciones</h3>
        <p className="text-[11.5px] text-muted-foreground mt-1 max-w-prose">
          Cuando una ubicación está deshabilitada, no se podrá actualizar inventario de materiales en esa ubicación.
          Las órdenes asignadas a la ubicación no consumirán inventario.
        </p>
        <ul className="mt-3 space-y-2">
          {draft.locations.map((loc, idx) => (
            <li key={loc.id} className="flex items-center justify-between border border-border rounded-md p-2.5">
              <div>
                <div className="text-[13px] font-medium">{loc.label}</div>
                <div className="text-[10.5px] text-muted-foreground font-mono">{loc.id}</div>
              </div>
              <Switch checked={loc.active} onCheckedChange={(v) => updateLocation(idx, Boolean(v))} data-testid={`switch-location-${loc.id}`} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex items-center justify-end gap-2 pb-6">
        {dirty ? <Badge variant="outline" className="text-[10.5px] border-amber-500/40 text-amber-300">Sin guardar</Badge> : null}
        <Button onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending} data-testid="button-save-mm-settings">
          <Save className="h-3.5 w-3.5 mr-1.5" /> {save.isPending ? 'Guardando…' : 'Guardar settings'}
        </Button>
      </div>
    </div>
  );
}

function SwitchRow({ label, description, checked, onCheckedChange, testId }: { label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-start justify-between gap-3 border border-border rounded-md p-3">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-prose">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onCheckedChange(Boolean(v))} data-testid={testId} />
    </label>
  );
}
