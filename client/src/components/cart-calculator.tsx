import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCOP, formatQty } from '@/lib/format';

type Ingredient = {
  name: string;
  ratio: number;
  seedCostPerMl: number;
  effectiveCostPerMl: number;
  mmMaterialId: string | null;
  mmMaterialName: string | null;
  costSource: 'mm' | 'sheet';
};

type Recipe = {
  id: string;
  name: string;
  ingredients: Ingredient[];
};

type Packaging = {
  id: string;
  name: string;
  defaultMlPerCart: number;
  unitCost: number;
};

type CalcResponse = {
  recipes: Recipe[];
  packaging: Packaging[];
  bagCost: number;
};

export function CartCalculator() {
  const calc = useQuery<CalcResponse>({ queryKey: ['/api/material-manager/cart-calculator'] });
  const [recipeId, setRecipeId] = useState<string>('');
  const [packagingId, setPackagingId] = useState<string>('');
  const [numCartsStr, setNumCartsStr] = useState<string>('100');
  const [mlPerCartStr, setMlPerCartStr] = useState<string>('');
  const [includeBag, setIncludeBag] = useState<boolean>(true);
  const [salePriceStr, setSalePriceStr] = useState<string>('');

  const data = calc.data;
  const recipe = useMemo(() => data?.recipes.find(r => r.id === recipeId) ?? data?.recipes[0], [data, recipeId]);
  const packaging = useMemo(() => data?.packaging.find(p => p.id === packagingId) ?? data?.packaging[0], [data, packagingId]);

  // Effective mL per cart: explicit override else packaging default
  const numCarts = Number(numCartsStr) || 0;
  const mlPerCart = mlPerCartStr.trim() !== '' ? Number(mlPerCartStr) : (packaging?.defaultMlPerCart ?? 0);
  const salePrice = Number(salePriceStr) || 0;

  const rows = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map(ing => {
      const neededMl = ing.ratio * numCarts * mlPerCart;
      const cost = neededMl * ing.effectiveCostPerMl;
      return { ing, neededMl, cost };
    });
  }, [recipe, numCarts, mlPerCart]);

  const blendCost = rows.reduce((s, r) => s + r.cost, 0);
  const packagingUnitCost = (packaging?.unitCost ?? 0) + (includeBag ? (data?.bagCost ?? 0) : 0);
  const packagingCost = packagingUnitCost * numCarts;
  const totalCost = blendCost + packagingCost;
  const costPerCart = numCarts > 0 ? totalCost / numCarts : 0;
  const revenue = salePrice * numCarts;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? profit / revenue : 0;

  if (calc.isLoading || !data || !recipe || !packaging) {
    return <Card className="p-5" data-testid="card-cart-calculator-loading"><p className="text-xs text-muted-foreground">Cargando calculadora…</p></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5" data-testid="card-cart-calculator-inputs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Calculadora de Carts</h3>
            <p className="text-[11.5px] text-muted-foreground">
              Recetas y costos derivados de la hoja contable <span className="font-mono">Calculadora Carts</span>.
              Costo por mL viene del MM mirror cuando hay match por nombre; si no, usa el valor seed de la hoja.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">{data.recipes.length} recetas</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Receta</div>
            <select
              value={recipe.id}
              onChange={e => setRecipeId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-cart-recipe"
            >
              {data.recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Cart / Dispositivo</div>
            <select
              value={packaging.id}
              onChange={e => { setPackagingId(e.target.value); setMlPerCartStr(''); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-cart-packaging"
            >
              {data.packaging.map(p => <option key={p.id} value={p.id}>{p.name} — {formatCOP(p.unitCost)}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1"># Carts</div>
            <Input
              type="number"
              step="any"
              min="0"
              value={numCartsStr}
              onChange={e => setNumCartsStr(e.target.value)}
              data-testid="input-cart-count"
            />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              mL por cart <span className="text-[10px]">(default {packaging.defaultMlPerCart})</span>
            </div>
            <Input
              type="number"
              step="any"
              min="0"
              value={mlPerCartStr}
              placeholder={String(packaging.defaultMlPerCart)}
              onChange={e => setMlPerCartStr(e.target.value)}
              data-testid="input-ml-per-cart"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={includeBag}
              onChange={e => setIncludeBag(e.target.checked)}
              data-testid="checkbox-bag"
            />
            Incluir Clear Bubble Bag ({formatCOP(data.bagCost)} c/u)
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Precio de venta por cart (opcional)</div>
            <Input
              type="number"
              step="any"
              min="0"
              value={salePriceStr}
              onChange={e => setSalePriceStr(e.target.value)}
              placeholder="0"
              data-testid="input-sale-price"
            />
          </label>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-cart-calculator-breakdown">
        <h4 className="text-sm font-semibold tracking-tight mb-2">Desglose por ingrediente</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingrediente</TableHead>
                <TableHead className="text-right">Ratio</TableHead>
                <TableHead className="text-right">mL necesarios</TableHead>
                <TableHead className="text-right">Costo / mL</TableHead>
                <TableHead className="text-right">Costo total</TableHead>
                <TableHead>Fuente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ ing, neededMl, cost }) => (
                <TableRow key={ing.name} data-testid={`row-ingredient-${ing.name}`}>
                  <TableCell className="text-[12.5px]">{ing.name}</TableCell>
                  <TableCell className="text-right tabular text-[12px]">{(ing.ratio * 100).toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular text-[12px]">{formatQty(neededMl)} mL</TableCell>
                  <TableCell className="text-right tabular text-[12px]">{formatCOP(ing.effectiveCostPerMl)}</TableCell>
                  <TableCell className="text-right tabular text-[12.5px] font-semibold">{formatCOP(cost)}</TableCell>
                  <TableCell>
                    {ing.costSource === 'mm' ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300" title={ing.mmMaterialName ?? ''}>MM mirror</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">Seed sheet</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-cart-calculator-totals">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Totals label="Blend total" value={formatCOP(blendCost)} testId="totals-blend" />
          <Totals label="Packaging total" value={formatCOP(packagingCost)} testId="totals-packaging" />
          <Totals label="Costo total" value={formatCOP(totalCost)} testId="totals-total" emphasis />
          <Totals label="Costo por cart" value={formatCOP(costPerCart)} testId="totals-per-cart" />
        </div>
        {salePrice > 0 ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Totals label="Revenue" value={formatCOP(revenue)} testId="totals-revenue" />
            <Totals label="Profit" value={formatCOP(profit)} testId="totals-profit" />
            <Totals label="Margen" value={`${(margin * 100).toFixed(2)}%`} testId="totals-margin" />
            <Totals label="Precio venta" value={formatCOP(salePrice)} testId="totals-sale-price" />
          </div>
        ) : null}
        <p className="mt-3 text-[10.5px] text-muted-foreground">
          Fórmula: <span className="font-mono">needed_ml = ratio × #carts × mL/cart</span>;
          <span className="font-mono"> cost = needed_ml × cost_per_mL</span>.
          Packaging = (cart + bolsa opcional) × #carts. Source MM ⇒ último costo del mirror; Source sheet ⇒ valor seed de la hoja.
        </p>
      </Card>
    </div>
  );
}

function Totals({ label, value, testId, emphasis }: { label: string; value: string; testId: string; emphasis?: boolean }) {
  return (
    <div
      className={`rounded-md border p-3 ${emphasis ? 'border-emerald-500/40 bg-emerald-500/8' : 'border-border bg-muted/25'}`}
      data-testid={testId}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[14px] font-semibold tabular ${emphasis ? 'text-emerald-300' : ''}`}>{value}</div>
    </div>
  );
}
