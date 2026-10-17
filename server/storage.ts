import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { users } from '@shared/schema';
import type {
  AttachmentUpload,
  CashAccount,
  CashAccountId,
  CloseChecklistItem,
  DocumentType,
  Expense,
  ExpenseAttachment,
  ExpenseBrand,
  ExpenseSource,
  ExpenseStatus,
  InsertExpense,
  InsertUser,
  UpdateExpense,
  User,
} from '@shared/schema';
import { BOOKED_EXPENSE_STATUSES } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { ATTACHMENTS_DIR, DB_PATH, HISTORICAL_EXPENSES_JSON } from './config';
import { ensureMaterialManagerMirrorSchema } from './material-manager-mirror';
import { ensureMmPurchaseOrdersImported } from './material-manager-purchase-orders';

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
ensureMaterialManagerMirrorSchema(sqlite);
// Real MM purchase orders — auto-import from CSV on first run.
ensureMmPurchaseOrdersImported(sqlite);

sqlite.exec(`
-- Legacy tables (kept read-only so the one-time migration can read them).
CREATE TABLE IF NOT EXISTS manual_expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_to TEXT,
  paid_with TEXT,
  currency TEXT NOT NULL DEFAULT 'COP',
  original_amount REAL,
  fx_rate REAL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS expense_overrides (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_to TEXT,
  paid_with TEXT,
  currency TEXT NOT NULL DEFAULT 'COP',
  original_amount REAL,
  fx_rate REAL,
  notes TEXT,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Unified expenses table.
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Sin categoría',
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'COP',
  original_amount REAL,
  fx_rate REAL,
  paid_to TEXT,
  supplier_nit TEXT,
  paid_with TEXT,
  paid_by TEXT,
  brand TEXT,
  document_type TEXT,
  document_number TEXT,
  cufe TEXT,
  iva REAL,
  retefuente REAL,
  tax REAL,
  has_invoice INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'capturado',
  dataico_ref TEXT,
  source TEXT NOT NULL,
  source_ref TEXT,
  raw_text TEXT,
  notes TEXT,
  captured_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_source_ref ON expenses(source, source_ref) WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS expense_attachments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  stored_path TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON expense_attachments(expense_id);

CREATE TABLE IF NOT EXISTS app_migrations (
  id TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS close_checklist_status (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_cogs_overrides (
  id TEXT PRIMARY KEY,
  match_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  unit_cost_cop INTEGER NOT NULL,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_cogs_overrides_active
  ON manual_cogs_overrides(active);
`);
sqlite.pragma('foreign_keys = ON');

const manualExpenseColumns = sqlite.prepare(`PRAGMA table_info(manual_expenses)`).all() as Array<{ name: string }>;
if (!manualExpenseColumns.some(column => column.name === 'notes')) {
  sqlite.exec(`ALTER TABLE manual_expenses ADD COLUMN notes TEXT`);
}

export const db = drizzle(sqlite);

// ---------------------------------------------------------------------------
// One-time migration: historical sheet JSON + legacy manual_expenses +
// expense_overrides → unified `expenses` table.
// ---------------------------------------------------------------------------
function runOnce(id: string, fn: () => void) {
  const done = sqlite.prepare('SELECT 1 FROM app_migrations WHERE id = ?').get(id);
  if (done) return;
  sqlite.transaction(() => {
    fn();
    sqlite.prepare('INSERT INTO app_migrations (id, ran_at) VALUES (?, ?)').run(id, new Date().toISOString());
  })();
}

const INSERT_EXPENSE_SQL = `
  INSERT OR IGNORE INTO expenses
    (id, date, month, category, description, amount, currency, original_amount, fx_rate,
     paid_to, supplier_nit, paid_with, paid_by, brand, document_type, document_number, cufe,
     iva, retefuente, tax, has_invoice, status, dataico_ref, source, source_ref, raw_text,
     notes, captured_by, created_at, updated_at, reviewed_at)
  VALUES
    (@id, @date, @month, @category, @description, @amount, @currency, @originalAmount, @fxRate,
     @paidTo, @supplierNit, @paidWith, @paidBy, @brand, @documentType, @documentNumber, @cufe,
     @iva, @retefuente, @tax, @hasInvoice, @status, @dataicoRef, @source, @sourceRef, @rawText,
     @notes, @capturedBy, @createdAt, @updatedAt, @reviewedAt)
`;

