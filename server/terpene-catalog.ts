// Phase 2.2 — Terpene Metaobject Catalog (local mirror of Shopify `terpeno`).
//
// Models all 33 terpene metaobjects published on connabis.com.co
// (10 `En Rotación` + 23 `Agotado`), shaped after the Shopify Metaobject type
// `terpeno`. The baseline below is hand-extracted from the Connabis Terpene
// Rotation System Technical Documentation PDF (handles + names + status) and
// is the source-of-truth until a Shopify backend proxy is wired up.
//
// All mutations are LOCAL-ONLY. They are saved into the `terpene_catalog_edits`
// table as a sparse override on top of the baseline. Nothing here ever calls
// Shopify Admin GraphQL — that proxy is a separate, explicit feature.
//
// What the OS controls today (local draft):
//   - estado:   En Rotación | Agotado
//   - orden:    1..10 (or null if Agotado)
//   - mascota:  CDN URL
//   - tipo:     Sativa | Hibrido | Indica
//
// What Shopify still owns (read-only mirror, edits passed-through to payload
// preview only):
//   - perfil_sabor, perfil_sensaciones, propiedades_terapeuticas
//   - sinergia, composicion, sku, tamano, tss_url, tags_*
//
import Database from 'better-sqlite3';

export type TerpeneEstado = 'En Rotación' | 'Agotado';
export type TerpeneTipo = 'Sativa' | 'Hibrido' | 'Indica' | '';

export type TerpeneCatalogEntry = {
  handle: string;
  nombre: string;
  nombreFloraplex: string | null;
  tipo: TerpeneTipo;
  estado: TerpeneEstado;
  orden: number | null;
  mascotaUrl: string | null;
  perfilSabor: string | null;
  /** True when at least one field has a local draft override on top of baseline. */
  dirty: boolean;
  /** ISO timestamp of last local edit, or null if untouched. */
  updatedAt: string | null;
};

type BaselineRow = {
  handle: string;
  nombre: string;
  nombreFloraplex?: string;
  tipo: TerpeneTipo;
  estado: TerpeneEstado;
  orden: number | null;
  mascotaUrl?: string | null;
  perfilSabor?: string | null;
};

// Mascot CDN base — all PNGs live under the same Shopify files prefix.
const MASCOT_CDN_BASE = 'https://cdn.shopify.com/s/files/1/0581/4121/2749/files/';

// Mascots we know about, extracted from the PDF. Keys are catalog handles.
const KNOWN_MASCOT_FILES: Record<string, string> = {
  'terpeno-skxudhtc': 'Gelato_Amp.png?v=1778099537',
  'terpeno-rgnr9zoq': 'Pineapple_OG_Amp_CDT.png?v=1778099533',
  'terpeno-xpfem5gy': 'White_Widow_Kratos.ai.png?v=1778099506',
  'terpeno-uiyc3gbe': 'Skywalker.ai.png?v=1778172927',
  'terpeno-hg8xj7wv': 'Mango_Tango.png?v=1778099511',
  'terpeno-vmdltdz5': 'Sour_Diesel_Vector.png?v=1778099520',
  'terpeno-snxuzbyl': 'Fobidden_Fruit_Vector.ai.png?v=1778730214',
  'terpeno-v9pow26d': 'Banana_Mimosa.ai.png?v=1778172927',
  'terpeno-w5cclocb': 'Razz_Berry_Amp_Vectorizado.png?v=1778730240',
  'terpeno-ciuxma1e': 'Pink_Champagne.ai.png?v=1778730219',
  'pineapple-og-amp':  'Pineapple_OG_Amp.png?v=1774558294',
  'terpeno-mgsjcu8d':  'Gelato.ai.png?v=1778099501',
};

