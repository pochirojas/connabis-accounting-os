import { Card } from '@/components/ui/card';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: { value: number; label?: string } | null;
  icon?: LucideIcon;
  emphasis?: 'emerald' | 'gold' | 'plain';
  testId?: string;
};

export function KpiCard({ label, value, hint, delta, icon: Icon, emphasis = 'plain', testId }: Props) {
  const positive = delta && delta.value > 0;
  const negative = delta && delta.value < 0;
  return (
    <Card
      className={cn(
        'relative p-5 border-card-border bg-card overflow-hidden',
        emphasis === 'emerald' && 'glow-emerald',
        emphasis === 'gold' && 'glow-gold',
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{label}</div>
        {Icon && (
          <span className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md',
            emphasis === 'emerald' && 'bg-primary/15 text-primary',
            emphasis === 'gold' && 'bg-accent/15 text-accent',
            emphasis === 'plain' && 'bg-muted text-muted-foreground'
          )}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 text-[26px] font-semibold tracking-tight tabular leading-none" data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && (
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-medium tabular',
            positive && 'text-emerald-300 bg-emerald-500/10',
            negative && 'text-rose-300 bg-rose-500/10',
            !positive && !negative && 'text-muted-foreground bg-muted/40'
          )}>
            {positive && <ArrowUp className="h-3 w-3" />}
            {negative && <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta.value).toFixed(1)}%
            {delta.label && <span className="text-muted-foreground font-normal ml-1">{delta.label}</span>}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}
