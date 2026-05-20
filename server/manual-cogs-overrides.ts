import type Database from 'better-sqlite3';
import { sqlite } from './storage';

export type ManualCogsOverride = {
  id: string;
  matchKey: string;
  displayName: string;
  unitCostCop: number;
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// Same shape as routes.ts `normalizeProductMatchKey`. Kept here too so the
// override lookup never depends on private route helpers.
export function normalizeOverrideMatchKey(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bthc[\s-]?o\b/g, 'thco')
    .replace(/\bcbd\s+doble\b/g, 'cbdoble')
    .replace(/\bcart\b/g, 'cartucho')
    .replace(/\bcarts\b/g, 'cartuchos')
    .replace(/^blend\s+/g, 'recarga ')
    .replace(/\bpxxx\b/g, 'pineapple xxx')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowToOverride(row: Record<string, unknown>): ManualCogsOverride {
  return {
    id: String(row.id),
    matchKey: String(row.match_key),
    displayName: String(row.display_name),
    unitCostCop: Number(row.unit_cost_cop),
    note: row.note == null ? null : String(row.note),
    active: Number(row.active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listManualCogsOverrides(db: Database.Database = sqlite): ManualCogsOverride[] {
  const rows = db.prepare(`
    SELECT id, match_key, display_name, unit_cost_cop, note, active, created_at, updated_at
    FROM manual_cogs_overrides
    ORDER BY display_name ASC
  `).all() as Array<Record<string, unknown>>;
  return rows.map(rowToOverride);
}

export function getManualCogsOverrideByMatchKey(matchKey: string, db: Database.Database = sqlite): ManualCogsOverride | null {
  const key = normalizeOverrideMatchKey(matchKey);
  if (!key) return null;
  const row = db.prepare(`
    SELECT id, match_key, display_name, unit_cost_cop, note, active, created_at, updated_at
    FROM manual_cogs_overrides
    WHERE match_key = ? AND active = 1
  `).get(key) as Record<string, unknown> | undefined;
  return row ? rowToOverride(row) : null;
}

export type ManualCogsOverrideInput = {
  id?: string;
  displayName: string;
  unitCostCop: number;
  note?: string | null;
  active?: boolean;
};

export function upsertManualCogsOverride(
  input: ManualCogsOverrideInput,
  db: Database.Database = sqlite,
): ManualCogsOverride {
  const displayName = (input.displayName || '').trim();
  if (!displayName) throw new Error('displayName_required');
  const unitCost = Math.round(Number(input.unitCostCop));
  if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000_000) {
    throw new Error('unit_cost_invalid');
  }
  const matchKey = normalizeOverrideMatchKey(displayName);
  if (!matchKey) throw new Error('match_key_invalid');
  const note = input.note ? String(input.note).slice(0, 500) : null;
  const active = input.active === false ? 0 : 1;
  const now = new Date().toISOString();
  const id = input.id || `cogs-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  if (input.id) {
    db.prepare(`
      UPDATE manual_cogs_overrides
      SET match_key = @matchKey,
          display_name = @displayName,
          unit_cost_cop = @unitCost,
          note = @note,
          active = @active,
          updated_at = @now
      WHERE id = @id
    `).run({ id, matchKey, displayName, unitCost, note, active, now });
  } else {
    db.prepare(`
      INSERT INTO manual_cogs_overrides
        (id, match_key, display_name, unit_cost_cop, note, active, created_at, updated_at)
      VALUES
        (@id, @matchKey, @displayName, @unitCost, @note, @active, @now, @now)
      ON CONFLICT(match_key) DO UPDATE SET
        display_name = excluded.display_name,
        unit_cost_cop = excluded.unit_cost_cop,
        note = excluded.note,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).run({ id, matchKey, displayName, unitCost, note, active, now });
  }

  const row = db.prepare(`
    SELECT id, match_key, display_name, unit_cost_cop, note, active, created_at, updated_at
    FROM manual_cogs_overrides WHERE match_key = ?
  `).get(matchKey) as Record<string, unknown>;
  return rowToOverride(row);
}

export function deleteManualCogsOverride(id: string, db: Database.Database = sqlite): boolean {
  const result = db.prepare(`DELETE FROM manual_cogs_overrides WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function setManualCogsOverrideActive(id: string, active: boolean, db: Database.Database = sqlite): boolean {
  const result = db.prepare(`
    UPDATE manual_cogs_overrides SET active = ?, updated_at = ? WHERE id = ?
  `).run(active ? 1 : 0, new Date().toISOString(), id);
  return result.changes > 0;
}
