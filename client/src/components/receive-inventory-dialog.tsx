import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatQty } from '@/lib/format';
import type { MmPurchaseOrder } from '@shared/schema';
import { Check, X, AlertCircle } from 'lucide-react';

type ReceivedProgress = { lineId: number; received: number; ordered: number };

// MM-parity "Receive items" dialog. Per-line Accept / Reject inputs, plus
// "Accept all unreceived" / "Reject all unreceived" buttons. Sends to the
// partial-receive endpoint that records inventory movements per accept and a
// negative-tagged movement per reject (for adjustment history).
export function ReceiveInventoryDialog({
  poNumber,
  open,
  onOpenChange,
}: {
  poNumber: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const poDetail = useQuery<MmPurchaseOrder>({
    queryKey: ['/api/material-manager/purchase-orders', poNumber],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/material-manager/purchase-orders/${poNumber}`);
      return response.json();
    },
    enabled: open && Boolean(poNumber),
  });
  const progress = useQuery<ReceivedProgress[]>({
    queryKey: ['/api/material-manager/purchase-orders', poNumber, 'progress'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/material-manager/purchase-orders/${poNumber}/progress`);
      return response.json();
    },
    enabled: open && Boolean(poNumber),
  });

  const progressByLine = useMemo(() => new Map((progress.data ?? []).map(p => [p.lineId, p])), [progress.data]);
  const lines = poDetail.data?.lines ?? [];

  const [accept, setAccept] = useState<Record<number, string>>({});
  const [reject, setReject] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) { setAccept({}); setReject({}); }
  }, [open, poNumber]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        lines: lines.map(l => ({
          lineId: l.id,
          accept: Number(accept[l.id] ?? 0) || 0,
          reject: Number(reject[l.id] ?? 0) || 0,
        })).filter(l => l.accept > 0 || l.reject > 0),
      };
      const response = await apiRequest('POST', `/api/material-manager/purchase-orders/${poNumber}/receive-partial`, payload);
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: `Recibido ${result.poNumber}`,
        description: `Aceptado: ${result.acceptCreated} líneas · Rechazado: ${result.rejectCreated} · Sin material: ${result.unmatchedLines}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/cost-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials/analytics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials/header-kpis'] });
      onOpenChange(false);
    },
    onError: (error) => toast({ title: 'Falló el recibo', description: String(error), variant: 'destructive' }),
  });

  const acceptAllUnreceived = () => {
    const next: Record<number, string> = {};
    lines.forEach(l => {
      const p = progressByLine.get(l.id);
      const remaining = Math.max(0, l.quantity - (p?.received ?? 0));
      if (remaining > 0) next[l.id] = String(remaining);
    });
    setAccept(next);
    setReject({});
  };
  const rejectAllUnreceived = () => {
    const next: Record<number, string> = {};
    lines.forEach(l => {
      const p = progressByLine.get(l.id);
      const remaining = Math.max(0, l.quantity - (p?.received ?? 0));
      if (remaining > 0) next[l.id] = String(remaining);
    });
    setReject(next);
    setAccept({});
  };

  const totalReceived = (progress.data ?? []).reduce((s, p) => s + p.received, 0);
  const totalOrdered = (progress.data ?? []).reduce((s, p) => s + p.ordered, 0);
  const hasAnyInput = lines.some(l => Number(accept[l.id] ?? 0) > 0 || Number(reject[l.id] ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Receive items · {poNumber}</DialogTitle>
          <DialogDescription>
            Acepta o rechaza cantidades por línea. "Aceptar todo" rellena con lo restante por línea. Los rechazos se
            registran en el historial de ajustes como movimiento negativo etiquetado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[12.5px] text-muted-foreground">
            Total recibido: <strong className="text-foreground tabular">{formatQty(totalReceived)}</strong>
            <span className="mx-1">·</span> Ordenado: <strong className="text-foreground tabular">{formatQty(totalOrdered)}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={acceptAllUnreceived} data-testid="button-accept-all-unreceived">
              <Check className="h-3.5 w-3.5 mr-1.5" /> Aceptar todo lo no recibido
            </Button>
            <Button size="sm" variant="outline" onClick={rejectAllUnreceived} data-testid="button-reject-all-unreceived">
              <X className="h-3.5 w-3.5 mr-1.5" /> Rechazar todo lo no recibido
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[55vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Accept</TableHead>
                <TableHead className="text-right">Reject</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">Cargando líneas…</TableCell></TableRow>
              ) : null}
              {lines.map(l => {
                const p = progressByLine.get(l.id);
                const received = p?.received ?? 0;
                const remaining = Math.max(0, l.quantity - received);
                return (
                  <TableRow key={l.id} data-testid={`row-receive-line-${l.id}`}>
                    <TableCell className="text-[13px] font-medium">
                      <div>{l.product}</div>
                      {!l.materialId ? (
                        <div className="text-[10.5px] text-amber-300 inline-flex items-center gap-1">
                          <AlertCircle className="h-2.5 w-2.5" />unmatched · no actualizará stock
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-[11.5px] font-mono text-muted-foreground">{l.sku || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={accept[l.id] ?? ''}
                          onChange={(e) => setAccept(prev => ({ ...prev, [l.id]: e.target.value }))}
                          className="h-8 w-[90px] text-right tabular"
                          placeholder="0"
                          data-testid={`input-accept-${l.id}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAccept(prev => ({ ...prev, [l.id]: String(remaining) }))}
                          data-testid={`button-accept-all-${l.id}`}
                        >Todo</Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={reject[l.id] ?? ''}
                          onChange={(e) => setReject(prev => ({ ...prev, [l.id]: e.target.value }))}
                          className="h-8 w-[90px] text-right tabular"
                          placeholder="0"
                          data-testid={`input-reject-${l.id}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReject(prev => ({ ...prev, [l.id]: String(remaining) }))}
                          data-testid={`button-reject-all-${l.id}`}
                        >Todo</Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-[110px] h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className={`h-full ${received >= l.quantity ? 'bg-emerald-500/70' : 'bg-emerald-500/50'}`}
                            style={{ width: `${Math.min(100, (received / Math.max(1, l.quantity)) * 100)}%` }}
                          />
                        </div>
                        <Badge variant="outline" className="text-[10px] tabular">{formatQty(received)} de {formatQty(l.quantity)}</Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => submit.mutate()} disabled={!hasAnyInput || submit.isPending} data-testid="button-submit-receive">
            {submit.isPending ? 'Guardando…' : 'Confirmar recibo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
