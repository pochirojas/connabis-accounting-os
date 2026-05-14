// Cart Calculator — derived from Contabilidad-Connabis-Pro-1.xlsx sheet
// "Calculadora Carts" (block headers `Receta `, `PORCENTAJES RECETA`, and
// `PRECIOS INSUMOS / ML of each`). All values are float-strict.
//
// Formula (per ingredient):
//   needed_ml = ratio * number_of_carts * ml_per_cart
//   ingredient_cost = needed_ml * cost_per_ml
// Totals:
//   blend_cost = sum(ingredient_cost)
//   packaging_cost = (cart_price + bag_price) * number_of_carts
//   total_cost = blend_cost + packaging_cost
//   cost_per_cart = total_cost / number_of_carts
//
// We expose the seeded data alongside a per-name override path so the UI can
// match recipe ingredients against the live MM mirror cost. The seeded numbers
// remain visible (with `source: 'sheet'`) when no MM match is found.

import type Database from 'better-sqlite3';

export type CartRecipeIngredient = {
  name: string;
  ratio: number;        // 0..1, fraction of total ML
  costPerMl: number;    // seed value from sheet
};

export type CartRecipe = {
  id: string;
  name: string;
  ingredients: CartRecipeIngredient[];
};

export type CartPackagingOption = {
  id: string;
  name: string;
  defaultMlPerCart: number;
  unitCost: number;
};

// Seeded per-mL ingredient costs from sheet `PRECIOS INSUMOS / ML of each`
// section (A19:B23 et al.). Where the sheet has multiple labels for the same
// ingredient (e.g. "HHC" and "HHC Dest"), we surface them as distinct keys so
// recipe ratios stay faithful to the sheet rows.
const SEED_COST_PER_ML: Record<string, number> = {
  'THC-O - Nuevo Bache': 3096.744434,
  'THC-O': 3096.744434,
  'THCO REPLACE': 6432.489919,
  'THCP Dest': 11895.82241,
  'THC-P': 11895.82241,
  'THC- H': 11895.82241,
  'THCH': 11895.82241,
  'HHC': 2224.529211,
  'HHC Dest': 2224.529211,
  'HHC-P': 23273.81441,
  'HHCP': 23273.81441,
  'HHCp': 23273.81441,
  'D8-THC': 1617.702971,
  'D8 Dest': 1617.702971,
  'CBD': 1655.629611,
  'CBD No Cristalizable': 1655.629611,
  'CBD Full': 1655.629611,
  'H4CBD': 2983.062011,
  'CBG': 1617.702971,
  'CRD REPLACE': 1909.738099,
  'Terpenos': 7680.995263,
  'Terpenos ': 7680.995263,
};

