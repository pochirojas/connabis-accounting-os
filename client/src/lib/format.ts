// Colombia locale + COP currency formatting helpers.

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export function formatCOP(value: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return cop.format(value);
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
