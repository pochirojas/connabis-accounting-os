// Phase 2.6 P0 — local Material Manager settings (PO prefix / logo / sync
// toggles / locations). Persisted in SQLite. NO Shopify writes happen from
// here; the sync toggles are local-only labels for a future proxy.
import Database from 'better-sqlite3';

export type MmSettings = {
  syncMaterialInventory: boolean;
  syncAssembledInventory: boolean;
  syncCostPerItem: boolean;
  blockCheckoutWhenShared: boolean;
  poPrefix: string;
  poLogoUrl: string;
  locations: Array<{ id: string; label: string; active: boolean }>;
  // Local-only flag: when false, the UI shows a banner saying writes to
  // Shopify are still gated even if individual flags are on.
  shopifyWritesEnabled: boolean;
  updatedAt: string;
};

const DEFAULTS: MmSettings = {
  syncMaterialInventory: true,
  syncAssembledInventory: true,
  syncCostPerItem: true,
  blockCheckoutWhenShared: false,
  poPrefix: 'PO',
  poLogoUrl: '',
  locations: [
    { id: 'calle-36-22a-108', label: 'Calle 36 #22a-108', active: true },
    { id: 'ordenes-locales', label: 'Ordenes Locales', active: false },
  ],
  shopifyWritesEnabled: false,
  updatedAt: new Date(0).toISOString(),
};

export function ensureMmSettingsSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS material_manager_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getMmSettings(sqlite: Database.Database): MmSettings {
  ensureMmSettingsSchema(sqlite);
  const row = sqlite.prepare(`SELECT payload, updated_at FROM material_manager_settings WHERE id = 1`).get() as { payload?: string; updated_at?: string } | undefined;
  if (!row?.payload) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(row.payload) as Partial<MmSettings>;
    return {
      ...DEFAULTS,
      ...parsed,
      locations: Array.isArray(parsed.locations) && parsed.locations.length ? parsed.locations : DEFAULTS.locations,
      updatedAt: row.updated_at ?? DEFAULTS.updatedAt,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function updateMmSettings(sqlite: Database.Database, patch: Partial<MmSettings>): MmSettings {
  ensureMmSettingsSchema(sqlite);
  const current = getMmSettings(sqlite);
  const next: MmSettings = {
    ...current,
    ...patch,
    locations: Array.isArray(patch.locations) ? patch.locations : current.locations,
    updatedAt: new Date().toISOString(),
  };
  sqlite.prepare(`
    INSERT INTO material_manager_settings (id, payload, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(JSON.stringify(next), next.updatedAt);
  return next;
}