type ExpenseRowInput = {
  id: string; date: string; category?: string; description?: string; amount: number;
  currency?: string; originalAmount?: number | null; fxRate?: number | null;
  paidTo?: string | null; supplierNit?: string | null; paidWith?: string | null; paidBy?: string | null;
  brand?: string | null; documentType?: string | null; documentNumber?: string | null; cufe?: string | null;
  iva?: number | null; retefuente?: number | null; tax?: number | null; hasInvoice?: boolean;
  status: ExpenseStatus; dataicoRef?: string | null; source: ExpenseSource; sourceRef?: string | null;
  rawText?: string | null; notes?: string | null; capturedBy?: string | null;
  createdAt?: string; updatedAt?: string; reviewedAt?: string | null;
};

function toRowParams(e: ExpenseRowInput) {
  const now = new Date().toISOString();
  return {
    id: e.id,
    date: e.date,
    month: e.date.slice(0, 7),
    category: e.category?.trim() || 'Sin categoría',
    description: e.description?.trim() || '',
    amount: Math.round(Number(e.amount || 0) * 100) / 100,
    currency: e.currency === 'USD' ? 'USD' : 'COP',
    originalAmount: e.originalAmount ?? null,
    fxRate: e.fxRate ?? null,
    paidTo: e.paidTo?.trim() || null,
    supplierNit: e.supplierNit?.trim() || null,
    paidWith: e.paidWith?.trim() || null,
    paidBy: e.paidBy?.trim() || null,
    brand: e.brand || null,
    documentType: e.documentType || null,
    documentNumber: e.documentNumber?.trim() || null,
    cufe: e.cufe?.trim() || null,
    iva: e.iva ?? null,
    retefuente: e.retefuente ?? null,
    tax: e.tax ?? null,
    hasInvoice: e.hasInvoice ? 1 : 0,
    status: e.status,
    dataicoRef: e.dataicoRef?.trim() || null,
    source: e.source,
    sourceRef: e.sourceRef ?? null,
    rawText: e.rawText ?? null,
    notes: e.notes?.trim() || null,
    capturedBy: e.capturedBy ?? null,
    createdAt: e.createdAt ?? now,
    updatedAt: e.updatedAt ?? now,
    reviewedAt: e.reviewedAt ?? null,
  };
}

runOnce('2026-10-unify-expenses', () => {
  const insert = sqlite.prepare(INSERT_EXPENSE_SQL);
  const overrides = new Map(
    (sqlite.prepare('SELECT * FROM expense_overrides').all() as Array<Record<string, any>>).map(row => [String(row.id), row]),
  );
  // 1. Historical sheet rows.
  if (fs.existsSync(HISTORICAL_EXPENSES_JSON)) {
    const payload = JSON.parse(fs.readFileSync(HISTORICAL_EXPENSES_JSON, 'utf-8')) as { expenses?: Array<Record<string, any>> };
    // The old sheet export reused 4 IDs for different expenses (e.g. two
    // unrelated rows both called sheet-expense-91). Give repeats a suffix so
    // every row survives; legacy overrides only ever matched the first one.
    const seenIds = new Set<string>();
    for (const original of payload.expenses ?? []) {
      let rowId = String(original.id);
      const isRepeat = seenIds.has(rowId);
      for (let n = 2; seenIds.has(rowId); n += 1) rowId = `${original.id}-${n}`;
      seenIds.add(rowId);
      const raw: Record<string, any> = { ...original, id: rowId };
      const o = isRepeat ? undefined : overrides.get(String(original.id));
      const merged: Record<string, any> = o
        ? { ...raw, date: o.date, category: o.category, description: o.description, amount: o.amount,
            paidTo: o.paid_to, paidWith: o.paid_with, currency: o.currency, originalAmount: o.original_amount,
            fxRate: o.fx_rate, notes: o.notes }
        : raw;
      insert.run(toRowParams({
        id: String(merged.id),
        date: String(merged.date),
        category: merged.category,
        description: merged.description,
        amount: Number(merged.amount),
        currency: merged.currency,
        originalAmount: merged.currency === 'USD' ? Number(merged.originalAmount) : null,
        fxRate: merged.currency === 'USD' ? Number(merged.fxRate) : null,
        paidTo: merged.paidTo,
        paidWith: merged.paidWith,
        paidBy: merged.paidBy,
        tax: merged.tax ? Number(merged.tax) : null,
        notes: merged.notes,
        status: 'historico',
        source: 'sheet',
        sourceRef: String(merged.id),
      }));
    }
  }
  // 2. Legacy manual expenses (already checked by a person when typed in).
  for (const row of sqlite.prepare('SELECT * FROM manual_expenses').all() as Array<Record<string, any>>) {
    insert.run(toRowParams({
      id: String(row.id),
      date: String(row.date),
      category: row.category,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      originalAmount: row.original_amount,
      fxRate: row.fx_rate,
      paidTo: row.paid_to,
      paidWith: row.paid_with,
      notes: row.notes,
      status: 'revisado',
      source: 'manual',
      createdAt: row.created_at,
      reviewedAt: row.created_at,
    }));
  }
});

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------
function rowToAttachment(row: Record<string, any>): ExpenseAttachment {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    url: row.stored_path ? `/api/attachments/${row.id}` : String(row.external_url ?? ''),
    external: !row.stored_path,
    createdAt: String(row.created_at),
  };
}