// Baseline: all 33 terpenes (10 active + 23 retired), extracted from PDF spec.
// Tipo is inferred from PDF copy ("Sativa AMP", "Indica AMP", "Hybrid AMP", "Hybrid", etc.)
// where stated; remaining entries default to '' (unknown — Shopify metaobject is source).
const BASELINE: ReadonlyArray<BaselineRow> = [
  // ----- En Rotación (orden 1..10) -----
  { handle: 'terpeno-skxudhtc', nombre: 'Gelato AMP',           tipo: 'Hibrido', estado: 'En Rotación', orden: 1  },
  { handle: 'terpeno-rgnr9zoq', nombre: 'Pineapple OG AMP CDT', tipo: 'Sativa',  estado: 'En Rotación', orden: 2  },
  { handle: 'terpeno-xpfem5gy', nombre: 'White Widow',          tipo: 'Hibrido', estado: 'En Rotación', orden: 3  },
  { handle: 'terpeno-uiyc3gbe', nombre: 'Skywalker OG',         tipo: 'Indica',  estado: 'En Rotación', orden: 4  },
  { handle: 'terpeno-hg8xj7wv', nombre: 'Mango Tango',          tipo: 'Sativa',  estado: 'En Rotación', orden: 5  },
  { handle: 'terpeno-vmdltdz5', nombre: 'Sour Diesel',          tipo: 'Sativa',  estado: 'En Rotación', orden: 6  },
  { handle: 'terpeno-snxuzbyl', nombre: 'Forbidden Fruit AMP',  tipo: 'Indica',  estado: 'En Rotación', orden: 7  },
  { handle: 'terpeno-v9pow26d', nombre: 'Banana Mimosa',        tipo: 'Hibrido', estado: 'En Rotación', orden: 8  },
  { handle: 'terpeno-w5cclocb', nombre: 'Razz Berry AMP',       tipo: 'Hibrido', estado: 'En Rotación', orden: 9  },
  { handle: 'terpeno-ciuxma1e', nombre: 'Pink Champagne AMP',   tipo: 'Indica',  estado: 'En Rotación', orden: 10 },

  // ----- Agotado / Banco (orden null) -----
  { handle: 'terpeno-y5i2pgim', nombre: 'Piña Colada AMP',          tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-o3qil70b', nombre: 'Tropical Punch AMP',       tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-4krixq6p', nombre: 'Wedding Cake',             tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-3tgpfikb', nombre: 'Northern Lights',          tipo: 'Indica',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-gcniqbps', nombre: 'King Louis XIII',          tipo: 'Indica',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-hiqwni7u', nombre: "God's Gift",               tipo: 'Indica',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-jwtghpqf', nombre: "Tiger's Blood AMP",        tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-wpwzw6ac', nombre: 'ACDC',                     tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-xu2acgcp', nombre: 'Watermelon Bubblegum AMP', tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-8wbdx86q', nombre: 'Super Lemon Haze',         tipo: 'Sativa',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-ubbnwkei', nombre: 'Strawberry Lemonade',      tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-js7yr01b', nombre: 'Purple Punch AMP',         tipo: 'Indica',  estado: 'Agotado', orden: null },
  { handle: 'pineapple-og-amp', nombre: 'Pineapple OG AMP',         tipo: 'Sativa',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-lwdcfyl9', nombre: 'Berry Belini AMP',         tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-ubqvh1rq', nombre: 'Strawberry Mimosa AMP',    tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-ujgybxnw', nombre: 'Cookies n Cream',          tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-tcqmhlec', nombre: 'Granddaddy Purple',        tipo: 'Indica',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-4pafonzr', nombre: 'Jack Herrer',              tipo: 'Sativa',  estado: 'Agotado', orden: null },
  { handle: 'terpeno-osalbj0g', nombre: 'OG Kush',                  tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-jcr6mgjg', nombre: 'Key Lime Pie',             tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-mgsjcu8d', nombre: 'Gelato',                   tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-jkbsi9ra', nombre: 'Apple Fritter AMP',        tipo: 'Hibrido', estado: 'Agotado', orden: null },
  { handle: 'terpeno-nks562er', nombre: 'Trainwreck',               tipo: 'Sativa',  estado: 'Agotado', orden: null },
];

export const TERPENE_BASELINE_HANDLES: ReadonlyArray<string> = BASELINE.map(b => b.handle);
export const TERPENE_BASELINE_COUNT = BASELINE.length;
export const TERPENE_ACTIVE_LIMIT = 10;

function mascotForHandle(handle: string): string | null {
  const file = KNOWN_MASCOT_FILES[handle];
  return file ? MASCOT_CDN_BASE + file : null;
}

export function ensureTerpeneCatalogSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS terpene_catalog_edits (
      handle TEXT PRIMARY KEY,
      tipo TEXT,
      estado TEXT,
      orden INTEGER,
      mascota_url TEXT,
      perfil_sabor TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

type EditRow = {
  handle: string;
  tipo: string | null;
  estado: string | null;
  orden: number | null;
  mascota_url: string | null;
  perfil_sabor: string | null;
  updated_at: string;
};

function loadEdits(sqlite: Database.Database): Map<string, EditRow> {
  ensureTerpeneCatalogSchema(sqlite);
  const rows = sqlite.prepare('SELECT * FROM terpene_catalog_edits').all() as EditRow[];
  return new Map(rows.map(r => [r.handle, r]));
}

function buildEntry(base: BaselineRow, edit: EditRow | undefined): TerpeneCatalogEntry {
  const baselineMascot = mascotForHandle(base.handle);
  const tipo = ((edit?.tipo ?? base.tipo) as TerpeneTipo);
  const estado = ((edit?.estado ?? base.estado) as TerpeneEstado);
  const orden = estado === 'Agotado'
    ? null
    : (edit && edit.orden != null ? edit.orden : base.orden);
  const mascotaUrl = edit?.mascota_url ?? baselineMascot ?? null;
  const perfilSabor = edit?.perfil_sabor ?? base.perfilSabor ?? null;
  const dirty = Boolean(edit && (
    (edit.tipo != null && edit.tipo !== base.tipo) ||
    (edit.estado != null && edit.estado !== base.estado) ||
    (edit.orden !== null && edit.orden !== base.orden) ||
    (edit.mascota_url != null && edit.mascota_url !== baselineMascot) ||
    (edit.perfil_sabor != null && edit.perfil_sabor !== base.perfilSabor)
  ));
  return {
    handle: base.handle,
    nombre: base.nombre,
    nombreFloraplex: base.nombreFloraplex ?? null,
    tipo,
    estado,
    orden,
    mascotaUrl,
    perfilSabor,
    dirty,
    updatedAt: edit?.updated_at ?? null,
  };
}

export function listTerpeneCatalog(sqlite: Database.Database): TerpeneCatalogEntry[] {
  const edits = loadEdits(sqlite);
  const entries = BASELINE.map(b => buildEntry(b, edits.get(b.handle)));
  // Stable order: En Rotación by `orden` ascending, then Agotado alphabetical.
  entries.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'En Rotación' ? -1 : 1;
    if (a.estado === 'En Rotación') {
      return (a.orden ?? 99) - (b.orden ?? 99);
    }
    return a.nombre.localeCompare(b.nombre);
  });
  return entries;
}

export function getTerpeneByHandle(sqlite: Database.Database, handle: string): TerpeneCatalogEntry | null {
  const base = BASELINE.find(b => b.handle === handle);
  if (!base) return null;
  const edits = loadEdits(sqlite);
  return buildEntry(base, edits.get(handle));
}

export type TerpeneEditPatch = {
  tipo?: TerpeneTipo | null;
  estado?: TerpeneEstado | null;
  orden?: number | null;
  mascotaUrl?: string | null;
  perfilSabor?: string | null;
};

export type BatchPatchInput = {
  handle: string;
  patch: TerpeneEditPatch;
};

export type BatchPatchResult = {
  saved: TerpeneCatalogEntry[];
  errors: Array<{ handle: string; error: string }>;
};

/**
 * Validate the *resulting* catalog against rotation invariants:
 *   - At most TERPENE_ACTIVE_LIMIT entries with estado=En Rotación.
 *   - Active entries have unique `orden` in [1..TERPENE_ACTIVE_LIMIT].
 *   - Agotado entries have orden=null.
 */
function validateCatalog(entries: TerpeneCatalogEntry[]): string | null {
  const active = entries.filter(e => e.estado === 'En Rotación');
  if (active.length > TERPENE_ACTIVE_LIMIT) {
    return `Demasiados activos: ${active.length} > ${TERPENE_ACTIVE_LIMIT}`;
  }
  const ordens = active.map(e => e.orden).filter((o): o is number => o != null);
  const uniq = new Set(ordens);
  if (uniq.size !== ordens.length) {
    return `Órdenes duplicados en rotación activa`;
  }
  for (const o of ordens) {
    if (o < 1 || o > TERPENE_ACTIVE_LIMIT) {
      return `Orden fuera de rango (1..${TERPENE_ACTIVE_LIMIT}): ${o}`;
    }
  }
  return null;
}

/**
 * Apply a batch of patches atomically. If the resulting catalog violates
 * rotation invariants the transaction is rolled back and a single error is
 * returned (no partial save).
 */
export function patchTerpeneCatalogBatch(
  sqlite: Database.Database,
  patches: BatchPatchInput[],
): BatchPatchResult {
  ensureTerpeneCatalogSchema(sqlite);
  const now = new Date().toISOString();
  const baselineByHandle = new Map(BASELINE.map(b => [b.handle, b]));

  // Pre-flight per-patch validation.
  const perPatchErrors: Array<{ handle: string; error: string }> = [];
  for (const p of patches) {
    if (!baselineByHandle.has(p.handle)) {
      perPatchErrors.push({ handle: p.handle, error: 'handle desconocido' });
      continue;
    }
    if (p.patch.estado && p.patch.estado !== 'En Rotación' && p.patch.estado !== 'Agotado') {
      perPatchErrors.push({ handle: p.handle, error: 'estado inválido' });
      continue;
    }
    if (p.patch.tipo != null && p.patch.tipo !== '' && !['Sativa', 'Hibrido', 'Indica'].includes(p.patch.tipo)) {
      perPatchErrors.push({ handle: p.handle, error: 'tipo inválido' });
      continue;
    }
    if (p.patch.orden != null && (p.patch.orden < 1 || p.patch.orden > TERPENE_ACTIVE_LIMIT)) {
      perPatchErrors.push({ handle: p.handle, error: `orden fuera de rango (1..${TERPENE_ACTIVE_LIMIT})` });
      continue;
    }
  }
  if (perPatchErrors.length > 0) {
    return { saved: [], errors: perPatchErrors };
  }

  const upsert = sqlite.prepare(`
    INSERT INTO terpene_catalog_edits (handle, tipo, estado, orden, mascota_url, perfil_sabor, updated_at)
    VALUES (@handle, @tipo, @estado, @orden, @mascota_url, @perfil_sabor, @updated_at)
    ON CONFLICT(handle) DO UPDATE SET
      tipo         = COALESCE(excluded.tipo,         terpene_catalog_edits.tipo),
      estado       = COALESCE(excluded.estado,       terpene_catalog_edits.estado),
      orden        = CASE WHEN excluded.estado = 'Agotado' THEN NULL
                          WHEN excluded.orden IS NOT NULL THEN excluded.orden
                          ELSE terpene_catalog_edits.orden END,
      mascota_url  = COALESCE(excluded.mascota_url,  terpene_catalog_edits.mascota_url),
      perfil_sabor = COALESCE(excluded.perfil_sabor, terpene_catalog_edits.perfil_sabor),
      updated_at   = excluded.updated_at
  `);

  try {
    sqlite.transaction(() => {
      for (const p of patches) {
        upsert.run({
          handle: p.handle,
          tipo: p.patch.tipo ?? null,
          estado: p.patch.estado ?? null,
          orden: p.patch.estado === 'Agotado' ? null : (p.patch.orden ?? null),
          mascota_url: p.patch.mascotaUrl ?? null,
          perfil_sabor: p.patch.perfilSabor ?? null,
          updated_at: now,
        });
      }
      const after = listTerpeneCatalog(sqlite);
      const v = validateCatalog(after);
      if (v) throw new Error(v);
    })();
  } catch (err) {
    return { saved: [], errors: [{ handle: '*', error: err instanceof Error ? err.message : 'batch_failed' }] };
  }

  const saved = patches
    .map(p => getTerpeneByHandle(sqlite, p.handle))
    .filter((e): e is TerpeneCatalogEntry => e != null);
  return { saved, errors: [] };
}

/** Drop all local edits and revert to the PDF baseline. */
export function resetTerpeneCatalog(sqlite: Database.Database): { cleared: number } {
  ensureTerpeneCatalogSchema(sqlite);
  const info = sqlite.prepare('DELETE FROM terpene_catalog_edits').run();
  return { cleared: info.changes };
}

/**
 * Build a preview of the Shopify Admin GraphQL mutation payload that *would*
 * be sent for every locally-edited terpene. The actual mutation is
 * `metaobjectUpdate` (Admin API 2024-01). We don't have IDs locally, so we
 * surface the handle as the lookup hint — the future backend proxy will
 * resolve `handle → id` before sending.
 *
 * Returns a payload object per dirty handle. No token, no network call.
 */
export function buildShopifyMutationPreview(sqlite: Database.Database): Array<{
  handle: string;
  nombre: string;
  estado: TerpeneEstado;
  orden: number | null;
  mutation: string;
  variables: {
    handle: { type: string; handle: string };
    metaobject: {
      fields: Array<{ key: string; value: string }>;
    };
  };
}> {
  const entries = listTerpeneCatalog(sqlite).filter(e => e.dirty);
  return entries.map(e => {
    const fields: Array<{ key: string; value: string }> = [
      { key: 'estado', value: e.estado },
    ];
    if (e.orden != null) fields.push({ key: 'orden', value: String(e.orden) });
    if (e.tipo) fields.push({ key: 'tipo', value: e.tipo });
    if (e.mascotaUrl) fields.push({ key: 'mascota', value: e.mascotaUrl });
    if (e.perfilSabor) fields.push({ key: 'perfil_sabor', value: e.perfilSabor });
    return {
      handle: e.handle,
      nombre: e.nombre,
      estado: e.estado,
      orden: e.orden,
      // metaobjectUpdate using handle lookup (Shopify Admin API 2024-01).
      // The proxy will need an MetaobjectHandleInput { type, handle } argument.
      mutation: [
        'mutation TerpeneMetaobjectUpdate($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpdateInput!) {',
        '  metaobjectUpdateByHandle(handle: $handle, metaobject: $metaobject) {',
        '    metaobject { id handle updatedAt }',
        '    userErrors { field message code }',
        '  }',
        '}',
      ].join('\n'),
      variables: {
        handle: { type: 'terpeno', handle: e.handle },
        metaobject: { fields },
      },
    };
  });
}
