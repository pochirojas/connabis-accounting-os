import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, Database, Download, FileWarning, GitCompare, ListChecks, RefreshCcw, ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatCOP, formatDate, formatNumber } from '@/lib/format';
import type { MmBomRow, MmCostHistoryRow, MmMaterialRow, MmMirrorStatus } from '@shared/schema';

type ImportResponse = MmMirrorStatus & { warnings?: string[] };

async function postJson(url: string) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`${url} → ${response.status}`);
  }
  return response.json();
}

function downloadCsv(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function MaterialManagerPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [materialFilter, setMaterialFilter] = useState('');
  const [bomFilter, setBomFilter] = useState('');

  const status = useQuery<MmMirrorStatus>({ queryKey: ['/api/material-manager/status'] });
  const materials = useQuery<MmMaterialRow[]>({ queryKey: ['/api/material-manager/materials'] });
  const bom = useQuery<MmBomRow[]>({ queryKey: ['/api/material-manager/bom'] });
  const costHistory = useQuery<MmCostHistoryRow[]>({ queryKey: ['/api/material-manager/cost-history'] });

  const importMutation = useMutation({
    mutationFn: () => postJson('/api/material-manager/import') as Promise<ImportResponse>,
    onSuccess: data => {
      toast({
        title: 'Mirror reconstruido',
        description: `${data.materialsImported} materiales · ${data.bomImported} BOM · ${data.costHistoryRows} costos`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/materials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/bom'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/cost-history'] });
    },
    onError: error => {
      toast({ title: 'Falló import', description: String(error), variant: 'destructive' });
    },
  });

  const qaMutation = useMutation({
    mutationFn: () => postJson('/api/material-manager/qa'),
    onSuccess: () => {
      toast({ title: 'QA round-trip ejecutado' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
    },
    onError: error => {
      toast({ title: 'Falló QA', description: String(error), variant: 'destructive' });
    },
  });

  const filteredMaterials = useMemo(() => {
    const term = materialFilter.trim().toLowerCase();
    if (!term) return materials.data ?? [];
    return (materials.data ?? []).filter(m =>
      m.name.toLowerCase().includes(term) ||
      m.category.toLowerCase().includes(term) ||
      m.sku.toLowerCase().includes(term),
    );
  }, [materials.data, materialFilter]);

  const filteredBom = useMemo(() => {
    const term = bomFilter.trim().toLowerCase();
    if (!term) return bom.data ?? [];
    return (bom.data ?? []).filter(row =>
      row.materialName.toLowerCase().includes(term) ||
      row.productName.toLowerCase().includes(term) ||
      row.variantName.toLowerCase().includes(term) ||
      row.variantId.includes(term),
    );
  }, [bom.data, bomFilter]);

  const s = status.data;
  const lastQa = s?.lastQa;

  return (
    <Layout
      title="Material Manager Mirror"
      subtitle="Phase 2.1 · Inventory OS · solo lectura, sin escrituras a Shopify"
    >
      <Card className="mb-6 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-mm-mirror">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-amber-200">Modo sombra (shadow mode)</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Phase 2.1: espejo interno de Material Manager. Solo lectura. <strong>No escribe</strong> en Shopify ni en inventario.
          El export usa los headers exactos de MM para permitir rollback de emergencia.
          La app eventualmente correrá como Shopify embedded app; antes haremos pruebas en otra tienda.
        </p>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Materiales importados" value={`${s?.materialsImported ?? 0}`} icon={Boxes} emphasis="gold" testId="kpi-mm-materials" />
        <KpiCard label="Filas BOM" value={`${s?.bomImported ?? 0}`} icon={Database} testId="kpi-mm-bom" />
        <KpiCard label="Variantes con BOM" value={`${s?.variantsWithBom ?? 0}`} icon={ListChecks} testId="kpi-mm-variants" />
        <KpiCard label="Historial de costos" value={`${s?.costHistoryRows ?? 0}`} icon={GitCompare} testId="kpi-mm-cost-history" />
        <KpiCard label="Conflictos" value={`${s?.conflicts ?? 0}`} icon={FileWarning} testId="kpi-mm-conflicts" />
      </section>

      <section className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5" data-testid="card-mm-actions">
          <h3 className="text-sm font-semibold tracking-tight">Acciones</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Reconstruye el mirror desde los CSV de MM (<code>material-manager-export.csv</code>, <code>material-manager-export-material-product.csv</code>) y el historial de costos del Excel.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              data-testid="button-mm-import"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              {importMutation.isPending ? 'Reconstruyendo…' : 'Import / Rebuild Mirror'}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv('/api/material-manager/export/materials.csv', 'material-manager-export.csv')}
              data-testid="button-mm-export-materials"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Materials CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCsv('/api/material-manager/export/bom.csv', 'material-manager-export-material-product.csv')}
              data-testid="button-mm-export-bom"
            >
              <Download className="h-4 w-4 mr-2" />
              Export BOM CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => qaMutation.mutate()}
              disabled={qaMutation.isPending}
              data-testid="button-mm-qa"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {qaMutation.isPending ? 'Validando…' : 'Run QA round-trip'}
            </Button>
          </div>
        </Card>

        <Card className="p-5" data-testid="card-mm-status">
          <h3 className="text-sm font-semibold tracking-tight">Estado última corrida</h3>
          {s?.lastRun ? (
            <dl className="mt-3 text-[13px] space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted-foreground">Estado</dt><dd><Badge variant={s.lastRun.status === 'success' ? 'outline' : 'destructive'}>{s.lastRun.status}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Iniciado</dt><dd className="tabular">{formatDate(s.lastRun.startedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Materiales</dt><dd className="tabular">{formatNumber(s.lastRun.materialsImported)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">BOM</dt><dd className="tabular">{formatNumber(s.lastRun.bomImported)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Cost history</dt><dd className="tabular">{formatNumber(s.lastRun.costHistoryImported)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Conflictos</dt><dd className="tabular">{s.lastRun.conflicts}</dd></div>
              {s.lastRun.notes ? (
                <div className="text-[11px] text-muted-foreground mt-2">{s.lastRun.notes}</div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No hay corridas registradas. Ejecuta "Import / Rebuild Mirror" para empezar.</p>
          )}
          {lastQa ? (
            <div className="mt-4 pt-3 border-t border-card-border">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Round-trip QA</span>
                <Badge variant={lastQa.status === 'pass' ? 'outline' : 'destructive'}>{lastQa.status.toUpperCase()}</Badge>
              </div>
              <ul className="text-[11.5px] text-muted-foreground mt-2 space-y-0.5">
                <li>Headers exactos: <strong>{lastQa.headersMatch ? 'sí' : 'no'}</strong></li>
                <li>Materiales: {lastQa.materialsRowCount.imported} ↔ {lastQa.materialsRowCount.exported}</li>
                <li>BOM: {lastQa.bomRowCount.imported} ↔ {lastQa.bomRowCount.exported}</li>
                <li>IDs materiales: {lastQa.materialIdsMatch ? '✓' : '✗'} · Pares variant-material: {lastQa.variantIdsMatch ? '✓' : '✗'}</li>
                <li>Cantidades BOM: {lastQa.bomQuantitiesMatch ? '✓' : '✗'} · Stock: {lastQa.stockMatch ? '✓' : '✗'}</li>
              </ul>
              {lastQa.mismatches.length ? (
                <ul className="text-[11px] text-red-300 mt-2 list-disc pl-5 space-y-0.5">
                  {lastQa.mismatches.slice(0, 5).map(m => <li key={m}>{m}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5" data-testid="card-mm-materials">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Materiales (MM mirror)</h3>
              <p className="text-xs text-muted-foreground">Categoría, costo, stock y banderas Phase 2 (Insumo = no inventario; Noid = cannabinoide).</p>
            </div>
            <Input
              value={materialFilter}
              onChange={e => setMaterialFilter(e.target.value)}
              placeholder="Filtrar materiales…"
              className="max-w-xs"
              data-testid="input-mm-material-filter"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead>Medida</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Banderas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.slice(0, 250).map(m => (
                  <TableRow key={m.id} data-testid={`row-mm-material-${m.id}`}>
                    <TableCell className="text-[13px] font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-[11.5px]">{m.sku || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10.5px]">{m.category || '—'}</Badge></TableCell>
                    <TableCell className="text-[12px]">{m.supplier || <span className="text-muted-foreground">desconocido</span>}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(m.cost)}</TableCell>
                    <TableCell className="text-[11.5px] text-muted-foreground">{m.measurement || '—'}</TableCell>
                    <TableCell className="text-right tabular">{formatNumber(m.stock)}</TableCell>
                    <TableCell className="space-x-1">
                      {m.isInsumo && <Badge variant="outline" className="text-[10px]">Insumo</Badge>}
                      {m.isNoid && <Badge variant="outline" className="text-[10px]">Noid</Badge>}
                      {m.updateShopifyInventory && <Badge variant="outline" className="text-[10px]">Sync Shopify</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredMaterials.length > 250 && (
            <p className="text-[11px] text-muted-foreground mt-2">Mostrando 250 de {filteredMaterials.length}. Refina el filtro.</p>
          )}
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <Card className="p-5" data-testid="card-mm-bom">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">BOM components</h3>
              <p className="text-xs text-muted-foreground">Materiales por variante de Shopify, exactamente como están en MM.</p>
            </div>
            <Input
              value={bomFilter}
              onChange={e => setBomFilter(e.target.value)}
              placeholder="Filtrar BOM…"
              className="max-w-xs"
              data-testid="input-mm-bom-filter"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBom.slice(0, 300).map(row => (
                  <TableRow key={`${row.materialId}-${row.variantId}`} data-testid={`row-mm-bom-${row.materialId}-${row.variantId}`}>
                    <TableCell className="text-[12.5px]">{row.productName}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{row.variantName}</TableCell>
                    <TableCell className="text-[12.5px]">{row.materialName}</TableCell>
                    <TableCell className="text-right tabular">{formatNumber(row.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredBom.length > 300 && (
            <p className="text-[11px] text-muted-foreground mt-2">Mostrando 300 de {filteredBom.length}. Refina el filtro.</p>
          )}
        </Card>

        <Card className="p-5" data-testid="card-mm-cost-history">
          <h3 className="text-sm font-semibold tracking-tight">Historial de costos (Excel)</h3>
          <p className="text-xs text-muted-foreground">Últimas {Math.min(costHistory.data?.length ?? 0, 150)} entradas de las hojas Noids/Materials/Supplements/Insumos.</p>
          <div className="overflow-x-auto mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Hoja</TableHead>
                  <TableHead className="text-right">Costo/u</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(costHistory.data ?? []).slice(0, 150).map(row => (
                  <TableRow key={row.id} data-testid={`row-mm-cost-${row.id}`}>
                    <TableCell className="text-[12px] tabular">{row.date}</TableCell>
                    <TableCell className="text-[12.5px]">{row.material}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{row.sourceSheet}</Badge></TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.unitCostCop)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>
    </Layout>
  );
}
