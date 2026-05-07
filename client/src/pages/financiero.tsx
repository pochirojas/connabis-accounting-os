import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import type {
  CashFlowSnapshot, CloseChecklistItem, InventoryAccountingRow, PnlRow,
} from '@shared/schema';
import { formatCOP, formatCOPCompact, formatPct } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { Banknote, Boxes, CheckCircle2, ClipboardCheck, ReceiptText, TrendingUp } from 'lucide-react';

const STATUS_CLASS = {
  ok: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  watch: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  risk: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
};

export default function Financiero() {
  const pnl = useQuery<PnlRow[]>({ queryKey: ['/api/pnl'] });
  const cash = useQuery<CashFlowSnapshot[]>({ queryKey: ['/api/cash-flow'] });
  const inventoryAccounting = useQuery<InventoryAccountingRow[]>({ queryKey: ['/api/inventory-accounting'] });
  const checklist = useQuery<CloseChecklistItem[]>({ queryKey: ['/api/close-checklist'] });

  const latest = pnl.data?.[pnl.data.length - 1];
  const april = pnl.data?.find(row => row.month === '2026-04');
  const totalInventoryCapitalized = (inventoryAccounting.data ?? []).reduce((sum, row) => sum + row.capitalizedToInventory, 0);
  const totalCogsRecognized = (inventoryAccounting.data ?? []).reduce((sum, row) => sum + row.cogsRecognized, 0);
  const openChecklist = (checklist.data ?? []).filter(item => item.status !== 'listo').length;

  return (
    <Layout
      title="Control financiero"
      subtitle="P&L real, caja, inventario capitalizado, COGS y cierre mensual"
    >
      <Card className="mb-6 p-4 border-emerald-500/30 bg-emerald-500/8" data-testid="banner-finance-control">
        <h2 className="text-sm font-semibold text-emerald-200">Objetivo CEO/contador</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Esta página convierte la app en control operativo: ventas no bastan. La meta es saber utilidad real,
          caja disponible, qué compras son inventario, qué costo ya se vendió y qué falta para cerrar el mes.
        </p>
      </Card>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Caja operativa" value={formatCOP(cash.data?.[0]?.amount ?? 0)} icon={Banknote} emphasis="gold" testId="kpi-fin-cash" />
        <KpiCard label="Utilidad contable abril" value={april ? formatCOP(april.netIncomeAccounting) : '—'} icon={TrendingUp} emphasis="emerald" testId="kpi-fin-april-profit" hint="Después de capitalizar inventario" />
        <KpiCard label="Inventario capitalizado" value={formatCOP(totalInventoryCapitalized)} icon={Boxes} testId="kpi-fin-capitalized" />
        <KpiCard label="Checklist abierto" value={`${openChecklist}`} icon={ClipboardCheck} testId="kpi-fin-checklist" hint="Items no listos" />
      </section>

      <section className="mt-6 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card className="p-5 bg-card border-card-border" data-testid="card-real-pnl">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">P&L mensual real</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Separa COGS vendido de compras de inventario para evitar pérdidas falsas por timing.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Income statement</Badge>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnl.data ?? []} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => formatCOPCompact(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatCOP(v)}
                />
                <Bar dataKey="grossProfit" name="Utilidad bruta" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="operatingExpenses" name="OpEx" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="netIncomeAccounting" name="Utilidad neta contable" radius={[3, 3, 0, 0]}>
                  {(pnl.data ?? []).map((row, i) => (
                    <Cell key={i} fill={row.netIncomeAccounting >= 0 ? 'hsl(var(--chart-3))' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-cash-flow">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Cash flow guardrail</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Qué caja puedes usar sin matar stock ni cierre mensual.</p>
            </div>
            <Badge variant="outline" className="text-[11px]">Caja</Badge>
          </div>
          <div className="space-y-3">
            {(cash.data ?? []).map(item => (
              <div key={item.id} className="rounded-md border border-border bg-muted/20 p-3" data-testid={`cash-${item.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{item.label}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{item.explanation}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular">{formatCOP(item.amount)}</div>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${STATUS_CLASS[item.status]}`}>{item.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-pnl-table">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Tabla P&L con inventario separado</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                La columna “utilidad caja naive” muestra lo que pasa si tratas compras de inventario como gasto inmediato.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">Contabilidad gerencial</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Revenue neto</TableHead>
                  <TableHead className="text-right">COGS vendido</TableHead>
                  <TableHead className="text-right">Utilidad bruta</TableHead>
                  <TableHead className="text-right">GM</TableHead>
                  <TableHead className="text-right">OpEx</TableHead>
                  <TableHead className="text-right">Inventario comprado</TableHead>
                  <TableHead className="text-right">Utilidad contable</TableHead>
                  <TableHead className="text-right">Caja naive</TableHead>
                  <TableHead>Lectura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pnl.data ?? []).map(row => (
                  <TableRow key={row.month} data-testid={`row-pnl-${row.month}`}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.netRevenue)}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.cogsRecognized)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{formatCOP(row.grossProfit)}</TableCell>
                    <TableCell className="text-right tabular">{formatPct(row.grossMargin)}</TableCell>
                    <TableCell className="text-right tabular">{formatCOP(row.operatingExpenses)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatCOP(row.inventoryPurchases)}</TableCell>
                    <TableCell className={`text-right tabular font-semibold ${row.netIncomeAccounting >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatCOP(row.netIncomeAccounting)}
                    </TableCell>
                    <TableCell className={`text-right tabular ${row.cashProfitNaive >= 0 ? 'text-muted-foreground' : 'text-amber-300'}`}>
                      {formatCOP(row.cashProfitNaive)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground min-w-[260px]">{row.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card className="p-5 bg-card border-card-border" data-testid="card-inventory-accounting">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Inventario vs COGS</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Esto corrige la lectura de abril: compra de inventario no es lo mismo que costo vendido.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">{formatCOP(totalCogsRecognized)} COGS</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Capitalizado</TableHead>
                <TableHead className="text-right">COGS vendido</TableHead>
                <TableHead className="text-right">Saldo inventario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(inventoryAccounting.data ?? []).map(row => (
                <TableRow key={row.id} data-testid={`row-inventory-accounting-${row.id}`}>
                  <TableCell className="font-medium">{row.purchaseOrder}</TableCell>
                  <TableCell>
                    <div className="text-[13px] font-medium">{row.material}</div>
                    <div className="text-[11px] text-muted-foreground">{row.accountingTreatment}</div>
                  </TableCell>
                  <TableCell className="text-right tabular">{formatCOP(row.cashPaid)}</TableCell>
                  <TableCell className="text-right tabular">{formatCOP(row.capitalizedToInventory)}</TableCell>
                  <TableCell className="text-right tabular text-amber-300">{formatCOP(row.cogsRecognized)}</TableCell>
                  <TableCell className="text-right tabular text-emerald-300">{formatCOP(row.remainingInventoryValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5 bg-card border-card-border" data-testid="card-close-checklist">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Cierre mensual guiado</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Checklist operativo para formalizar contabilidad.</p>
            </div>
            <ReceiptText className="h-4 w-4 text-accent" />
          </div>
          <div className="space-y-3">
            {(checklist.data ?? []).map(item => (
              <div key={item.id} className="rounded-md border border-border bg-muted/20 p-3" data-testid={`checklist-${item.id}`}>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.status === 'listo' ? 'text-emerald-300' : item.status === 'bloqueado' ? 'text-rose-300' : 'text-amber-300'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{item.task}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{item.status}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {item.owner} · {item.area} · {item.dueTiming}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.whyItMatters}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5 bg-card border-card-border" data-testid="card-finance-next">
          <h2 className="text-sm font-semibold tracking-tight">Qué conectaría después</h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed">
            <ActionBox title="Shopify" body="Orders, refunds, discounts, line items, product cost, inventory levels, payouts y fees." />
            <ActionBox title="Inventario" body="BOM por SKU, Material Manager, POs, consumo de materiales, merma y producto terminado." />
            <ActionBox title="Contabilidad" body="Gastos con soporte, bancos/pagos, impuestos, cierre mensual y conciliación de caja." />
          </div>
        </Card>
      </section>
    </Layout>
  );
}

function ActionBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}
