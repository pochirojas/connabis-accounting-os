import { users } from '@shared/schema';
import type { CashAccount, CloseChecklistItem, Expense, InsertExpense, User, InsertUser } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`
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
  created_at TEXT NOT NULL
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
`);

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listManualExpenses(): Promise<Expense[]>;
  createManualExpense(expense: InsertExpense): Promise<Expense>;
  deleteManualExpense(id: string): Promise<boolean>;
  mergeCloseChecklist(seedItems: CloseChecklistItem[]): Promise<CloseChecklistItem[]>;
  updateCloseChecklistStatus(id: string, status: CloseChecklistItem['status']): Promise<void>;
  listCashAccounts(): Promise<CashAccount[]>;
  updateCashAccount(id: CashAccount['id'], amount: number): Promise<CashAccount | undefined>;
}

const CASH_ACCOUNT_DEFS: Omit<CashAccount, 'amount'>[] = [
  { id: 'nequi', label: 'Balance Nequi', type: 'asset', description: 'Caja disponible inmediata en Nequi.' },
  { id: 'nu_debit', label: 'Balance Nu débito', type: 'asset', description: 'Caja disponible inmediata en cuenta Nu.' },
  { id: 'mercado_pago_released', label: 'Mercado Pago liberado', type: 'asset', description: 'Saldo Mercado Pago ya disponible para usar.' },
  { id: 'mercado_pago_unreleased', label: 'Mercado Pago no liberado', type: 'pending_asset', description: 'Saldo pendiente: cuenta para forecast, no para gastar hoy.' },
  { id: 'nu_credit_card_debt', label: 'Deuda credit card Nu', type: 'liability', description: 'Deuda a restar del efectivo para ver caja neta.' },
];

const CASH_ACCOUNT_DEFAULTS: Record<CashAccount['id'], number> = {
  nequi: 2_100_000,
  nu_debit: 1_750_000,
  mercado_pago_released: 3_400_000,
  mercado_pago_unreleased: 1_600_000,
  nu_credit_card_debt: 0,
};

