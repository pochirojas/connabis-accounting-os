// Central place for every filesystem path the server touches.
//
// DATA_DIR holds everything that is NOT source code: the SQLite database,
// Material Manager CSV exports, purchase-order CSVs and expense attachments.
// On a host with an ephemeral disk (Render, Railway…) point DATA_DIR at a
// mounted persistent disk, e.g. DATA_DIR=/var/data.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'data.db'));

// Material Manager exports (drop the CSVs downloaded from the MM app here).
export const MM_MATERIALS_CSV = path.join(DATA_DIR, 'material-manager-export.csv');
export const MM_BOM_CSV = path.join(DATA_DIR, 'material-manager-export-material-product.csv');
// Purchase orders exported from MM: purchase_order_po<N>.csv
export const PO_CSV_DIR = DATA_DIR;

// Files versioned with the repo.
export const HISTORICAL_EXPENSES_JSON = path.join(ROOT, 'server', 'data', 'historical-expenses.json');

// Receipts / invoices uploaded from the capture form.
export const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
