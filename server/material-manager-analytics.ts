// Phase 2.6 P0 — Sales-data analytics for the Materials list (MM parity).
// Derives:
//   - soldLast30Days       = sum(|qty_delta|) in inventory_movements (negative, last 30 days)
//   - daysOfInventory      = stock / (soldLast30Days / 30)   (n/a if denom = 0)
//   - restockForecast30Days = max(0, soldLast30Days - stock)  (units needed to cover next 30 days)
//   - incoming             = sum(quantity) of draft PO lines (status='draft', not yet received)
//
// Days-of-inventory buckets for the header KPI: 0 days, 1-30, 31-90, 91+.
import Database from 'better-sqlite3';
import { listMmMaterialsEffective } from './material-manager-mirror';

export type MaterialSalesAnalytics = {
  materialId: string;
  stock: number;
  soldLast30Days: number;
  incoming: number;
  daysOfInventory: number | null;   // null = no consumption data
  restockForecast30Days: number;    // units needed to cover next 30 days
};

export type MaterialsHeaderKpis = {
  daysOfInventoryBuckets: { zero: number; oneToThirty: number; thirtyOneToNinety: number; ninetyOnePlus: number; nA: number };
  incomingMaterials: number;
  monthlyOrderCount: { current: number; limit: number };  // limit hardcoded to mirror MM cap
};

const MM_MONTHLY_ORDER_LIMIT = 5000;  // matches the screenshot "57 / 5,000"

export function buildMaterialSalesAnalytics(sqlite: Database.Database): MaterialSalesAnalytics[] {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const materials = listMmMaterialsEffective(sqlite);

  // Aggregate sold-last-30-days from inventory_movements (negative qty_delta).
  const soldRows = sqlite.prepare(`
    SELECT material_key, COALESCE(SUM(-qty_delta), 0) AS sold
    FROM inventory_movements
    WHERE qty_delta < 0 AND date >= ?
    GROUP BY material_key
  `).all(since) as Array<{ material_key: string; sold: number }>;
  const soldByMaterial = new Map(soldRows.map(r => [String(r.material_key), Number(r.sold) || 0]));

  // Incoming = quantity on draft PO lines (status='draft'). Cancelled and
  // received POs are excluded — once received, the qty already flowed into
  // stock via inventory_movements.
  const incomingRows = sqlite.prepare(`
    SELECT l.material_id AS materialId, COALESCE(SUM(l.quantity), 0) AS incoming
    FROM material_manager_purchase_order_lines l
    INNER JOIN material_manager_purchase_orders p ON p.id = l.purchase_order_id
    WHERE p.status = 'draft' AND l.material_id IS NOT NULL AND l.material_id != ''
    GROUP BY l.material_id
  `).all() as Array<{ materialId: string; incoming: number }>;
  const incomingByMaterial = new Map(incomingRows.map(r => [String(r.materialId), Number(r.incoming) || 0]));

  return materials.map(m => {
    const stock = Number(m.stock) || 0;
    const sold = soldByMaterial.get(m.id) ?? 0;
    const incoming = incomingByMaterial.get(m.id) ?? 0;
    const avgDaily = sold / 30;
    const daysOfInventory = avgDaily > 0 ? Math.round(stock / avgDaily) : null;
    const restock = Math.max(0, sold - stock);
    return {
      materialId: m.id,
      stock,
      soldLast30Days: sold,
      incoming,
      daysOfInventory,
      restockForecast30Days: restock,
    };
  });
}

export function getMaterialsHeaderKpis(sqlite: Database.Database): MaterialsHeaderKpis {
  const rows = buildMaterialSalesAnalytics(sqlite);
  const buckets = { zero: 0, oneToThirty: 0, thirtyOneToNinety: 0, ninetyOnePlus: 0, nA: 0 };
  let incomingMaterials = 0;
  rows.forEach(r => {
    if (r.incoming > 0) incomingMaterials += 1;
    if (r.daysOfInventory === null) {
      // Material with no consumption: if stock=0 count as zero, else n/a.
      if (r.stock <= 0) buckets.zero += 1; else buckets.nA += 1;
    } else if (r.daysOfInventory <= 0) {
      buckets.zero += 1;
    } else if (r.daysOfInventory <= 30) {
      buckets.oneToThirty += 1;
    } else if (r.daysOfInventory <= 90) {
      buckets.thirtyOneToNinety += 1;
    } else {
      buckets.ninetyOnePlus += 1;
    }
  });
  // Monthly order count — approximate from received PO lines this calendar month.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const sinceMonth = monthStart.toISOString().slice(0, 10);
  const orderRow = sqlite.prepare(`
    SELECT COUNT(*) AS c
    FROM material_manager_purchase_orders
    WHERE status = 'received' AND date >= ?
  `).get(sinceMonth) as { c: number };
  return {
    daysOfInventoryBuckets: buckets,
    incomingMaterials,
    monthlyOrderCount: { current: Number(orderRow?.c ?? 0), limit: MM_MONTHLY_ORDER_LIMIT },
  };
}
