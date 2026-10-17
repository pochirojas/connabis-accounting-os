import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Camera, CheckCircle2, FileText, Inbox, X } from 'lucide-react';
import type { ExpenseBrand } from '@shared/schema';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { formatCOP } from '@/lib/format';
import { BRAND_OPTIONS, PAID_WITH_OPTIONS, fileToUpload, parseMoney, todayBogota } from '@/lib/expense-options';
import { invalidateExpenseQueries } from '@/components/expenses/expense-editor-dialog';
import { cn } from '@/lib/utils';

type Picked = { file: File; preview?: string };

export default function Capturar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [fxRate, setFxRate] = useState('');
  const [date, setDate] = useState(todayBogota());
  const [description, setDescription] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [paidWith, setPaidWith] = useState(() => localStorage.getItem('capture.paidWith') ?? 'Nequi');
  const [brand, setBrand] = useState<ExpenseBrand | ''>(() => (localStorage.getItem('capture.brand') as ExpenseBrand) ?? '');
  const [hasInvoice, setHasInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number } | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(files.map(item => fileToUpload(item.file)));
      return (await apiRequest('POST', '/api/expenses/capture', {
        date,
        amount: parseMoney(amount),
        currency,
        fxRate: currency === 'USD' ? parseMoney(fxRate) : undefined,
        description: description.trim(),
        paidTo: paidTo.trim() || undefined,
        paidWith,
        brand: brand || undefined,
        hasInvoice,
        attachments,
      })).json();
    },
    onSuccess: () => {
      localStorage.setItem('capture.paidWith', paidWith);
      if (brand) localStorage.setItem('capture.brand', brand);
      invalidateExpenseQueries();
      setDone({ amount: currency === 'USD' ? parseMoney(amount) * parseMoney(fxRate) : parseMoney(amount) });
    },
    onError: (err: Error) => {
      const raw = err.message.replace(/^\d+:\s*/, '');
      try {
        const parsed = JSON.parse(raw);
        const fieldErrors = parsed?.details?.fieldErrors ?? {};
        const first = Object.values(fieldErrors).flat()[0] ?? parsed?.details?.formErrors?.[0];
        setError(String(first ?? parsed.error ?? raw));
      } catch {
        setError(raw);
      }
    },
  });

  function reset() {
    files.forEach(item => item.preview && URL.revokeObjectURL(item.preview));
    setFiles([]); setAmount(''); setFxRate(''); setDescription(''); setPaidTo(''); setHasInvoice(false);
    setDate(todayBogota()); setError(null); setDone(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!(parseMoney(amount) > 0)) return setError('Escribe el monto.');
    if (!description.trim() && files.length === 0) return setError('Agrega una foto del soporte o una descripción.');
    if (currency === 'USD' && !(parseMoney(fxRate) > 0)) return setError('Escribe la TRM.');
    setError(null);
    submit.mutate();
  }

  if (done) {
    return (
      <Layout title="Capturar gasto">
        <Card className="mx-auto max-w-md p-6 text-center bg-card border-card-border" data-testid="card-capture-done">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <h2 className="mt-3 text-lg font-semibold">Gasto capturado</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatCOP(done.amount)} quedó en "Por revisar".</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={reset} className="gap-1.5" data-testid="button-capture-another"><Camera className="h-4 w-4" /> Capturar otro</Button>
            <Link href="/gastos"><Button variant="outline" className="w-full gap-1.5"><Inbox className="h-4 w-4" /> Ir a revisar</Button></Link>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Capturar gasto" subtitle="Foto + monto. Lo demás se completa al revisar.">
      <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4" data-testid="form-capture">
        <Card className="p-4 bg-card border-card-border">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-muted/40"
            data-testid="button-capture-photo"
          >
            <Camera className="h-7 w-7" />
            {files.length ? 'Agregar otra foto / PDF' : 'Tomar foto o subir factura'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.xml"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => {
              const picked = Array.from(e.target.files ?? []).slice(0, 5 - files.length).map(file => ({
                file,
                preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
              }));
              setFiles(prev => [...prev, ...picked]);
              e.target.value = '';
            }}
            data-testid="input-capture-file"
          />
          {files.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((item, index) => (
                <div key={index} className="relative h-20 w-20 overflow-hidden rounded border border-border">
                  {item.preview ? <img src={item.preview} alt="" className="h-full w-full object-cover" /> : (
                    <div className="flex h-full w-full flex-col items-center justify-center p-1 text-[10px] text-muted-foreground"><FileText className="h-5 w-5" /><span className="truncate w-full text-center">{item.file.name}</span></div>
                  )}
                  <button type="button" className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5" onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))} aria-label="Quitar">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="p-4 space-y-4 bg-card border-card-border">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Monto</span>
              <Input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="45.000" className="h-12 text-lg tabular" data-testid="input-capture-amount" />
            </label>
            <div className="flex rounded-md border border-input overflow-hidden h-12">
              {(['COP', 'USD'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCurrency(c)} className={cn('px-3 text-sm', currency === c ? 'bg-primary text-primary-foreground' : 'bg-background')} data-testid={`button-capture-currency-${c}`}>{c}</button>
              ))}
            </div>
          </div>
          {currency === 'USD' ? (
            <label className="block space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">TRM</span>
              <Input inputMode="decimal" value={fxRate} onChange={e => setFxRate(e.target.value)} placeholder="4.100" data-testid="input-capture-fx" />
            </label>
          ) : null}

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Marca</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {BRAND_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBrand(option.value)}
                  className={cn('h-10 rounded-md border text-sm', brand === option.value ? 'border-primary bg-primary/15 text-foreground' : 'border-input bg-background text-muted-foreground')}
                  data-testid={`button-capture-brand-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">¿Qué fue?</span>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Frascos 30ml x100" data-testid="input-capture-description" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Pagado con</span>
              <select value={paidWith} onChange={e => setPaidWith(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" data-testid="select-capture-paid-with">
                {PAID_WITH_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Fecha</span>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-capture-date" />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Proveedor (opcional)</span>
            <Input value={paidTo} onChange={e => setPaidTo(e.target.value)} placeholder="Litografía XYZ" data-testid="input-capture-paid-to" />
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={hasInvoice} onChange={e => setHasInvoice(e.target.checked)} className="h-5 w-5" data-testid="checkbox-capture-invoice" />
            El proveedor nos dio factura electrónica
          </label>
        </Card>

        {error ? <p className="text-sm text-destructive" data-testid="text-capture-error">{error}</p> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={submit.isPending} data-testid="button-capture-submit">
          {submit.isPending ? 'Guardando…' : 'Guardar gasto'}
        </Button>
      </form>
    </Layout>
  );
}
