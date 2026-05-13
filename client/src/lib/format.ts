// Colombia locale + COP currency formatting helpers.

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

// Same currency style but keeps up to 2 decimals — used when the underlying value
// actually has a fractional part (e.g. 123.45). For whole-COP amounts we keep the
// existing zero-decimal display so historic rows look identical.
const copWithCents = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
// Quantity formatter: float-friendly, never rounds decimal quantities to 0.
// Up to 6 decimals, trailing zeros trimmed by Intl when minimumFractionDigits=0.
const numQty = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6, minimumFractionDigits: 0 });

export function formatCOP(value: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? cop.format(value) : copWithCents.format(value);
}

// Compact: 11.7M, 94.1M, 1.2K
export function formatCOPCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatNumber(value: number): string {
  return num.format(value);
}

export function formatDecimal(value: number): string {
  return num2.format(value);
}

// Format a material/BOM quantity. Quantities are ALWAYS floats — never rounded
// to int. Integer values render without decimals; fractional values render with
// up to 6 decimals (trailing zeros trimmed). Use this everywhere a quantity is
// shown so a 0.5 quantity does not display as "0" or "1".
export function formatQty(value: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numQty.format(value);
}

export function formatPct(value: number, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch { return iso; }
}
