// Parses a DiscordChatExporter JSON export (https://github.com/Tyrrrz/DiscordChatExporter)
// into draft expenses. Every imported message lands in status `capturado`
// (review queue) — nothing goes straight into the P&L.
import type { DiscordImportCandidate, DiscordImportResult, ExpenseBrand } from '@shared/schema';

export type DiscordExport = {
  guild?: { name?: string };
  channel?: { name?: string; category?: string };
  messages?: DiscordMessage[];
};

export type DiscordMessage = {
  id: string;
  type?: string;
  timestamp: string;
  content?: string;
  author?: { id?: string; name?: string; nickname?: string; isBot?: boolean };
  attachments?: Array<{ id?: string; url: string; fileName?: string; fileSizeBytes?: number }>;
};

const TIME_ZONE = 'America/Bogota';

export function toBogotaDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  // en-CA formats as YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Parse a Colombian-style number: "45.000", "45,000", "1.250.000", "12,5", "45000". */
function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // whichever comes last is the decimal separator
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(s))) {
    s = s.replace(/\./g, '');
  } else if (commas > 1 || (commas === 1 && /,\d{3}$/.test(s))) {
    s = s.replace(/,/g, '');
  } else if (commas === 1) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type AmountGuess = { amount: number; currency: 'COP' | 'USD'; confidence: 'alta' | 'media' };

export function guessAmount(text: string): AmountGuess | null {
  const t = normalize(text);
  const isUsd = /\b(usd|us\$|dolares|dollars?)\b|u\$/.test(t);
  const currency: 'COP' | 'USD' = isUsd ? 'USD' : 'COP';
  const strong: number[] = [];
  const weak: number[] = [];
  const NUM = '(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';

  // $45.000 / $ 45000 / 45.000$ / cop 45000
  for (const m of t.matchAll(new RegExp(`(?:\\$|cop|usd|us\\$)\\s*${NUM}`, 'g'))) {
    const n = parseNumber(m[1]); if (n) strong.push(n);
  }
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(?:\\$|cop|usd|pesos|dolares)`, 'g'))) {
    const n = parseNumber(m[1]); if (n) strong.push(n);
  }
  // 45k / 45 mil / 1.2m / 1,5 millones / 2 palos
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(k|mil|m|millon(?:es)?|palos?|lucas?)\\b`, 'g'))) {
    const n = parseNumber(m[1]); if (!n) continue;
    const unit = m[2];
    const mult = unit === 'k' || unit === 'mil' || unit.startsWith('luca') ? 1_000 : 1_000_000;
    strong.push(n * mult);
  }
  // bare numbers: only accept values that look like money
  for (const m of t.matchAll(new RegExp(`(?<![\\w#/-])${NUM}(?![\\w%/-])`, 'g'))) {
    const n = parseNumber(m[1]); if (!n) continue;
    if (currency === 'COP' ? n >= 1_000 : n >= 1) weak.push(n);
  }
  const pick = (list: number[]) => list.sort((a, b) => b - a)[0];
  if (strong.length) return { amount: Math.round(pick(strong) * 100) / 100, currency, confidence: 'alta' };
  if (weak.length) return { amount: Math.round(pick(weak) * 100) / 100, currency, confidence: 'media' };
  return null;
}

export function guessPaidWith(text: string): string | undefined {
  const t = normalize(text);
  if (/daviplata/.test(t)) return 'Daviplata';
  if (/bancolombia/.test(t)) return 'Bancolombia';
  if (/wompi/.test(t)) return 'Nequi Edison (Wompi)';
  if (/nequi/.test(t)) return 'Nequi';
  if (/\bnu\b/.test(t) && /(credito|tarjeta|tc)\b/.test(t)) return 'Nu Crédito';
  if (/\bnu\b/.test(t)) return 'Nu Débito';
  if (/mercado ?pago/.test(t)) return 'Mercado Pago';
  if (/efectivo|cash/.test(t)) return 'Efectivo';
  return undefined;
}

export function guessBrand(text: string): ExpenseBrand | undefined {
  const t = normalize(text);
  const turros = /\bturros?\b/.test(t);
  const connabis = /\bconnabis\b/.test(t);
  if (turros && !connabis) return 'turros';
  if (connabis && !turros) return 'connabis';
  if (turros && connabis) return 'shared';
  return undefined;
}

export function parseDiscordExport(payload: DiscordExport, existingRefs: Set<string>): Omit<DiscordImportResult, 'imported' | 'dryRun'> {
  const messages = payload.messages ?? [];
  const channel = [payload.guild?.name, payload.channel?.name].filter(Boolean).join(' / ') || 'Discord';
  const candidates: DiscordImportCandidate[] = [];
  let skippedNoContent = 0;
  let skippedDuplicates = 0;
  for (const message of messages) {
    if (message.author?.isBot) { skippedNoContent += 1; continue; }
    if (message.type && !['Default', 'Reply'].includes(message.type)) { skippedNoContent += 1; continue; }
    const content = (message.content ?? '').trim();
    const attachments = message.attachments ?? [];
    if (!content && attachments.length === 0) { skippedNoContent += 1; continue; }
    const sourceRef = String(message.id);
    const duplicate = existingRefs.has(sourceRef);
    if (duplicate) skippedDuplicates += 1;
    const guess = guessAmount(content);
    candidates.push({
      sourceRef,
      date: toBogotaDate(message.timestamp),
      author: message.author?.nickname || message.author?.name || 'desconocido',
      rawText: content,
      amount: guess?.amount ?? null,
      currency: guess?.currency ?? 'COP',
      confidence: guess?.confidence ?? 'baja',
      paidWith: guessPaidWith(content),
      brand: guessBrand(`${content} ${channel}`),
      attachmentUrls: attachments.map(attachment => attachment.url),
      duplicate,
    });
  }
  return { channel, totalMessages: messages.length, candidates, skippedDuplicates, skippedNoContent };
}

export function mimeFromFileName(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
    pdf: 'application/pdf', xml: 'application/xml', zip: 'application/zip',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
}
