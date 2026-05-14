import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatCOP } from '@/lib/format';

type LineForm = {
  product: string;
  sku: string;
  quantity: string;
  unitCost: string;
  taxPct: string;
};

function emptyLine(): LineForm {
  return { product: '', sku: '', quantity: '1', unitCost: '0', taxPct: '0' };
}

// Manual Purchase Order creator. The created PO is stored in the same MM
// purchase-order table as the CSV-imported ones but tagged `source_file =
// 'manual'` so reimporting the CSV set never destroys it. The PO number is
// auto-assigned (next free POn) unless the user types one explicitly.
export function CreatePurchaseOrderDialog({ trigger }: { trigger?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [supplier, setSupplier] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [shipping, setShipping] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const taxes = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * ((Number(l.taxPct) || 0) / 100), 0);
  const total = subtotal + taxes + (Number(shipping) || 0);

  const reset = () => {
    setDate(today);
    setSupplier('');
    setPoNumber('');
    setShipTo('');
    setReferenceNumber('');
    setCurrency('COP');
    setShipping('0');
    setNotes('');
    setLines([emptyLine()]);
  };

  const createPo = useMutation({
    mutationFn: async () => {
      const payload = {
        poNumber: poNumber.trim() || undefined,
        date,
        supplier: supplier.trim(),
        shipTo: shipTo.trim(),
        currency,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null,
        shipping: Number(shipping) || 0,
        lines: lines
          .filter(l => l.product.trim() && Number(l.quantity) > 0)
          .map(l => ({
            product: l.product.trim(),
            sku: l.sku.trim(),
            quantity: Number(l.quantity) || 0,
            unitCost: Number(l.unitCost) || 0,
            taxPct: Number(l.taxPct) || 0,
          })),
      };
      const response = await apiRequest('POST', '/api/material-manager/purchase-orders', payload);
      return response.json();
    },
    onSuccess: (created) => {
      toast({ title: `PO creada · ${created?.poNumber ?? ''}`, description: `Total ${formatCOP(created?.total ?? 0)}` });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      reset();
      setOpen(false);
    },
    onError: (error) => toast({ title: 'No se pudo crear la PO', description: String(error), variant: 'destructive' }),
  });

  const valid = supplier.trim() && date && lines.some(l => l.product.trim() && Number(l.quantity) > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" data-testid="button-open-create-po">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear PO manual
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear orden de compra manual</DialogTitle>
          <DialogDescription>
            Las POs manuales se guardan en la misma tabla que las importadas y sobreviven a reimportar el CSV.
            El número de PO se asigna automáticamente al siguiente disponible.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-po-date" />
          </Field>
          <Field label="Proveedor *">
            <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nombre del proveedor" data-testid="input-po-supplier" />
          </Field>
          <Field label="N° de PO (opcional)">
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="auto" data-testid="input-po-number" />
          </Field>
          <Field label="Ship to">
            <Input value={shipTo} onChange={e => setShipTo(e.target.value)} placeholder="Dirección" data-testid="input-po-shipto" />
          </Field>
          <Field label="Referencia">
            <Input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="Ej. factura" data-testid="input-po-reference" />
          </Field>
          <Field label="Moneda">
            <select value={currency} onChange={e => setCurrency(e.target.value as 'COP' | 'USD')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="select-po-currency">
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Líneas de la PO</div>
            <Button size="sm" variant="outline" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-po-line">
              <Plus className="h-3 w-3 mr-1" /> Agregar línea
            </Button>
          </div>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start" data-testid={`row-po-line-${idx}`}>
                <Input className="col-span-4" placeholder="Producto" value={line.product} onChange={e => updateLine(setLines, idx, 'product', e.target.value)} data-testid={`input-po-line-product-${idx}`} />
                <Input className="col-span-2" placeholder="SKU" value={line.sku} onChange={e => updateLine(setLines, idx, 'sku', e.target.value)} data-testid={`input-po-line-sku-${idx}`} />
                <Input className="col-span-1" type="number" step="any" min="0" placeholder="Qty" value={line.quantity} onChange={e => updateLine(setLines, idx, 'quantity', e.target.value)} data-testid={`input-po-line-qty-${idx}`} />
                <Input className="col-span-2" type="number" step="any" min="0" placeholder="Costo unit." value={line.unitCost} onChange={e => updateLine(setLines, idx, 'unitCost', e.target.value)} data-testid={`input-po-line-unit-${idx}`} />
                <Input className="col-span-1" type="number" step="any" min="0" placeholder="IVA %" value={line.taxPct} onChange={e => updateLine(setLines, idx, 'taxPct', e.target.value)} data-testid={`input-po-line-tax-${idx}`} />
                <div className="col-span-1 text-[11px] tabular text-right text-muted-foreground pt-2.5">
                  {formatCOP((Number(line.quantity) || 0) * (Number(line.unitCost) || 0) * (1 + (Number(line.taxPct) || 0) / 100))}
                </div>
                <Button className="col-span-1" size="icon" variant="ghost" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))} aria-label="Quitar línea" data-testid={`button-remove-po-line-${idx}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 items-end">
          <Field label="Envío">
            <Input type="number" step="any" min="0" value={shipping} onChange={e => setShipping(e.target.value)} data-testid="input-po-shipping" />
          </Field>
          <Field label="Notas">
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas internas" data-testid="input-po-notes" />
          </Field>
          <div className="col-span-2 rounded-md border border-border bg-muted/25 p-3 text-[12px]">
            <Row label="Subtotal" value={formatCOP(subtotal)} />
            <Row label="Impuestos" value={formatCOP(taxes)} />
            <Row label="Envío" value={formatCOP(Number(shipping) || 0)} />
            <div className="border-t border-card-border mt-1 pt-1 flex justify-between font-semibold">
              <span>Total</span><span className="tabular">{formatCOP(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancelar</Button>
          <Button onClick={() => createPo.mutate()} disabled={!valid || createPo.isPending} data-testid="button-submit-po">
            {createPo.isPending ? 'Guardando…' : 'Crear PO'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function updateLine(setLines: React.Dispatch<React.SetStateAction<LineForm[]>>, idx: number, key: keyof LineForm, value: string) {
  setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
