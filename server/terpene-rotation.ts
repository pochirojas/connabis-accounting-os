// Phase 2 — Terpene Rotation Manager (local-only, draft-only).
//
// Connabis runs ~10 active terpenes at a time. The rotation rotates terpenes
// in/out and triggers downstream consequences: product variant naming, BOM
// material swaps, and inventory mapping. This module manages the canonical
// list of rotation slots and a draft replacement plan WITHOUT touching the MM
// mirror, MM BOM, or Shopify in any destructive way. All edits are stored in
// dedicated tables so they round-trip independently from the MM CSV export.
//
// IMPORTANT: every mutation here is local/draft-only. Applying drafts to MM
// BOM or Shopify is a separate Phase 2.3 feature (and is intentionally not
// implemented yet).
import Database from 'better-sqlite3';

export type TerpeneStatus = 'active' | 'incoming' | 'retired';

export type TerpeneRotationSlot = {
  id: number;
  slotIndex: number;          // 1..N
  displayName: string;        // canonical display name shown in UI
  materialIdHint: string | null;  // optional MM material ID anchor
  status: TerpeneStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TerpeneReplacementDraft = {
  id: number;
  fromName: string;           // outgoing terpene (canonical or material name)
  toName: string;             // incoming terpene
  affectedVariantPattern: string | null;  // free-text glob/regex hint
  containerVariants: string;  // CSV: e.g. "1ml,2.25ml,4ml,Jeringa"
  status: 'draft' | 'reviewed' | 'archived';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function ensureTerpeneRotationSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS terpene_rotation_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_index INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      material_id_hint TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(slot_index)
    );

    CREATE TABLE IF NOT EXISTS terpene_replacement_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_name TEXT NOT NULL,
      to_name TEXT NOT NULL,
      affected_variant_pattern TEXT,
      container_variants TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function mapSlot(row: Record<string, unknown>): TerpeneRotationSlot {
  return {
    id: Number(row.id),
    slotIndex: Number(row.slot_index),
    displayName: String(row.display_name ?? ''),
    materialIdHint: row.material_id_hint == null ? null : String(row.material_id_hint),
    status: (String(row.status ?? 'active') as TerpeneStatus),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapDraft(row: Record<string, unknown>): TerpeneReplacementDraft {
  return {
    id: Number(row.id),
    fromName: String(row.from_name ?? ''),
    toName: String(row.to_name ?? ''),
    affectedVariantPattern: row.affected_variant_pattern == null ? null : String(row.affected_variant_pattern),
    containerVariants: String(row.container_variants ?? ''),
    status: (String(row.status ?? 'draft') as TerpeneReplacementDraft['status']),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

// Current active rotation extracted from the public Connabis "Aprende Más ·
// Terpenos" page (https://connabis.com.co/pages/aprende-mas-terpenos). This is
// the manual baseline used until Shopify/metaobject sync is implemented; refresh
// it by hand when the rotation changes on the site.
export const CURRENT_ROTATION_BASELINE: ReadonlyArray<{ displayName: string; notes: string }> = [
  { displayName: 'Gelato AMP',           notes: 'Hybrid AMP · Día / Tarde' },
  { displayName: 'Pineapple OG AMP CDT', notes: 'Sativa AMP · Mañana / Día' },
  { displayName: 'White Widow',          notes: 'Hybrid · Día / Tarde' },
  { displayName: 'Skywalker OG',         notes: 'Indica · Tarde / Noche' },
  { displayName: 'Mango Tango',          notes: 'Sativa · Mañana / Día' },
  { displayName: 'Sour Diesel',          notes: 'Sativa · Mañana / Día' },
  { displayName: 'Forbidden Fruit AMP',  notes: 'Indica AMP · Tarde / Noche' },
  { displayName: 'Banana Mimosa',        notes: 'Hybrid · Día / Tarde' },
  { displayName: 'Razz Berry AMP',       notes: 'Hybrid AMP · Día / Tarde' },
  { displayName: 'Pink Champagne AMP',   notes: 'Indica AMP · Tarde / Noche' },
];

function seedCurrentRotationIfEmpty(sqlite: Database.Database): void {
  const count = (sqlite.prepare('SELECT COUNT(*) AS n FROM terpene_rotation_slots').get() as { n: number }).n;
  if (count > 0) return;
  const now = new Date().toISOString();
  const insert = sqlite.prepare(`
    INSERT INTO terpene_rotation_slots (slot_index, display_name, material_id_hint, status, notes, created_at, updated_at)
    VALUES (@slot_index, @display_name, NULL, 'active', @notes, @created_at, @updated_at)
  `);
  const tx = sqlite.transaction(() => {
    CURRENT_ROTATION_BASELINE.forEach((entry, i) => {
      insert.run({
        slot_index: i + 1,
        display_name: entry.displayName,
        notes: entry.notes,
        created_at: now,
        updated_at: now,
      });
    });
  });
  tx();
}

export function listTerpeneSlots(sqlite: Database.Database): TerpeneRotationSlot[] {
  ensureTerpeneRotationSchema(sqlite);
  seedCurrentRotationIfEmpty(sqlite);
  const rows = sqlite.prepare('SELECT * FROM terpene_rotation_slots ORDER BY slot_index ASC').all() as Array<Record<string, unknown>>;
  return rows.map(mapSlot);
}

export function upsertTerpeneSlot(
  sqlite: Database.Database,
  payload: {
    id?: number;
    slotIndex: number;
    displayName: string;
    materialIdHint?: string | null;
    status?: TerpeneStatus;
    notes?: string | null;
  },
): TerpeneRotationSlot {
  ensureTerpeneRotationSchema(sqlite);
  const now = new Date().toISOString();
  if (payload.id) {
    sqlite.prepare(`
      UPDATE terpene_rotation_slots
      SET slot_index = @slot_index,
          display_name = @display_name,
          material_id_hint = @material_id_hint,
          status = @status,
          notes = @notes,
          updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: payload.id,
      slot_index: payload.slotIndex,
      display_name: payload.displayName,
      material_id_hint: payload.materialIdHint ?? null,
      status: payload.status ?? 'active',
      notes: payload.notes ?? null,
      updated_at: now,
    });
    const row = sqlite.prepare('SELECT * FROM terpene_rotation_slots WHERE id = ?').get(payload.id) as Record<string, unknown>;
    return mapSlot(row);
  }
  // Insert; conflict on slot_index → update existing row instead.
  sqlite.prepare(`
    INSERT INTO terpene_rotation_slots (slot_index, display_name, material_id_hint, status, notes, created_at, updated_at)
    VALUES (@slot_index, @display_name, @material_id_hint, @status, @notes, @created_at, @updated_at)
    ON CONFLICT(slot_index) DO UPDATE SET
      display_name = excluded.display_name,
      material_id_hint = excluded.material_id_hint,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run({
    slot_index: payload.slotIndex,
    display_name: payload.displayName,
    material_id_hint: payload.materialIdHint ?? null,
    status: payload.status ?? 'active',
    notes: payload.notes ?? null,
    created_at: now,
    updated_at: now,
  });
  const row = sqlite.prepare('SELECT * FROM terpene_rotation_slots WHERE slot_index = ?').get(payload.slotIndex) as Record<string, unknown>;
  return mapSlot(row);
}

export function deleteTerpeneSlot(sqlite: Database.Database, id: number): boolean {
  ensureTerpeneRotationSchema(sqlite);
  const info = sqlite.prepare('DELETE FROM terpene_rotation_slots WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listTerpeneDrafts(sqlite: Database.Database): TerpeneReplacementDraft[] {
  ensureTerpeneRotationSchema(sqlite);
  const rows = sqlite.prepare('SELECT * FROM terpene_replacement_drafts ORDER BY updated_at DESC, id DESC').all() as Array<Record<string, unknown>>;
  return rows.map(mapDraft);
}

export function upsertTerpeneDraft(
  sqlite: Database.Database,
  payload: {
    id?: number;
    fromName: string;
    toName: string;
    affectedVariantPattern?: string | null;
    containerVariants?: string;
    status?: TerpeneReplacementDraft['status'];
    notes?: string | null;
  },
): TerpeneReplacementDraft {
  ensureTerpeneRotationSchema(sqlite);
  const now = new Date().toISOString();
  if (payload.id) {
    sqlite.prepare(`
      UPDATE terpene_replacement_drafts
      SET from_name = @from_name,
          to_name = @to_name,
          affected_variant_pattern = @affected_variant_pattern,
          container_variants = @container_variants,
          status = @status,
          notes = @notes,
          updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: payload.id,
      from_name: payload.fromName,
      to_name: payload.toName,
      affected_variant_pattern: payload.affectedVariantPattern ?? null,
      container_variants: payload.containerVariants ?? '',
      status: payload.status ?? 'draft',
      notes: payload.notes ?? null,
      updated_at: now,
    });
    const row = sqlite.prepare('SELECT * FROM terpene_replacement_drafts WHERE id = ?').get(payload.id) as Record<string, unknown>;
    return mapDraft(row);
  }
  const info = sqlite.prepare(`
    INSERT INTO terpene_replacement_drafts (from_name, to_name, affected_variant_pattern, container_variants, status, notes, created_at, updated_at)
    VALUES (@from_name, @to_name, @affected_variant_pattern, @container_variants, @status, @notes, @created_at, @updated_at)
  `).run({
    from_name: payload.fromName,
    to_name: payload.toName,
    affected_variant_pattern: payload.affectedVariantPattern ?? null,
    container_variants: payload.containerVariants ?? '',
    status: payload.status ?? 'draft',
    notes: payload.notes ?? null,
    created_at: now,
    updated_at: now,
  });
  const row = sqlite.prepare('SELECT * FROM terpene_replacement_drafts WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<string, unknown>;
  return mapDraft(row);
}

export function deleteTerpeneDraft(sqlite: Database.Database, id: number): boolean {
  ensureTerpeneRotationSchema(sqlite);
  const info = sqlite.prepare('DELETE FROM terpene_replacement_drafts WHERE id = ?').run(id);
  return info.changes > 0;
}