function normalizePaidWith(value?: string | null): CashAccount['id'] | null {
  const text = (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('nequi')) return 'nequi';
  if (text.includes('nu') && text.includes('deb')) return 'nu_debit';
  if (text.includes('nu') && (text.includes('cred') || text.includes('credit'))) return 'nu_credit_card_debt';
  if (text.includes('mercado') && (text.includes('no liber') || text.includes('pend'))) return 'mercado_pago_unreleased';
  if (text.includes('mercado')) return 'mercado_pago_released';
  return null;
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

  async listManualExpenses(): Promise<Expense[]> {
    const rows = sqlite.prepare(`
      SELECT id, date, month, category, description, amount, paid_to, paid_with, currency, original_amount, fx_rate
      FROM manual_expenses
      ORDER BY date DESC, created_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: String(row.id),
      date: String(row.date),
      month: String(row.month),
      category: String(row.category),
      description: String(row.description),
      amount: Number(row.amount),
      paidTo: row.paid_to ? String(row.paid_to) : undefined,
      paidWith: row.paid_with ? String(row.paid_with) : undefined,
      currency: row.currency === 'USD' ? 'USD' : 'COP',
      originalAmount: row.original_amount === null || row.original_amount === undefined ? undefined : Number(row.original_amount),
      fxRate: row.fx_rate === null || row.fx_rate === undefined ? undefined : Number(row.fx_rate),
      source: 'manual',
    }));
  }

  async createManualExpense(expense: InsertExpense): Promise<Expense> {
    const id = `manual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const month = expense.date.slice(0, 7);
    const currency = expense.currency ?? 'COP';
    const originalAmount = currency === 'USD' ? Number(expense.originalAmount ?? expense.amount) : Number(expense.amount);
    const fxRate = currency === 'USD' ? Number(expense.fxRate ?? 0) : undefined;
    if (currency === 'USD' && (!fxRate || fxRate <= 0)) {
      throw new Error('Los gastos USD requieren una TRM válida.');
    }
    const amountCop = currency === 'USD' ? originalAmount * Number(fxRate) : Number(expense.amount);
    if (!Number.isFinite(amountCop) || amountCop <= 0 || amountCop > 500_000_000) {
      throw new Error('Monto de gasto inválido.');
    }
    const roundedAmount = Math.round(amountCop);
    sqlite.prepare(`
      INSERT INTO manual_expenses
        (id, date, month, category, description, amount, paid_to, paid_with, currency, original_amount, fx_rate, created_at)
      VALUES
        (@id, @date, @month, @category, @description, @amount, @paidTo, @paidWith, @currency, @originalAmount, @fxRate, @createdAt)
    `).run({
      id,
      date: expense.date,
      month,
      category: expense.category,
      description: expense.description,
      amount: roundedAmount,
      paidTo: expense.paidTo ?? null,
      paidWith: expense.paidWith ?? null,
      currency,
      originalAmount: currency === 'USD' ? originalAmount : null,
      fxRate: fxRate ?? null,
      createdAt: new Date().toISOString(),
    });
    this.applyExpenseToCash(expense.paidWith, roundedAmount, 'expense');

    return {
      id,
      date: expense.date,
      month,
      category: expense.category,
      description: expense.description,
      amount: roundedAmount,
      paidTo: expense.paidTo,
      paidWith: expense.paidWith,
      currency,
      originalAmount: currency === 'USD' ? originalAmount : undefined,
      fxRate,
      source: 'manual',
    };
  }

  async deleteManualExpense(id: string): Promise<boolean> {
    const row = sqlite.prepare('SELECT paid_with, amount FROM manual_expenses WHERE id = ?').get(id) as { paid_with?: string; amount?: number } | undefined;
    const result = sqlite.prepare('DELETE FROM manual_expenses WHERE id = ?').run(id);
    if (result.changes > 0 && row) {
      this.applyExpenseToCash(row.paid_with, Number(row.amount || 0), 'reversal');
    }
    return result.changes > 0;
  }

  private applyExpenseToCash(paidWith: string | undefined | null, amount: number, mode: 'expense' | 'reversal') {
    const accountId = normalizePaidWith(paidWith);
    if (!accountId || !Number.isFinite(amount) || amount <= 0) return;
    const account = this.listCashAccountsSync().find(item => item.id === accountId);
    if (!account) return;
    const direction = mode === 'expense' ? 1 : -1;
    const nextAmount = account.type === 'liability'
      ? account.amount + amount * direction
      : account.amount - amount * direction;
    this.upsertCashAmount(accountId, Math.max(0, Math.round(nextAmount)));
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
    return this.listCashAccountsSync();
  }

  private listCashAccountsSync(): CashAccount[] {
    const rows = sqlite.prepare('SELECT id, amount FROM cash_accounts').all() as Array<{ id: CashAccount['id']; amount: number }>;
    const amountById = new Map(rows.map(row => [row.id, row.amount]));
    return CASH_ACCOUNT_DEFS.map(def => ({
      ...def,
      amount: Number(amountById.get(def.id) ?? CASH_ACCOUNT_DEFAULTS[def.id]),
    }));
  }

  private upsertCashAmount(id: CashAccount['id'], amount: number) {
    sqlite.prepare(`
      INSERT INTO cash_accounts (id, amount, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
    `).run(id, Math.round(amount), new Date().toISOString());
  }

  async updateCashAccount(id: CashAccount['id'], amount: number): Promise<CashAccount | undefined> {
    const exists = CASH_ACCOUNT_DEFS.some(def => def.id === id);
    if (!exists) return undefined;
    this.upsertCashAmount(id, amount);
    return (await this.listCashAccounts()).find(account => account.id === id);
  }
}

export const storage = new DatabaseStorage();