// Recipe blocks copied verbatim from the sheet (rows 19..142, label cells
// `Receta `). The XTREME row also exposes `HHCp`/`HHCP` casing because the
// sheet itself is inconsistent there.
export const CART_RECIPES: CartRecipe[] = [
  recipe('pineapple-x', 'X', [
    ['THC-O - Nuevo Bache', 0.32],
    ['HHC', 0.10],
    ['D8-THC', 0.10],
    ['CBD No Cristalizable', 0.40],
    ['Terpenos', 0.08],
  ]),
  recipe('pineapple-xx', 'XX', [
    ['THC-O - Nuevo Bache', 0.52],
    ['HHC', 0.05],
    ['D8-THC', 0.05],
    ['CBD No Cristalizable', 0.30],
    ['Terpenos', 0.08],
  ]),
  recipe('pineapple-xxx', 'XXX', [
    ['THC-O - Nuevo Bache', 0.62],
    ['HHC', 0.10],
    ['D8-THC', 0.10],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('cbdoble', 'CB DOBLE', [
    ['CBD No Cristalizable', 0.92],
    ['Terpenos', 0.08],
  ]),
  recipe('hhc-max', 'HHC MAX', [
    ['HHC Dest', 0.62],
    ['D8 Dest', 0.20],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('hhc-ultra', 'HHC ULTRA', [
    ['HHC Dest', 0.82],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('thco-ultra', 'THCO ULTRA', [
    ['THC-O - Nuevo Bache', 0.82],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('thco-max', 'THCO MAX', [
    ['THC-O - Nuevo Bache', 0.62],
    ['HHC', 0.20],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('d8-max', 'D8 MAX', [
    ['HHC Dest', 0.20],
    ['D8 Dest', 0.62],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('d8-ultra', 'D8 ULTRA', [
    ['D8 Dest', 0.82],
    ['CBD No Cristalizable', 0.10],
    ['Terpenos', 0.08],
  ]),
  recipe('thco-replace', 'THCO REPLACE', [
    ['THCP Dest', 0.20],
    ['HHC Dest', 0.20],
    ['D8 Dest', 0.30],
    ['THCH', 0.25],
    ['H4CBD', 0.05],
  ]),
  recipe('xtreme', 'XTREME', [
    ['THCP Dest', 0.074],
    ['HHC Dest', 0.074],
    ['D8 Dest', 0.111],
    ['THCH', 0.0925],
    ['HHCP', 0.45],
    ['H4CBD', 0.0685],
    ['CBD', 0.05],
    ['Terpenos', 0.08],
  ]),
  recipe('crd-replace', 'CRD REPLACE', [
    ['CBD', 0.5],
    ['CBG', 0.3],
    ['H4CBD', 0.2],
  ]),
];

function recipe(id: string, name: string, rows: Array<[string, number]>): CartRecipe {
  return {
    id,
    name,
    ingredients: rows.map(([ingName, ratio]) => ({
      name: ingName,
      ratio,
      costPerMl: SEED_COST_PER_ML[ingName] ?? 0,
    })),
  };
}

// Packaging options seeded from sheet rows A25..A28 (cart/dispositivo prices)
// + Clear Bubble Bags row H19/I19. `defaultMlPerCart` matches the column
// headers from the top of the sheet. Jeringa 1mL ("syringe") is added as a
// packaging option for blend-only sales — the MM cost lookup will fill in the
// real unit cost when a matching material exists.
export const CART_PACKAGING_OPTIONS: CartPackagingOption[] = [
  { id: 'cart-1ml', name: 'Cart 1mL', defaultMlPerCart: 1, unitCost: 5968.2796 },
  { id: 'cart-2-25ml', name: 'Cart 2.25mL', defaultMlPerCart: 2.25, unitCost: 6356.2596 },
  { id: 'desechable-4ml', name: 'Desechable 4mL', defaultMlPerCart: 4, unitCost: 23273.81441 },
  { id: 'desechable-5ml', name: 'Desechable 5mL', defaultMlPerCart: 5, unitCost: 41836.58462 },
  { id: 'jeringa-1ml', name: 'Jeringa 1mL', defaultMlPerCart: 1, unitCost: 1500 },
];

export const CLEAR_BUBBLE_BAG_COST = 439.4673903;

// Look up a current per-mL cost from the MM mirror by fuzzy name match.
// Returns null when no MM material name contains the ingredient label, so the
// UI can fall back to the seeded sheet value and flag the source.
export function lookupMmCostPerMl(
  sqlite: Database.Database,
  ingredientName: string,
): { materialId: string; materialName: string; costPerMl: number } | null {
  const term = ingredientName.toLowerCase().trim();
  if (!term) return null;
  const rows = sqlite.prepare(
    `SELECT id, name, cost FROM material_manager_materials WHERE LOWER(name) LIKE ? LIMIT 5`,
  ).all(`%${term}%`) as Array<{ id: string; name: string; cost: number }>;
  if (rows.length === 0) return null;
  // Prefer exact (case-insensitive) match before a substring hit
  const exact = rows.find(r => r.name.toLowerCase() === term);
  const pick = exact ?? rows[0];
  // MM `cost` is per unit (e.g. per gram / per mL depending on the material).
  // We treat it as cost-per-mL here; the UI clearly labels source: 'mm'.
  return { materialId: pick.id, materialName: pick.name, costPerMl: Number(pick.cost) };
}

// Try to find a real MM cost for packaging by name. Used by the API to fill
// in the syringe unit cost from the live mirror when the seed value is just
// a placeholder. Returns null if no plausible match exists.
export function lookupMmPackagingCost(
  sqlite: Database.Database,
  hints: string[],
): { materialId: string; materialName: string; unitCost: number } | null {
  for (const hint of hints) {
    const term = hint.toLowerCase().trim();
    if (!term) continue;
    const rows = sqlite.prepare(
      `SELECT id, name, cost FROM material_manager_materials WHERE LOWER(name) LIKE ? AND cost > 0 ORDER BY cost ASC LIMIT 5`,
    ).all(`%${term}%`) as Array<{ id: string; name: string; cost: number }>;
    if (rows.length > 0) {
      const pick = rows[0];
      return { materialId: pick.id, materialName: pick.name, unitCost: Number(pick.cost) };
    }
  }
  return null;
}

export function buildPackagingWithMmCosts(sqlite: Database.Database) {
  return CART_PACKAGING_OPTIONS.map(p => {
    if (p.id !== 'jeringa-1ml') return { ...p, costSource: 'sheet' as const, mmMaterialName: null as string | null };
    const mm = lookupMmPackagingCost(sqlite, ['jeringa', 'syringe']);
    return mm
      ? { ...p, unitCost: mm.unitCost, costSource: 'mm' as const, mmMaterialName: mm.materialName }
      : { ...p, costSource: 'sheet' as const, mmMaterialName: null };
  });
}

export function buildRecipesWithMmCosts(sqlite: Database.Database) {
  return CART_RECIPES.map(r => ({
    ...r,
    ingredients: r.ingredients.map(ing => {
      const mm = lookupMmCostPerMl(sqlite, ing.name);
      return {
        ...ing,
        seedCostPerMl: ing.costPerMl,
        effectiveCostPerMl: mm ? mm.costPerMl : ing.costPerMl,
        mmMaterialId: mm?.materialId ?? null,
        mmMaterialName: mm?.materialName ?? null,
        costSource: mm ? 'mm' as const : 'sheet' as const,
      };
    }),
  }));
}
