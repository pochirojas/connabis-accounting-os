import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileJson, Upload } from 'lucide-react';
import type { DiscordImportResult } from '@shared/schema';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatCOP } from '@/lib/format';
import { invalidateExpenseQueries } from './expense-editor-dialog';

const CONFIDENCE_CLASS: Record<string, string> = {
  alta: 'text-emerald-400 border-emerald-400/40',
  media: 'text-amber-400 border-amber-400/40',
  baja: 'text-destructive border-destructive/40',
};

export function DiscordImportPanel() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<DiscordImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (dryRun: boolean) =>
      (await apiRequest('POST', `/api/expenses/import/discord${dryRun ? '?dryRun=1' : ''}`, payload)).json() as Promise<DiscordImportResult>,
    onSuccess: result => {
      setError(null);
      if (result.dryRun) {
        setPreview(result);
      } else {
        setPreview(null);
        setPayload(null);
        setFileName('');
        invalidateExpenseQueries();
        toast({ title: `${result.imported} mensajes importados a "Por revisar"`, description: result.skippedDuplicates ? `${result.skippedDuplicates} ya estaban importados.` : undefined });
      }
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, '')),
  });

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    try {
      const json = JSON.parse(await file.text());
      setPayload(json);
      setFileName(file.name);
    } catch {
      setError('El archivo no es un JSON válido. Exporta con formato "JSON" en DiscordChatExporter.');
    }
  }

  const fresh = preview?.candidates.filter(c => !c.duplicate) ?? [];

  return (
    <Card className="p-5 bg-card border-card-border" data-testid="card-discord-import">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2"><FileJson className="h-4 w-4" /> Importar chat de Discord</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sube el export JSON de DiscordChatExporter. Cada mensaje llega a "Por revisar" con el monto detectado; nada entra al P&L sin aprobación. Re-importar el mismo archivo no duplica.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()} data-testid="button-discord-pick">
            <Upload className="h-4 w-4" /> {fileName ? 'Cambiar archivo' : 'Elegir JSON'}
          </Button>
          <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          {payload && !preview ? (
            <Button size="sm" onClick={() => run.mutate(true)} disabled={run.isPending} data-testid="button-discord-preview">
              {run.isPending ? 'Analizando…' : 'Previsualizar'}
            </Button>
          ) : null}
        </div>
      </div>
      {fileName ? <p className="text-xs text-muted-foreground mb-2">Archivo: {fileName}</p> : null}
      {error ? <p className="text-sm text-destructive" data-testid="text-discord-error">{error}</p> : null}

      {preview ? (
        <div className="space-y-3" data-testid="discord-preview">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{preview.channel}</Badge>
            <Badge variant="outline">{preview.totalMessages} mensajes</Badge>
            <Badge variant="outline">{fresh.length} nuevos</Badge>
            <Badge variant="outline">{preview.skippedDuplicates} ya importados</Badge>
            <Badge variant="outline">{preview.skippedNoContent} ignorados (vacíos/bots)</Badge>
            <Badge variant="outline">{fresh.filter(c => c.amount === null).length} sin monto</Badge>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-muted-foreground">
                  <th className="p-2">Fecha</th><th className="p-2">Autor</th><th className="p-2">Mensaje</th>
                  <th className="p-2 text-right">Monto</th><th className="p-2">Confianza</th>
                </tr>
              </thead>
              <tbody>
                {fresh.slice(0, 200).map(c => (
                  <tr key={c.sourceRef} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap tabular">{c.date}</td>
                    <td className="p-2 whitespace-nowrap">{c.author}</td>
                    <td className="p-2 max-w-[340px]"><div className="line-clamp-2">{c.rawText || `(${c.attachmentUrls.length} adjunto/s)`}</div></td>
                    <td className="p-2 text-right tabular whitespace-nowrap">{c.amount === null ? '—' : c.currency === 'USD' ? `USD ${c.amount}` : formatCOP(c.amount)}</td>
                    <td className="p-2"><Badge variant="outline" className={`text-[10px] ${CONFIDENCE_CLASS[c.confidence]}`}>{c.confidence}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fresh.length > 200 ? <p className="text-[11px] text-muted-foreground">Mostrando 200 de {fresh.length}.</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => run.mutate(false)} disabled={run.isPending || fresh.length === 0} data-testid="button-discord-import">
              {run.isPending ? 'Importando…' : `Importar ${fresh.length} a "Por revisar"`}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
