import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, Paperclip, Save, Trash2, X } from 'lucide-react';
import type { DocumentType, Expense, ExpenseBrand, ExpenseStatus, UpdateExpense } from '@shared/schema';
import { DOCUMENT_TYPE_LABELS, EXPENSE_STATUS_LABELS } from '@shared/schema';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiRequest, API_BASE, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCOP } from '@/lib/format';
import {
  BRAND_OPTIONS, CATEGORY_OPTIONS, DOCUMENT_OPTIONS, PAID_WITH_OPTIONS, fileToUpload, parseMoney,
} from '@/lib/expense-options';

type Draft = {
  date: string;
  category: string;
  description: string;
  paidTo: string;
  supplierNit: string;
  paidWith: string;
  brand: ExpenseBrand | '';
  currency: 'COP' | 'USD';
  amount: string;
  originalAmount: string;
  fxRate: string;
  documentType: DocumentType | '';
  documentNumber: string;
  cufe: string;
  iva: string;
  retefuente: string;
  dataicoRef: string;
  notes: string;
};

function toDraft(expense: Expense): Draft {
  return {
    date: expense.date,
    category: expense.category || 'Sin categoría',
    description: expense.description ?? '',
    paidTo: expense.paidTo ?? '',
    supplierNit: expense.supplierNit ?? '',
    paidWith: expense.paidWith ?? '',
    brand: expense.brand ?? '',
    currency: expense.currency ?? 'COP',
    amount: expense.amount ? String(expense.amount) : '',
    originalAmount: expense.originalAmount ? String(expense.originalAmount) : '',
    fxRate: expense.fxRate ? String(expense.fxRate) : '',
    documentType: expense.documentType ?? (expense.hasInvoice ? 'factura_electronica' : ''),
    documentNumber: expense.documentNumber ?? '',
    cufe: expense.cufe ?? '',
    iva: expense.iva ? String(expense.iva) : '',
    retefuente: expense.retefuente ? String(expense.retefuente) : '',
    dataicoRef: expense.dataicoRef ?? '',
    notes: expense.notes ?? '',
  };
}