function opt<T>(value: unknown, map: (v: any) => T = v => v as T): T | undefined {
  return value === null || value === undefined || value === '' ? undefined : map(value);
}

function rowToExpense(row: Record<string, any>, attachments: ExpenseAttachment[] = []): Expense {
  return {
    id: String(row.id),
    date: String(row.date),
    month: String(row.month),
    category: String(row.category),
    description: String(row.description ?? ''),
    amount: Number(row.amount),
    currency: row.currency === 'USD' ? 'USD' : 'COP',
    originalAmount: opt(row.original_amount, Number),
    fxRate: opt(row.fx_rate, Number),
    paidTo: opt(row.paid_to, String),
    supplierNit: opt(row.supplier_nit, String),
    paidWith: opt(row.paid_with, String),
    paidBy: opt(row.paid_by, String),
    brand: opt(row.brand, v => v as ExpenseBrand),
    documentType: opt(row.document_type, v => v as DocumentType),
    documentNumber: opt(row.document_number, String),
    cufe: opt(row.cufe, String),
    iva: opt(row.iva, Number),
    retefuente: opt(row.retefuente, Number),
    tax: opt(row.tax, Number),
    hasInvoice: Number(row.has_invoice) === 1,
    status: row.status as ExpenseStatus,
    dataicoRef: opt(row.dataico_ref, String),
    source: row.source as ExpenseSource,
    sourceRef: opt(row.source_ref, String),
    rawText: opt(row.raw_text, String),
    notes: opt(row.notes, String),
    capturedBy: opt(row.captured_by, String),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    attachments,
  };
}

