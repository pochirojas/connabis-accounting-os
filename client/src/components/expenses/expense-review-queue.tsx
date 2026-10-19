import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Camera, Inbox, Paperclip } from 'lucide-react';
import type { Expense } from '@shared/schema';
import { EXPENSE_BRAND_LABELS } from '@shared/schema';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP, formatDate } from '@/lib/format';
import { ExpenseEditorDialog } from './expense-editor-dialog';

const SOURCE_LABEL: Record<string, string> = { capture: 'Captura', discord: 'Discord', manual: 'Manual', sheet: 'Sheet' };

export function ExpenseReviewQueue() {
  const queue = useQuery<Expense[]>({ queryKey: ['/api/expenses/queue'] });
  const [selected, setSelected] = useState<Expense | null>(null);
  const [showAll, setShowAll] = useState(false);
  const items = queue.data ?? [];
  const visible = showAll ? items : items.slice(0, 8);
  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const noAmount = items.filter(item => !(item.amount > 0)).length;

  return (
    <Card className="p-5 bg-card border-card-border" data-testid="card-review-queue">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Por revisar
            <Badge variant={items.length ? 'default' : 'outline'} className="text-[11px]" data-testid="badge-queue-count">{items.length}</Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gastos capturados desde el celular o importados de Discord. No cuentan en el P&L hasta que se aprueban.
            {items.length ? ` Total capturado: ${formatCOP(total)}.` : ''}
            {noAmount ? ` ${noAmount} sin monto.` : ''}
          </p>
        </div>
        <Link href="/capturar">
          <Button size="sm" className="gap-1.5" data-testid="button-go-capture"><Camera className="h-4 w-4" /> Capturar gasto</Button>
        </Link>
      </div>

      {queue.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
      {!queue.isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-queue-empty">Nada pendiente. Todo está revisado.</p>
      ) : null}

      <ul className="divide-y divide-border">
        {visible.map(item => (
          <li key={item.id}>
            <button
              type="button"
              className="w-full text-left py-2.5 px-1 flex items-center gap-3 hover:bg-muted/40 rounded-md"
              onClick={() => setSelected(item)}
              data-testid={`row-queue-${item.id}`}
            >
              <div className="w-24 shrink-0 text-[11px] leading-tight text-muted-foreground tabular">{formatDate(item.date)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{item.description || item.rawText || 'Sin descripción'}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[item.source] ?? item.source}</Badge>
                  {item.brand ? <Badge variant="secondary" className="text-[10px]">{EXPENSE_BRAND_LABELS[item.brand]}</Badge> : <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/40">sin marca</Badge>}
                  {item.paidWith ? <span className="text-[11px] text-muted-foreground">{item.paidWith}</span> : null}
                  {item.paidBy ? <span className="text-[11px] text-muted-foreground">· {item.paidBy}</span> : null}
                  {item.attachments?.length ? <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Paperclip className="h-3 w-3" />{item.attachments.length}</span> : null}
                </div>
              </div>
              <div className={`shrink-0 text-sm tabular ${item.amount > 0 ? '' : 'text-amber-400'}`}>
                {item.amount > 0 ? formatCOP(item.amount) : 'Sin monto'}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 8 ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(v => !v)} data-testid="button-queue-toggle">
          {showAll ? 'Ver menos' : `Ver los ${items.length}`}
        </Button>
      ) : null}

      <ExpenseEditorDialog expense={selected} onClose={() => setSelected(null)} mode="review" />
    </Card>
  );
}