export function invalidateExpenseQueries() {
  for (const key of ['/api/expenses', '/api/expenses/queue', '/api/expenses/discarded', '/api/months', '/api/kpis', '/api/alerts']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`space-y-1.5 ${wide ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function ExpenseEditorDialog({
  expense,
  onClose,
  mode = 'edit',
}: {
  expense: Expense | null;
  onClose: () => void;
  mode?: 'edit' | 'review';
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(expense?.attachments ?? []);

  useEffect(() => {
    setDraft(expense ? toDraft(expense) : null);
    setAttachments(expense?.attachments ?? []);
    setError(null);
  }, [expense]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(prev => (prev ? { ...prev, [key]: value } : prev));

  const save = useMutation({
    mutationFn: async ({ payload, status }: { payload: UpdateExpense; status?: ExpenseStatus }) => {
      const res = await apiRequest('PUT', `/api/expenses/${expense!.id}`, { ...payload, ...(status ? { status } : {}) });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      invalidateExpenseQueries();
      toast({ title: vars.status === 'revisado' ? 'Gasto aprobado' : 'Gasto guardado' });
      onClose();
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, '')),
  });

  const discard = useMutation({
    mutationFn: async () => (await apiRequest('PATCH', `/api/expenses/${expense!.id}/status`, { status: 'descartado' })).json(),
    onSuccess: () => {
      invalidateExpenseQueries();
      toast({ title: 'Gasto descartado', description: 'Queda en la lista de descartados, no se borra.' });
      onClose();
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => (await apiRequest('POST', `/api/expenses/${expense!.id}/attachments`, await fileToUpload(file))).json(),
    onSuccess: attachment => {
      setAttachments(prev => [...prev, attachment]);
      invalidateExpenseQueries();
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, '')),
  });

  function buildPayload(requireComplete: boolean): UpdateExpense | null {
    if (!draft) return null;
    const amount = draft.currency === 'USD'
      ? parseMoney(draft.originalAmount) * parseMoney(draft.fxRate)
      : parseMoney(draft.amount);
    if (!(amount > 0)) { setError('El monto debe ser mayor a 0.'); return null; }
    if (!draft.description.trim()) { setError('Agrega una descripción.'); return null; }
    if (requireComplete) {
      if (!draft.brand) { setError('Para aprobar, elige la marca (Connabis, Turros o Compartido).'); return null; }
      if (!draft.documentType) { setError('Para aprobar, indica el tipo de soporte (o "Sin soporte").'); return null; }
      if (draft.category === 'Sin categoría') { setError('Para aprobar, elige una categoría.'); return null; }
    }
    setError(null);
    return {
      date: draft.date,
      category: draft.category,
      description: draft.description.trim(),
      amount: Math.round(amount * 100) / 100,
      paidTo: draft.paidTo.trim(),
      supplierNit: draft.supplierNit.trim(),
      paidWith: draft.paidWith,
      currency: draft.currency,
      originalAmount: draft.currency === 'USD' ? parseMoney(draft.originalAmount) : undefined,
      fxRate: draft.currency === 'USD' ? parseMoney(draft.fxRate) : undefined,
      brand: draft.brand || undefined,
      documentType: draft.documentType || undefined,
      documentNumber: draft.documentNumber.trim(),
      cufe: draft.cufe.trim(),
      iva: draft.iva ? parseMoney(draft.iva) : 0,
      retefuente: draft.retefuente ? parseMoney(draft.retefuente) : 0,
      dataicoRef: draft.dataicoRef.trim(),
      notes: draft.notes,
    };
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = buildPayload(false);
    if (payload) save.mutate({ payload });
  }

  function approve() {
    const payload = buildPayload(true);
    if (payload) save.mutate({ payload, status: 'revisado' });
  }

  const sourceLabel: Record<string, string> = { sheet: 'Sheet histórico', manual: 'Manual', capture: 'Captura rápida', discord: 'Discord', shopify: 'Shopify' };
  const usdComputed = draft && draft.currency === 'USD' ? parseMoney(draft.originalAmount) * parseMoney(draft.fxRate) : 0;

  return (
    <Dialog open={expense !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="dialog-expense-editor">
        <DialogHeader>
          <DialogTitle>{mode === 'review' ? 'Revisar gasto' : 'Editar gasto'}</DialogTitle>
          <DialogDescription>
            {expense ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{sourceLabel[expense.source] ?? expense.source}</Badge>
                {expense.status ? <Badge variant="secondary" className="text-[10px]">{EXPENSE_STATUS_LABELS[expense.status]}</Badge> : null}
                {expense.paidBy ? <span className="text-xs">Registrado por {expense.paidBy}</span> : null}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {expense?.rawText ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap" data-testid="text-raw-message">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Mensaje original</div>
            {expense.rawText}
          </div>
        ) : null}

        {draft ? (
          <form onSubmit={onSubmit} data-testid="form-expense-editor">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <Field label="Fecha">
                <Input type="date" value={draft.date} onChange={e => set('date', e.target.value)} data-testid="input-editor-date" />
              </Field>
              <Field label="Marca">
                <select value={draft.brand} onChange={e => set('brand', e.target.value as ExpenseBrand | '')} className={selectClass} data-testid="select-editor-brand">
                  <option value="">— Elegir —</option>
                  {BRAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Categoría">
                <select value={draft.category} onChange={e => set('category', e.target.value)} className={selectClass} data-testid="select-editor-category">
                  {(CATEGORY_OPTIONS.includes(draft.category) ? CATEGORY_OPTIONS : [draft.category, ...CATEGORY_OPTIONS]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Descripción" wide>
                <Input value={draft.description} onChange={e => set('description', e.target.value)} data-testid="input-editor-description" />
              </Field>
              <Field label="Proveedor (pagado a)">
                <Input value={draft.paidTo} onChange={e => set('paidTo', e.target.value)} data-testid="input-editor-paid-to" />
              </Field>
              <Field label="NIT / cédula proveedor">
                <Input value={draft.supplierNit} onChange={e => set('supplierNit', e.target.value)} inputMode="numeric" placeholder="Ej. 900123456-7" data-testid="input-editor-nit" />
              </Field>
              <Field label="Pagado con">
                <select value={draft.paidWith} onChange={e => set('paidWith', e.target.value)} className={selectClass} data-testid="select-editor-paid-with">
                  <option value="">— Elegir —</option>
                  {(PAID_WITH_OPTIONS.includes(draft.paidWith) || !draft.paidWith ? PAID_WITH_OPTIONS : [draft.paidWith, ...PAID_WITH_OPTIONS]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Moneda">
                <select value={draft.currency} onChange={e => set('currency', e.target.value as 'COP' | 'USD')} className={selectClass} data-testid="select-editor-currency">
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              {draft.currency === 'USD' ? (
                <>
                  <Field label="Monto USD">
                    <Input inputMode="decimal" value={draft.originalAmount} onChange={e => set('originalAmount', e.target.value)} className="text-right tabular" data-testid="input-editor-usd" />
                  </Field>
                  <Field label="TRM" hint={usdComputed > 0 ? `= ${formatCOP(usdComputed)}` : undefined}>
                    <Input inputMode="decimal" value={draft.fxRate} onChange={e => set('fxRate', e.target.value)} className="text-right tabular" data-testid="input-editor-fx" />
                  </Field>
                </>
              ) : (
                <Field label="Monto COP" hint={parseMoney(draft.amount) > 0 ? formatCOP(parseMoney(draft.amount)) : undefined}>
                  <Input inputMode="decimal" value={draft.amount} onChange={e => set('amount', e.target.value)} className="text-right tabular" data-testid="input-editor-amount" />
                </Field>
              )}
            </div>

            <div className="mt-5 rounded-md border border-border p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold"><FileText className="h-3.5 w-3.5" /> Soporte DIAN</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <Field label="Tipo de soporte">
                  <select value={draft.documentType} onChange={e => set('documentType', e.target.value as DocumentType | '')} className={selectClass} data-testid="select-editor-document-type">
                    <option value="">— Elegir —</option>
                    {DOCUMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="N.º documento">
                  <Input value={draft.documentNumber} onChange={e => set('documentNumber', e.target.value)} placeholder="Ej. FE-1234" data-testid="input-editor-doc-number" />
                </Field>
                <Field label="Ref. Dataico">
                  <Input value={draft.dataicoRef} onChange={e => set('dataicoRef', e.target.value)} data-testid="input-editor-dataico" />
                </Field>
                {draft.documentType === 'factura_electronica' ? (
                  <Field label="CUFE" wide>
                    <Input value={draft.cufe} onChange={e => set('cufe', e.target.value)} className="font-mono text-xs" data-testid="input-editor-cufe" />
                  </Field>
                ) : null}
                <Field label="IVA en la factura (COP)">
                  <Input inputMode="decimal" value={draft.iva} onChange={e => set('iva', e.target.value)} className="text-right tabular" data-testid="input-editor-iva" />
                </Field>
                <Field label="Retención practicada (COP)" hint="Si le retuvimos al proveedor.">
                  <Input inputMode="decimal" value={draft.retefuente} onChange={e => set('retefuente', e.target.value)} className="text-right tabular" data-testid="input-editor-retefuente" />
                </Field>
              </div>
              {draft.documentType === 'sin_soporte' ? (
                <p className="mt-2 text-[11px] text-amber-400">Sin soporte, este gasto normalmente no es deducible. Si el proveedor no factura, emite documento soporte en Dataico.</p>
              ) : null}
              {draft.documentType === 'documento_soporte' && !draft.supplierNit ? (
                <p className="mt-2 text-[11px] text-amber-400">El documento soporte necesita NIT o cédula del proveedor.</p>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Adjuntos ({attachments.length})</span>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={upload.isPending} data-testid="button-editor-attach">
                  <Paperclip className="h-3.5 w-3.5" /> {upload.isPending ? 'Subiendo…' : 'Agregar'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf,.xml,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
              </div>
              {attachments.length ? (
                <div className="flex flex-wrap gap-2">
                  {attachments.map(att => {
                    const href = att.external ? att.url : `${API_BASE}${att.url}`;
                    return att.mimeType.startsWith('image/') && !att.external ? (
                      <a key={att.id} href={href} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded border border-border">
                        <img src={href} alt={att.fileName} className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <a key={att.id} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted">
                        <ExternalLink className="h-3 w-3" /> {att.fileName}{att.external ? ' (Discord)' : ''}
                      </a>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground">Sin adjuntos.</p>}
              {attachments.some(att => att.external) ? (
                <p className="text-[11px] text-muted-foreground">Los links de Discord expiran. Si el soporte importa, descárgalo y súbelo con "Agregar".</p>
              ) : null}
            </div>

            <div className="mt-4">
              <Field label="Notas" wide>
                <Input value={draft.notes} onChange={e => set('notes', e.target.value)} data-testid="input-editor-notes" />
              </Field>
            </div>

            {error ? <p className="mt-3 text-sm text-destructive" data-testid="text-editor-error">{error}</p> : null}

            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <Button type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={() => discard.mutate()} disabled={discard.isPending} data-testid="button-editor-discard">
                <Trash2 className="h-4 w-4" /> Descartar
              </Button>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button type="button" variant="ghost" onClick={onClose} data-testid="button-editor-cancel"><X className="h-4 w-4 mr-1" />Cancelar</Button>
                <Button type="submit" variant={mode === 'review' ? 'outline' : 'default'} className="gap-1.5" disabled={save.isPending} data-testid="button-editor-save">
                  <Save className="h-4 w-4" /> Guardar
                </Button>
                {mode === 'review' ? (
                  <Button type="button" className="gap-1.5" onClick={approve} disabled={save.isPending} data-testid="button-editor-approve">
                    <CheckCircle2 className="h-4 w-4" /> Guardar y aprobar
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { DOCUMENT_TYPE_LABELS };