function normalizeAmounts(expense: { currency?: string; amount: number; originalAmount?: number; fxRate?: number }) {
  const currency = expense.currency === 'USD' ? 'USD' : 'COP';
  if (currency === 'USD') {
    const original = Number(expense.originalAmount ?? expense.amount);
    const fx = Number(expense.fxRate ?? 0);
    if (!fx || fx <= 0) throw new Error('Los gastos USD requieren una TRM válida.');
    return { currency, amount: Math.round(original * fx * 100) / 100, originalAmount: original, fxRate: fx };
  }
  const amount = Number(expense.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000_000) throw new Error('Monto de gasto inválido.');
  return { currency, amount: Math.round(amount * 100) / 100, originalAmount: null, fxRate: null };
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif',
  'application/pdf': '.pdf', 'application/xml': '.xml', 'text/xml': '.xml', 'application/zip': '.zip',
};
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Cash accounts — balances are typed in from the latest statement.
// They are NOT auto-adjusted by expenses (that caused drift / double counting).
// ---------------------------------------------------------------------------
const CASH_ACCOUNT_DEFS: Omit<CashAccount, 'amount'>[] = [
  { id: 'nequi', label: 'Nequi', type: 'asset', description: 'Cuenta Nequi usada por la empresa.' },
  { id: 'nequi_wompi', label: 'Nequi Edison (desembolsos Wompi)', type: 'asset', description: 'Nequi donde Wompi desembolsa las ventas con tarjeta.' },
  { id: 'nu_debit', label: 'Nu cuenta', type: 'asset', description: 'Saldo disponible en la cuenta Nu.' },
  { id: 'daviplata', label: 'Daviplata', type: 'asset', description: 'Saldo disponible en Daviplata.' },
  { id: 'bancolombia', label: 'Bancolombia (51 Industries)', type: 'asset', description: 'Cuenta empresarial — en apertura.' },
  { id: 'efectivo', label: 'Efectivo', type: 'asset', description: 'Caja menor física.' },
  { id: 'wompi_pending', label: 'Wompi por desembolsar', type: 'pending_asset', description: 'Ventas cobradas en Wompi que aún no llegan a Nequi.' },
  { id: 'mercado_pago', label: 'Mercado Pago', type: 'pending_asset', description: 'Pasarela anterior — saldo remanente si existe.' },
  { id: 'nu_credit_card_debt', label: 'Deuda tarjeta Nu', type: 'liability', description: 'Saldo adeudado en la tarjeta de crédito Nu.' },
];

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listExpenses(options?: { statuses?: ExpenseStatus[] }): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense, meta: { source: ExpenseSource; status: ExpenseStatus; capturedBy?: string; hasInvoice?: boolean; sourceRef?: string; rawText?: string }): Promise<Expense>;
  updateExpense(id: string, expense: UpdateExpense): Promise<Expense | undefined>;
  setExpenseStatus(id: string, status: ExpenseStatus): Promise<Expense | undefined>;
  addAttachment(expenseId: string, upload: AttachmentUpload): Promise<ExpenseAttachment>;
  addExternalAttachment(expenseId: string, fileName: string, url: string, mimeType?: string): Promise<ExpenseAttachment>;
  getAttachmentFile(id: string): Promise<{ path: string; fileName: string; mimeType: string } | undefined>;
  mergeCloseChecklist(seedItems: CloseChecklistItem[]): Promise<CloseChecklistItem[]>;
  updateCloseChecklistStatus(id: string, status: CloseChecklistItem['status']): Promise<void>;
  listCashAccounts(): Promise<CashAccount[]>;
  updateCashAccount(id: CashAccountId, amount: number): Promise<CashAccount | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  private attachmentsByExpense(ids?: string[]): Map<string, ExpenseAttachment[]> {
    const rows = (ids && ids.length <= 500
      ? sqlite.prepare(`SELECT * FROM expense_attachments WHERE expense_id IN (${ids.map(() => '?').join(',') || "''"}) ORDER BY created_at`).all(...ids)
      : sqlite.prepare('SELECT * FROM expense_attachments ORDER BY created_at').all()) as Array<Record<string, any>>;
    const map = new Map<string, ExpenseAttachment[]>();
    for (const row of rows) {
      const list = map.get(String(row.expense_id)) ?? [];
      list.push(rowToAttachment(row));
      map.set(String(row.expense_id), list);
    }
    return map;
  }

  async listExpenses(options: { statuses?: ExpenseStatus[] } = {}): Promise<Expense[]> {
    const statuses = options.statuses ?? BOOKED_EXPENSE_STATUSES;
    const rows = sqlite.prepare(`
      SELECT * FROM expenses
      WHERE status IN (${statuses.map(() => '?').join(',')})
      ORDER BY date DESC, created_at DESC
    `).all(...statuses) as Array<Record<string, any>>;
    const attachments = this.attachmentsByExpense(rows.map(row => String(row.id)));
    return rows.map(row => rowToExpense(row, attachments.get(String(row.id)) ?? []));
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const row = sqlite.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!row) return undefined;
    return rowToExpense(row, this.attachmentsByExpense([id]).get(id) ?? []);
  }

  async createExpense(
    expense: InsertExpense,
    meta: { source: ExpenseSource; status: ExpenseStatus; capturedBy?: string; hasInvoice?: boolean; sourceRef?: string; rawText?: string },
  ): Promise<Expense> {
    const id = `${meta.source}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const amounts = normalizeAmounts(expense);
    const now = new Date().toISOString();
    sqlite.prepare(INSERT_EXPENSE_SQL).run(toRowParams({
      ...expense,
      ...amounts,
      id,
      status: meta.status,
      source: meta.source,
      sourceRef: meta.sourceRef,
      rawText: meta.rawText,
      capturedBy: meta.capturedBy,
      hasInvoice: meta.hasInvoice ?? expense.documentType === 'factura_electronica',
      reviewedAt: meta.status === 'capturado' ? null : now,
    }));
    return (await this.getExpense(id))!;
  }

  /** Raw insert used by importers (allows amount 0 for drafts without a detected amount). */
  insertDraft(row: ExpenseRowInput): boolean {
    const result = sqlite.prepare(INSERT_EXPENSE_SQL).run(toRowParams(row));
    return result.changes > 0;
  }

  existingSourceRefs(source: ExpenseSource): Set<string> {
    const rows = sqlite.prepare('SELECT source_ref FROM expenses WHERE source = ? AND source_ref IS NOT NULL').all(source) as Array<{ source_ref: string }>;
    return new Set(rows.map(row => row.source_ref));
  }

  async updateExpense(id: string, expense: UpdateExpense): Promise<Expense | undefined> {
    const existing = await this.getExpense(id);
    if (!existing) return undefined;
    // Fields the client omitted (undefined) keep their stored value, so older
    // forms that don't know about brand / NIT / DIAN fields never wipe them.
    const keep = <K extends keyof UpdateExpense>(key: K) =>
      (expense[key] === undefined ? (existing as Record<string, unknown>)[key as string] : expense[key]) as UpdateExpense[K];
    expense = {
      ...expense,
      brand: keep('brand'), supplierNit: keep('supplierNit'), documentType: keep('documentType'),
      documentNumber: keep('documentNumber'), cufe: keep('cufe'), iva: keep('iva'),
      retefuente: keep('retefuente'), dataicoRef: keep('dataicoRef'), paidBy: keep('paidBy'),
    };
    const amounts = normalizeAmounts(expense);
    const nextStatus = expense.status ?? existing.status ?? 'revisado';
    const now = new Date().toISOString();
    sqlite.prepare(`
      UPDATE expenses SET
        date = @date, month = @month, category = @category, description = @description,
        amount = @amount, currency = @currency, original_amount = @originalAmount, fx_rate = @fxRate,
        paid_to = @paidTo, supplier_nit = @supplierNit, paid_with = @paidWith, paid_by = @paidBy,
        brand = @brand, document_type = @documentType, document_number = @documentNumber, cufe = @cufe,
        iva = @iva, retefuente = @retefuente, has_invoice = @hasInvoice, status = @status,
        dataico_ref = @dataicoRef, notes = @notes, updated_at = @updatedAt,
        reviewed_at = COALESCE(reviewed_at, @reviewedAt)
      WHERE id = @id
    `).run({
      ...toRowParams({
        ...expense,
        ...amounts,
        id,
        paidBy: expense.paidBy ?? existing.paidBy,
        status: nextStatus,
        source: existing.source,
        hasInvoice: expense.documentType === 'factura_electronica' || Boolean(existing.hasInvoice),
      }),
      updatedAt: now,
      reviewedAt: nextStatus === 'capturado' ? null : now,
    });
    return this.getExpense(id);
  }

  async setExpenseStatus(id: string, status: ExpenseStatus): Promise<Expense | undefined> {
    const existing = await this.getExpense(id);
    if (!existing) return undefined;
    if (status !== 'capturado' && status !== 'descartado' && !(existing.amount > 0)) {
      throw new Error('El gasto necesita un monto mayor a 0 antes de aprobarlo.');
    }
    const now = new Date().toISOString();
    sqlite.prepare(`
      UPDATE expenses SET status = ?, updated_at = ?, reviewed_at = CASE WHEN ? = 'capturado' THEN NULL ELSE COALESCE(reviewed_at, ?) END
      WHERE id = ?
    `).run(status, now, status, now, id);
    return this.getExpense(id);
  }

  async addAttachment(expenseId: string, upload: AttachmentUpload): Promise<ExpenseAttachment> {
    const buffer = Buffer.from(upload.dataBase64.replace(/^data:[^,]+,/, ''), 'base64');
    if (!buffer.length) throw new Error('Archivo vacío.');
    if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Archivo demasiado grande (máx. 10 MB).');
    const id = `att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = EXTENSION_BY_MIME[upload.mimeType] ?? path.extname(upload.fileName).slice(0, 6);
    const month = new Date().toISOString().slice(0, 7);
    const dir = path.join(ATTACHMENTS_DIR, month);
    fs.mkdirSync(dir, { recursive: true });
    const storedPath = path.join(month, `${id}${ext}`);
    fs.writeFileSync(path.join(ATTACHMENTS_DIR, storedPath), buffer);
    const createdAt = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO expense_attachments (id, expense_id, file_name, mime_type, stored_path, external_url, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
    `).run(id, expenseId, upload.fileName.slice(0, 200), upload.mimeType, storedPath, createdAt);
    return rowToAttachment({ id, expense_id: expenseId, file_name: upload.fileName, mime_type: upload.mimeType, stored_path: storedPath, created_at: createdAt });
  }

  /** Copy a file that already exists on disk (used by the Discord CLI importer). */
  addAttachmentFromFile(expenseId: string, sourcePath: string, fileName: string, mimeType: string): ExpenseAttachment {
    const id = `att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = path.extname(fileName).slice(0, 6) || EXTENSION_BY_MIME[mimeType] || '';
    const dir = path.join(ATTACHMENTS_DIR, 'discord');
    fs.mkdirSync(dir, { recursive: true });
    const storedPath = path.join('discord', `${id}${ext}`);
    fs.copyFileSync(sourcePath, path.join(ATTACHMENTS_DIR, storedPath));
    const createdAt = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO expense_attachments (id, expense_id, file_name, mime_type, stored_path, external_url, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
    `).run(id, expenseId, fileName.slice(0, 200), mimeType, storedPath, createdAt);
    return rowToAttachment({ id, expense_id: expenseId, file_name: fileName, mime_type: mimeType, stored_path: storedPath, created_at: createdAt });
  }

  async addExternalAttachment(expenseId: string, fileName: string, url: string, mimeType = 'application/octet-stream'): Promise<ExpenseAttachment> {
    const id = `att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO expense_attachments (id, expense_id, file_name, mime_type, stored_path, external_url, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `).run(id, expenseId, fileName.slice(0, 200), mimeType, url, createdAt);
    return rowToAttachment({ id, expense_id: expenseId, file_name: fileName, mime_type: mimeType, external_url: url, created_at: createdAt });
  }

  async getAttachmentFile(id: string) {
    const row = sqlite.prepare('SELECT * FROM expense_attachments WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!row?.stored_path) return undefined;
    const full = path.resolve(ATTACHMENTS_DIR, String(row.stored_path));
    if (!full.startsWith(path.resolve(ATTACHMENTS_DIR) + path.sep) || !fs.existsSync(full)) return undefined;
    return { path: full, fileName: String(row.file_name), mimeType: String(row.mime_type) };
  }

  async mergeCloseChecklist(seedItems: CloseChecklistItem[]): Promise<CloseChecklistItem[]> {
    const rows = sqlite.prepare('SELECT id, status FROM close_checklist_status').all() as Array<{ id: string; status: CloseChecklistItem['status'] }>;
    const statusById = new Map(rows.map(row => [row.id, row.status]));
    return seedItems.map(item => ({
      ...item,
      status: statusById.get(item.id) ?? item.status,
    }));
  }

  async updateCloseChecklistStatus(id: string, status: CloseChecklistItem['status']): Promise<void> {
    sqlite.prepare(`
      INSERT INTO close_checklist_status (id, status, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    `).run(id, status, new Date().toISOString());
  }

  async listCashAccounts(): Promise<CashAccount[]> {
    const rows = sqlite.prepare('SELECT id, amount, updated_at FROM cash_accounts').all() as Array<{ id: string; amount: number; updated_at: string }>;
    const byId = new Map(rows.map(row => [row.id, row]));
    return CASH_ACCOUNT_DEFS.map(def => ({
      ...def,
      amount: Number(byId.get(def.id)?.amount ?? 0),
      updatedAt: byId.get(def.id)?.updated_at,
    }));
  }

  async updateCashAccount(id: CashAccountId, amount: number): Promise<CashAccount | undefined> {
    if (!CASH_ACCOUNT_DEFS.some(def => def.id === id)) return undefined;
    sqlite.prepare(`
      INSERT INTO cash_accounts (id, amount, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
    `).run(id, Math.round(amount), new Date().toISOString());
    return (await this.listCashAccounts()).find(account => account.id === id);
  }
}

export const storage = new DatabaseStorage();
