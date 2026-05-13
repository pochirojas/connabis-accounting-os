import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, ChevronDown, ChevronRight, Database, Download, FileWarning, GitCompare, ListChecks, Pencil, Package2, RefreshCcw, ShieldCheck, Truck,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatCOP, formatDate, formatNumber, formatQty } from '@/lib/format';
import type {
  MaterialCost, MmBomRow, MmCostHistoryRow, MmMaterialRow, MmMirrorStatus,
  MmPurchaseOrder, MmPurchaseOrdersStatus,
} from '@shared/schema';
import { MaterialDetailView } from '@/components/material-detail';
import { ProductBomEditor } from '@/components/product-bom-editor';
import { CartCalculator } from '@/components/cart-calculator';

type ImportResponse = MmMirrorStatus & { warnings?: string[] };

async function postJson(url: string) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
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
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [bomEditorVariantId, setBomEditorVariantId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'bom' | 'purchase' | 'calculator' | 'admin'>('materials');
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});

  const status = useQuery<MmMirrorStatus>({ queryKey: ['/api/material-manager/status'] });
  const materials = useQuery<MmMaterialRow[]>({ queryKey: ['/api/material-manager/materials'] });
  const bom = useQuery<MmBomRow[]>({ queryKey: ['/api/material-manager/bom'] });
  const costHistory = useQuery<MmCostHistoryRow[]>({ queryKey: ['/api/material-manager/cost-history'] });

  // Legacy "Inventario & Compras" data — Purchase Orders + material lastCost reference list.
  const materialsLegacy = useQuery<MaterialCost[]>({ queryKey: ['/api/materials'] });
  // Real MM purchase orders — replaces seed data entirely.
  const purchaseOrders = useQuery<MmPurchaseOrder[]>({ queryKey: ['/api/material-manager/purchase-orders'] });
  const purchaseOrderStatus = useQuery<MmPurchaseOrdersStatus>({ queryKey: ['/api/material-manager/purchase-orders/status'] });
  const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);
  const selectedPoDetail = useQuery<MmPurchaseOrder>({
    queryKey: ['/api/material-manager/purchase-orders', selectedPoNumber],
    enabled: Boolean(selectedPoNumber),
    queryFn: async () => {
      const response = await fetch(`/api/material-manager/purchase-orders/${selectedPoNumber}`);
      if (!response.ok) throw new Error(`PO ${selectedPoNumber} → ${response.status}`);
      return response.json();
    },
  });
  const reimportPos = useMutation({
    mutationFn: () => postJson('/api/material-manager/purchase-orders/import'),
    onSuccess: () => {
      toast({ title: 'Órdenes de compra reimportadas', description: 'Datos recargados desde los CSV reales.' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/purchase-orders/status'] });
    },
    onError: (error) => toast({ title: 'No se pudieron reimportar las POs', description: String(error), variant: 'destructive' }),
  });

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
    onError: error => toast({ title: 'Falló import', description: String(error), variant: 'destructive' }),
  });

  const qaMutation = useMutation({
    mutationFn: () => postJson('/api/material-manager/qa'),
    onSuccess: () => {
      toast({ title: 'QA round-trip ejecutado' });
      queryClient.invalidateQueries({ queryKey: ['/api/material-manager/status'] });
    },
    onError: error => toast({ title: 'Falló QA', description: String(error), variant: 'destructive' }),
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

  // Group BOM rows by product, with variants underneath. Computes per-variant
  // estimated COGS using current MM material costs (when present) so the
  // collapsed product row can show a useful range.
  const materialCostById = useMemo(() => {
    const map = new Map<string, number>();
    (materials.data ?? []).forEach(m => map.set(m.id, Number(m.cost) || 0));
    return map;
  }, [materials.data]);

  type VariantGroup = {
    variantId: string;
    variantName: string;
    rows: MmBomRow[];
    componentCount: number;
    estimatedCogs: number; // sum(qty * material cost) when costs known
    missingCost: boolean;
  };
  type ProductGroup = {
    productName: string;
    variants: VariantGroup[];
    variantCount: number;
    totalComponents: number;
    cogsMin: number;
    cogsMax: number;
    cogsAvg: number;
    missingBomCount: number; // variants with 0 rows (always 0 here since MM only lists rows that exist)
  };

  const productGroups: ProductGroup[] = useMemo(() => {
    const productMap = new Map<string, Map<string, VariantGroup>>();
    filteredBom.forEach(row => {
      let variantMap = productMap.get(row.productName);
      if (!variantMap) {
        variantMap = new Map();
        productMap.set(row.productName, variantMap);
      }
      let vg = variantMap.get(row.variantId);
      if (!vg) {
        vg = {
          variantId: row.variantId,
          variantName: row.variantName,
          rows: [],
          componentCount: 0,
          estimatedCogs: 0,
          missingCost: false,
        };
        variantMap.set(row.variantId, vg);
      }
      vg.rows.push(row);
      vg.componentCount += 1;
      const cost = materialCostById.get(row.materialId) ?? 0;
      if (cost === 0) vg.missingCost = true;
      vg.estimatedCogs += row.quantity * cost;
    });

    return Array.from(productMap.entries())
      .map(([productName, variantMap]) => {
        const variants = Array.from(variantMap.values()).sort((a, b) => a.variantName.localeCompare(b.variantName));
        const cogsValues = variants.map(v => v.estimatedCogs);
        const cogsMin = cogsValues.length ? Math.min(...cogsValues) : 0;
        const cogsMax = cogsValues.length ? Math.max(...cogsValues) : 0;
        const cogsAvg = cogsValues.length ? cogsValues.reduce((s, n) => s + n, 0) / cogsValues.length : 0;
        return {
          productName,
          variants,
          variantCount: variants.length,
          totalComponents: variants.reduce((s, v) => s + v.componentCount, 0),
          cogsMin,
          cogsMax,
          cogsAvg,
          missingBomCount: variants.filter(v => v.componentCount === 0).length,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filteredBom, materialCostById]);

  // Variants for the BOM editor — derive from MM BOM rows (variant_id + product_name + variant_name).
  const variantsForEditor = useMemo(() => {
    if (!bomEditorVariantId) return [] as Array<{ id: string; name: string }>;
    const seen = new Map<string, { id: string; name: string }>();
    (bom.data ?? []).forEach(row => {
      if (!seen.has(row.variantId)) {
        seen.set(row.variantId, { id: row.variantId, name: `${row.productName || '—'} · ${row.variantName || row.variantId}` });
      }
    });
    if (!seen.has(bomEditorVariantId)) {
      seen.set(bomEditorVariantId, { id: bomEditorVariantId, name: bomEditorVariantId });
    }
    return Array.from(seen.values());
  }, [bom.data, bomEditorVariantId]);

  const editorProductName = useMemo(() => {
    if (!bomEditorVariantId) return undefined;
    const match = (bom.data ?? []).find(row => row.variantId === bomEditorVariantId);
    return match?.productName ?? undefined;
  }, [bom.data, bomEditorVariantId]);

  const s = status.data;
  const lastQa = s?.lastQa;
  const realPos = purchaseOrders.data ?? [];
  const selectedPO = selectedPoDetail.data ?? realPos.find(p => p.poNumber === selectedPoNumber) ?? null;

  // If a material is selected, render its detail page (full layout).
  if (selectedMaterialId) {
    return (
      <Layout
        title="Material"
        subtitle="Inventario & Materiales · detalle de material"
      >
        <MaterialDetailView
          materialId={selectedMaterialId}
          onBack={() => setSelectedMaterialId(null)}
          onOpenVariant={(variantId) => { setBomEditorVariantId(variantId); }}
          categoryOptions={Array.from(new Set((materials.data ?? []).map(m => m.category).filter(Boolean))).sort()}
        />
        <ProductBomEditor
          open={Boolean(bomEditorVariantId)}
          onClose={() => setBomEditorVariantId(null)}
          productName={editorProductName}
          variants={variantsForEditor}
          initialVariantId={bomEditorVariantId ?? undefined}
        />
      </Layout>
    );
  }

  return (
    <Layout
      title="Inventario & Materiales"
      subtitle="Phase 2.1 · módulo único · mirror Material Manager + órdenes de compra + drafts locales BOM (no sincronizado)"
    >
      <Card className="mb-6 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-mm-mirror">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-amber-200">Modo sombra (shadow mode)</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Mirror interno de Material Manager. <strong>Solo lectura</strong> hacia Shopify y hacia MM. El export usa los headers exactos de MM para permitir rollback de emergencia.
          Los drafts BOM que se editan aquí viven en una tabla aparte (<code>material_manager_bom_drafts</code>) — no contaminan el mirror y no se exportan en el CSV de rollback.
        </p>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Materiales importados" value={`${s?.materialsImported ?? 0}`} icon={Boxes} emphasis="gold" testId="kpi-mm-materials" />
        <KpiCard label="Filas BOM (MM)" value={`${s?.bomImported ?? 0}`} icon={Database} testId="kpi-mm-bom" />
        <KpiCard label="Variantes con BOM" value={`${s?.variantsWithBom ?? 0}`} icon={ListChecks} testId="kpi-mm-variants" />
        <KpiCard label="Drafts locales" value={`${s?.draftBomCount ?? 0}`} icon={Pencil} testId="kpi-mm-drafts" />
        <KpiCard label="Conflictos" value={`${s?.conflicts ?? 0}`} icon={FileWarning} testId="kpi-mm-conflicts" />
      </section>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="mt-6">
        <TabsList data-testid="tabs-inventory">
          <TabsTrigger value="materials" data-testid="tab-materials">Materiales</TabsTrigger>
          <TabsTrigger value="bom" data-testid="tab-bom">BOM / Productos</TabsTrigger>
          <TabsTrigger value="purchase" data-testid="tab-purchase">Órdenes de compra</TabsTrigger>
          <TabsTrigger value="calculator" data-testid="tab-calculator">Calculadora de Carts</TabsTrigger>
          <TabsTrigger value="admin" data-testid="tab-admin">Admin · QA · costos</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-4">
          <Card className="p-5" data-testid="card-mm-materials">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Materiales (MM mirror)</h3>
                <p className="text-xs text-muted-foreground">Click en una fila para abrir el detalle. Insumo = no inventario; Noid = cannabinoide.</p>
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
                    <TableRow
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedMaterialId(m.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelectedMaterialId(m.id); }}
                      className="cursor-pointer hover:bg-muted/40"
                      data-testid={`row-mm-material-${m.id}`}
                    >
                      <TableCell className="text-[13px] font-medium">{m.name}</TableCell>
                      <TableCell className="font-mono text-[11.5px]">{m.sku || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10.5px]">{m.category || '—'}</Badge></TableCell>
                      <TableCell className="text-[12px]">{m.supplier || <span className="text-muted-foreground">desconocido</span>}</TableCell>
                      <TableCell className="text-right tabular">{formatCOP(m.cost)}</TableCell>
                      <TableCell className="text-[11.5px] text-muted-foreground">{m.measurement || '—'}</TableCell>
                      <TableCell className="text-right tabular">{formatQty(m.stock)}</TableCell>
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
        </TabsContent>

        <TabsContent value="bom" className="mt-4">
          <Card className="p-5" data-testid="card-mm-bom">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">BOM por producto · variantes anidadas</h3>
                <p className="text-xs text-muted-foreground">
                  Agrupado por producto base. Cada fila muestra # variantes, componentes y COGS estimado (min/avg/max).
                  Expande para ver variantes; expande una variante para ver su BOM. El filtro aplica a producto/variante/material.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={bomFilter}
                  onChange={e => setBomFilter(e.target.value)}
                  placeholder="Filtrar BOM…"
                  className="max-w-xs"
                  data-testid="input-mm-bom-filter"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    productGroups.forEach(g => { next[g.productName] = true; });
                    setExpandedProducts(next);
                  }}
                  data-testid="button-expand-all-products"
                >
                  Expandir todo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setExpandedProducts({}); setExpandedVariants({}); }}
                  data-testid="button-collapse-all-products"
                >
                  Colapsar
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6"></TableHead>
                    <TableHead>Producto / Variante / Material</TableHead>
                    <TableHead className="text-right">Variantes</TableHead>
                    <TableHead className="text-right">Componentes</TableHead>
                    <TableHead className="text-right">COGS est. (min · avg · max)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productGroups.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">Sin filas BOM. Importa el mirror o ajusta el filtro.</TableCell></TableRow>
                  )}
                  {productGroups.slice(0, 200).map(group => {
                    const productOpen = !!expandedProducts[group.productName];
                    const hasMissing = group.variants.some(v => v.missingCost);
                    return (
                      <Fragment key={`product-frag-${group.productName}`}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40 bg-muted/15"
                          onClick={() => setExpandedProducts(prev => ({ ...prev, [group.productName]: !productOpen }))}
                          data-testid={`row-bom-product-${group.productName}`}
                        >
                          <TableCell>
                            {productOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="text-[12.5px] font-semibold">{group.productName || '—'}</TableCell>
                          <TableCell className="text-right tabular text-[12px]">{group.variantCount}</TableCell>
                          <TableCell className="text-right tabular text-[12px]">{group.totalComponents}</TableCell>
                          <TableCell className="text-right tabular text-[12px]">
                            {group.cogsAvg > 0 ? (
                              <span>
                                {formatCOP(group.cogsMin)} · <strong>{formatCOP(group.cogsAvg)}</strong> · {formatCOP(group.cogsMax)}
                                {hasMissing ? <span className="ml-1 text-amber-300">·*</span> : null}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {hasMissing && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">Costo MM parcial</Badge>}
                          </TableCell>
                        </TableRow>
                        {productOpen && group.variants.map(variant => {
                          const variantKey = `${group.productName}::${variant.variantId}`;
                          const variantOpen = !!expandedVariants[variantKey];
                          return (
                            <Fragment key={`variant-frag-${variantKey}`}>
                              <TableRow
                                className="cursor-pointer hover:bg-muted/30"
                                onClick={() => setExpandedVariants(prev => ({ ...prev, [variantKey]: !variantOpen }))}
                                data-testid={`row-bom-variant-${variant.variantId}`}
                              >
                                <TableCell className="pl-6">
                                  {variantOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </TableCell>
                                <TableCell className="text-[12px] pl-2">↳ {variant.variantName || variant.variantId}</TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-right tabular text-[11.5px]">{variant.componentCount}</TableCell>
                                <TableCell className="text-right tabular text-[11.5px]">
                                  {variant.estimatedCogs > 0 ? formatCOP(variant.estimatedCogs) : <span className="text-muted-foreground">—</span>}
                                  {variant.missingCost ? <span className="ml-1 text-amber-300">·*</span> : null}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => { e.stopPropagation(); setBomEditorVariantId(variant.variantId); }}
                                    data-testid={`button-bom-edit-${variant.variantId}`}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" /> Editar drafts
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {variantOpen && variant.rows.map(row => (
                                <TableRow key={`mat-${variantKey}-${row.materialId}`} className="bg-background/40" data-testid={`row-bom-material-${variant.variantId}-${row.materialId}`}>
                                  <TableCell></TableCell>
                                  <TableCell className="text-[12px] pl-10 text-muted-foreground">• {row.materialName}</TableCell>
                                  <TableCell></TableCell>
                                  <TableCell className="text-right tabular text-[11.5px]">{formatQty(row.quantity)}</TableCell>
                                  <TableCell className="text-right tabular text-[11.5px]">
                                    {(() => {
                                      const c = materialCostById.get(row.materialId) ?? 0;
                                      return c > 0 ? formatCOP(c * row.quantity) : <span className="text-amber-300">sin costo</span>;
                                    })()}
                                  </TableCell>
                                  <TableCell></TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {productGroups.length > 200 && (
              <p className="text-[11px] text-muted-foreground mt-2">Mostrando 200 de {productGroups.length} productos. Refina el filtro.</p>
            )}
            <p className="text-[10.5px] text-muted-foreground mt-2">
              * COGS estimado usa el último costo del mirror MM por material. Las variantes con materiales sin costo asignado se marcan con asterisco.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="purchase" className="mt-4 space-y-4">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Compras totales (POs reales)"
              value={formatCOP(purchaseOrderStatus.data?.totalAmount ?? 0)}
              icon={Package2}
              emphasis="emerald"
              testId="kpi-compras-total"
            />
            <KpiCard
              label="POs reales importadas"
              value={`${purchaseOrderStatus.data?.receivedPos ?? 0}`}
              icon={Truck}
              testId="kpi-pos-real"
            />
            <KpiCard
              label="POs canceladas"
              value={`${purchaseOrderStatus.data?.cancelledPos ?? 0}`}
              icon={FileWarning}
              testId="kpi-pos-canceladas"
            />
            <KpiCard
              label="Proveedores"
              value={`${purchaseOrderStatus.data?.suppliers ?? 0}`}
              icon={Boxes}
              emphasis="gold"
              testId="kpi-pos-proveedores"
            />
          </section>

          <Card className="p-5" data-testid="card-purchase-orders">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Órdenes de compra (Material Manager · datos reales)</h3>
                <p className="text-xs text-muted-foreground">
                  Importadas desde los CSVs de Material Manager en <code>/home/user/workspace/purchase_order_po*.csv</code>.
                  PO10 está cancelada (sin CSV) y se muestra para visibilidad, pero <strong>no</strong> suma a totales/stock.
                  Click en una fila para ver líneas y resumen.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">{realPos.length} órdenes</Badge>
                <Button size="sm" variant="outline" onClick={() => reimportPos.mutate()} disabled={reimportPos.isPending} data-testid="button-reimport-pos">
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  {reimportPos.isPending ? 'Reimportando…' : 'Reimportar CSV'}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {realPos.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">Sin órdenes importadas. Click "Reimportar CSV".</TableCell></TableRow>
                  ) : null}
                  {realPos.map(p => (
                    <TableRow
                      key={p.poNumber}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPoNumber(p.poNumber)}
                      className={`cursor-pointer transition-colors hover:bg-muted/35 ${selectedPoNumber === p.poNumber ? 'bg-accent/8' : ''} ${p.status === 'cancelled' ? 'opacity-60' : ''}`}
                      data-testid={`row-po-${p.poNumber}`}
                    >
                      <TableCell className="text-[13px] font-semibold tabular">{p.poNumber}</TableCell>
                      <TableCell className="text-sm tabular">{p.date ? formatDate(p.date) : '—'}</TableCell>
                      <TableCell className="text-[13px]">{p.supplier || (p.status === 'cancelled' ? <span className="text-muted-foreground italic">Cancelada</span> : '—')}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(p.lineCount)}</TableCell>
                      <TableCell className="text-right tabular font-semibold">{formatCOP(p.total)}</TableCell>
                      <TableCell>
                        {p.status === 'cancelled'
                          ? <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-300">Cancelada</Badge>
                          : <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">Recibida</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {selectedPO ? (
            <Card className="p-5" data-testid="card-po-detail">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">{selectedPO.poNumber} · {selectedPO.supplier || (selectedPO.status === 'cancelled' ? 'Cancelada' : '—')}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedPO.date ? `Fecha ${formatDate(selectedPO.date)} · ` : ''}
                    Moneda {selectedPO.currency}
                    {selectedPO.referenceNumber ? ` · Ref ${selectedPO.referenceNumber}` : ''}
                  </p>
                  {selectedPO.notes ? <p className="text-[11px] text-amber-300 mt-1">{selectedPO.notes}</p> : null}
                </div>
                <Badge variant="outline" className="text-[11px]">{(selectedPO.lines ?? []).length} líneas</Badge>
              </div>
              {selectedPO.status === 'cancelled' ? (
                <p className="text-[11.5px] text-muted-foreground">
                  Esta orden está marcada como cancelada y no aporta al total de compras ni al inventario.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Costo unit.</TableHead>
                        <TableHead className="text-right">Total COP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedPO.lines ?? []).map((line) => (
                        <TableRow key={line.id} data-testid={`row-po-line-${selectedPO.poNumber}-${line.lineIndex}`}>
                          <TableCell className="text-[13px] font-medium">{line.product}</TableCell>
                          <TableCell className="text-[11.5px] font-mono text-muted-foreground">{line.sku || '—'}</TableCell>
                          <TableCell className="text-right tabular">{formatQty(line.quantity)}</TableCell>
                          <TableCell className="text-right tabular">{formatCOP(line.unitCost)}</TableCell>
                          <TableCell className="text-right tabular font-semibold">{formatCOP(line.totalCop)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 ml-auto max-w-xs text-[12.5px]">
                    <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{formatCOP(selectedPO.subtotal)}</span></div>
                    <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Impuestos</span><span className="tabular">{formatCOP(selectedPO.taxes)}</span></div>
                    <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Envío</span><span className="tabular">{formatCOP(selectedPO.shipping)}</span></div>
                    <div className="flex justify-between py-0.5 border-t border-card-border pt-1 mt-1 font-semibold"><span>Total</span><span className="tabular">{formatCOP(selectedPO.total)}</span></div>
                  </div>
                </>
              )}
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="calculator" className="mt-4">
          <CartCalculator />
        </TabsContent>

        <TabsContent value="admin" className="mt-4 space-y-4">
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5" data-testid="card-mm-actions">
              <h3 className="text-sm font-semibold tracking-tight">Acciones del mirror</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Reconstruye el mirror desde <code>material-manager-export.csv</code>, <code>material-manager-export-material-product.csv</code> y el historial de costos del Excel.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending} data-testid="button-mm-import">
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  {importMutation.isPending ? 'Reconstruyendo…' : 'Import / Rebuild Mirror'}
                </Button>
                <Button variant="outline" onClick={() => downloadCsv('/api/material-manager/export/materials.csv', 'material-manager-export.csv')} data-testid="button-mm-export-materials">
                  <Download className="h-4 w-4 mr-2" /> Export Materials CSV (rollback exact)
                </Button>
                <Button variant="outline" onClick={() => downloadCsv('/api/material-manager/export/bom.csv', 'material-manager-export-material-product.csv')} data-testid="button-mm-export-bom">
                  <Download className="h-4 w-4 mr-2" /> Export BOM CSV (rollback exact)
                </Button>
                <Button variant="secondary" onClick={() => qaMutation.mutate()} disabled={qaMutation.isPending} data-testid="button-mm-qa">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {qaMutation.isPending ? 'Validando…' : 'Run QA round-trip'}
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground mt-3 leading-relaxed">
                El export CSV mantiene únicamente las filas MM importadas. Los drafts locales (<code>material_manager_bom_drafts</code>) no se incluyen para preservar el rollback bit-exact. Esto se cambiará en Phase 2.2 cuando habilitemos <em>Export drafts preview</em>.
              </p>
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
                  {s.lastRun.notes ? <div className="text-[11px] text-muted-foreground mt-2">{s.lastRun.notes}</div> : null}
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
                </div>
              ) : null}
            </Card>
          </section>

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
        </TabsContent>
      </Tabs>

      <ProductBomEditor
        open={Boolean(bomEditorVariantId)}
        onClose={() => setBomEditorVariantId(null)}
        productName={editorProductName}
        variants={variantsForEditor}
        initialVariantId={bomEditorVariantId ?? undefined}
      />
    </Layout>
  );
}
