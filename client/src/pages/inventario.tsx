import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { MaterialCost, PurchaseOrder } from '@shared/schema';
import { formatCOP, formatDate, formatNumber } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Boxes, Truck, Package2, FileBarChart } from 'lucide-react';

export default function Inventario() {
  const materials = useQuery<MaterialCost[]>({ queryKey: ['/api/materials'] });
  const pos = useQuery<PurchaseOrder[]>({ queryKey: ['/api/purchase-orders'] });

  const totalSpend = (pos.data ?? []).reduce((s, p) => s + p.landedCost, 0);
  const inTransit = (pos.data ?? []).filter(p => p.status === 'en_transito').length;
  const pending = (pos.data ?? []).filter(p => p.status === 'pendiente').length;

  return (
    <Layout title="Inventario & Compras" subtitle="Phase 2: copiar exactamente Material Manager y eventualmente reemplazarlo">
      <Card className="mb-6 p-4 border-amber-500/30 bg-amber-500/8" data-testid="banner-mm-phase2">
        <h2 className="text-sm font-semibold text-amber-200">Material Manager será Phase 2</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Esta página todavía es una representación simplificada. Para reemplazar MM bien, primero copiaremos exactamente sus vistas, campos, estados, cálculos de costo, órdenes de compra, materiales y flujos de producción. Luego migraremos datos y apagaremos duplicados.
        </p>
      </Card>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Compras período" value={formatCOP(totalSpend)} icon={FileBarChart} emphasis="emerald" testId="kpi-compras-total" />
        <KpiCard label="POs en tránsito" value={`${inTransit}`} icon={Truck} testId="kpi-pos-transito" />
        <KpiCard label="POs pendientes" value={`${pending}`} icon={Package2} testId="kpi-pos-pendientes" />
        <KpiCard label="SKUs materiales" value={`${materials.data?.length ?? 0}`} icon={Boxes} emphasis="gold" testId="kpi-skus-materiales" />
      </section>

      <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-card-border" data-testid="card-materials">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Costo de materiales</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Último costo registrado · Noids Costo Dash</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Hardware + distillates</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Último costo</TableHead>
                <TableHead>Unidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(materials.data ?? []).map(m => (
                <TableRow key={m.id} data-testid={`row-material-${m.id}`}>
                  <TableCell className="font-medium text-[13px]">{m.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10.5px] capitalize">{m.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular" data-testid={`text-material-cost-${m.id}`}>
                    {formatCOP(m.lastCost)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">/ {m.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-cost-insights">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Insights de costo</h2>
          </div>
          <ul className="space-y-3 text-[13px] leading-relaxed">
            <li className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium">Hardware desechable es el costo más alto</div>
              <p className="text-xs text-muted-foreground mt-1">
                El desechable cerámico 4mL cuesta ~23.273 COP por unidad, ~3.9× más que un cartucho 1mL (5.968 COP).
                Concentrar volumen en cartuchos reutilizables mejora margen.
              </p>
            </li>
            <li className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium">THCO ~1.4× costo HHC, D8 más económico</div>
              <p className="text-xs text-muted-foreground mt-1">
                Distilados: D8 1.617 / HHC 2.224 / THCO 3.097 COP/g. Mix de cannabinoides incide directo en GM por SKU.
              </p>
            </li>
            <li className="rounded-md border border-card-border bg-muted/30 p-3">
              <div className="font-medium">Cargar costos en Shopify</div>
              <p className="text-xs text-muted-foreground mt-1">
                Mover últimos costos a Shopify <span className="font-mono text-accent">variant.cost</span> para que los márgenes se calculen contra una sola fuente de verdad.
              </p>
            </li>
          </ul>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-purchase-orders">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Órdenes de compra</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Proveedor, costo unitario, impuestos, envío y costo aterrizado</p>
            </div>
            <Badge variant="outline" className="text-[11px]">{pos.data?.length ?? 0} órdenes</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Envío</TableHead>
                <TableHead className="text-right">Impuesto</TableHead>
                <TableHead className="text-right">Costo aterrizado</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pos.data ?? []).map(p => (
                <TableRow key={p.id} data-testid={`row-po-${p.id}`}>
                  <TableCell className="text-sm tabular">{formatDate(p.date)}</TableCell>
                  <TableCell className="text-[13px] font-medium">{p.supplier}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10.5px]">{p.category}</Badge></TableCell>
                  <TableCell className="text-right tabular">{formatNumber(p.qty)}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(p.unitCost)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.shipping)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{formatCOP(p.tax)}</TableCell>
                  <TableCell className="text-right tabular font-semibold" data-testid={`text-po-landed-${p.id}`}>{formatCOP(p.landedCost)}</TableCell>
                  <TableCell>
                    {p.status === 'recibido' && <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">Recibido</Badge>}
                    {p.status === 'en_transito' && <Badge className="text-[10px] bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/15">En tránsito</Badge>}
                    {p.status === 'pendiente' && <Badge variant="outline" className="text-[10px]">Pendiente</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </Layout>
  );
}
