// Smoke test: feed a couple of representative products through the B2B
// pricing engine and print a small report. Run with:
//   npx tsx script/smoke-b2b.ts
import { computeB2bPricing, computeTier, isWaterSoluble, TIERS } from '../server/b2b-pricing';
import type { Product } from '../shared/schema';

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: 'x', name: 'Producto', family: 'Vapes', sku: 'X', active: true,
  unitsSold: 0, unitPrice: 0, revenue: 0,
  cogsShopify: null, cogsFallback: 0, cogsBreakdown: [],
  packaging: 0, fees: 0, shippingSubsidy: 0,
  cogsUsed: 0, cogsSource: 'fallback', marginSource: 'shopify',
  dataCompleteness: 'real', idealPrice: 0, competitorPrice: 0,
  maxProfitableDiscount: 0, grossMargin: 0, contributionMargin: 0,
  alert: 'ok',
  ...overrides,
});

const fixtures: Product[] = [
  makeProduct({ id: 'p1', name: 'Vape THCA 1ml', family: 'Vapes', unitPrice: 120_000, cogsUsed: 35_000, cogsSource: 'material_manager', grossMargin: (120_000 - 35_000) / 120_000 }),
  makeProduct({ id: 'p2', name: 'Jeringa Delta-8 5ml', family: 'Jeringas', unitPrice: 220_000, cogsUsed: 90_000, cogsSource: 'shopify', grossMargin: (220_000 - 90_000) / 220_000 }),
  makeProduct({ id: 'p3', name: 'Producto sin COGS', family: 'Vapes', unitPrice: 80_000, cogsUsed: 0, cogsSource: 'fallback' }),
  makeProduct({ id: 'p4', name: 'Solubles en agua 30ml', family: 'Solubles', unitPrice: 60_000, cogsUsed: 15_000, cogsSource: 'shopify' }),
  makeProduct({ id: 'p5', name: 'Vape margen apretado', family: 'Vapes', unitPrice: 40_000, cogsUsed: 22_000, cogsSource: 'shopify', grossMargin: 0.45 }),
];

console.log('Water-soluble detection:');
fixtures.forEach(p => console.log(`  ${p.name.padEnd(35)} → ${isWaterSoluble(p) ? 'excluido' : 'OK'}`));

console.log('\nTier sanity check (Vape THCA 1ml @ COGS=35k retail=120k):');
TIERS.forEach(t => {
  const r = computeTier(35_000, 120_000, t);
  console.log(`  ${String(t.units).padStart(4)}u → ${String(r.price).padStart(7)} | Connabis ${(r.connabisMargin! * 100).toFixed(1)}% | Reseller ${(r.resellerMargin! * 100).toFixed(1)}% | ${r.flags.join(',') || 'ok'}`);
});

const result = computeB2bPricing(fixtures);
console.log('\nSummary:', result.summary);
console.log('\nRows:');
result.rows.forEach(r => {
  console.log(`  ${r.name.padEnd(35)} status=${r.status}  cogs=${r.cogs ?? 'null'}  retail=${r.retailPrice}  warnings=[${r.warnings.join('|')}]`);
});

// Assertions
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
ok(result.summary.excludedWaterSoluble === 1, 'soluble excluded');
ok(result.rows.length === 4, '4 rows in result');
ok(result.rows.find(r => r.id === 'p3')!.status === 'sin_cogs', 'p3 sin_cogs');
ok(result.rows.find(r => r.id === 'p1')!.tiers.every(t => t.price !== null && t.price > 0), 'p1 all tier prices');
// Margin floor never broken after rounding
result.rows.forEach(r => {
  if (r.cogs === null) return;
  r.tiers.forEach(t => {
    if (t.price === null) return;
    const margin = (t.price - r.cogs!) / t.price;
    const tierTarget = TIERS.find(x => x.units === t.units)!.targetConnabisMargin;
    // Allow rounding wiggle of 1 step (0.5%); the engine guarantees floor.
    ok(margin >= tierTarget - 0.005, `${r.name} ${t.units}u margin ${margin} < target ${tierTarget}`);
  });
});
console.log('\nAll smoke assertions passed.');
