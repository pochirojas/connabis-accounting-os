import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessAmount, guessBrand, guessPaidWith, parseDiscordExport, toBogotaDate } from '../discord-import';

test('guessAmount — Colombian formats', () => {
  assert.deepEqual(guessAmount('frascos $45.000 nequi'), { amount: 45000, currency: 'COP', confidence: 'alta' });
  assert.deepEqual(guessAmount('etiquetas 120k'), { amount: 120000, currency: 'COP', confidence: 'alta' });
  assert.deepEqual(guessAmount('envío 18 mil'), { amount: 18000, currency: 'COP', confidence: 'alta' });
  assert.deepEqual(guessAmount('destilado 1,5 millones'), { amount: 1500000, currency: 'COP', confidence: 'alta' });
  assert.deepEqual(guessAmount('pago imprenta 350000'), { amount: 350000, currency: 'COP', confidence: 'media' });
  assert.deepEqual(guessAmount('adobe 22.99 usd'), { amount: 22.99, currency: 'USD', confidence: 'alta' });
  assert.equal(guessAmount('compré 2 frascos'), null);
  assert.equal(guessAmount('listo, ya pagué'), null);
});

test('guessPaidWith / guessBrand', () => {
  assert.equal(guessPaidWith('pagado con Nequi'), 'Nequi');
  assert.equal(guessPaidWith('tarjeta nu'), 'Nu Crédito');
  assert.equal(guessPaidWith('daviplata 20k'), 'Daviplata');
  assert.equal(guessBrand('bolsas para Turros'), 'turros');
  assert.equal(guessBrand('etiquetas connabis'), 'connabis');
  assert.equal(guessBrand('arriendo'), undefined);
});

test('toBogotaDate converts UTC late-night to previous local day', () => {
  assert.equal(toBogotaDate('2026-05-02T03:30:00+00:00'), '2026-05-01');
});

test('parseDiscordExport skips bots/empty and flags duplicates', () => {
  const result = parseDiscordExport({
    guild: { name: 'Connabis' },
    channel: { name: 'gastos' },
    messages: [
      { id: '1', type: 'Default', timestamp: '2026-05-01T15:00:00Z', content: 'frascos $45.000', author: { name: 'simon' } },
      { id: '2', type: 'Default', timestamp: '2026-05-01T15:00:00Z', content: '', author: { name: 'simon' } },
      { id: '3', type: 'Default', timestamp: '2026-05-01T15:00:00Z', content: 'bot', author: { name: 'b', isBot: true } },
      { id: '4', type: 'Default', timestamp: '2026-05-01T15:00:00Z', content: '', author: { name: 'edison' }, attachments: [{ url: 'https://cdn/x.jpg' }] },
      { id: '5', type: 'Default', timestamp: '2026-05-01T15:00:00Z', content: 'envío 20k', author: { name: 'edison' } },
    ],
  }, new Set(['5']));
  assert.equal(result.candidates.length, 3);
  assert.equal(result.skippedNoContent, 2);
  assert.equal(result.skippedDuplicates, 1);
  assert.equal(result.candidates.find(c => c.sourceRef === '4')?.confidence, 'baja');
});
