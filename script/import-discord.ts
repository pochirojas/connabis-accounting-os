// Import a DiscordChatExporter JSON export straight into the database.
//
//   npm run import-discord -- ./gastos.json            # preview only
//   npm run import-discord -- ./gastos.json --commit   # write to "Por revisar"
//
// If the export was made with --media, the downloaded files next to the JSON
// are copied into DATA_DIR/attachments (Discord CDN links expire).
import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../server/storage';
import { runDiscordImport } from '../server/discord-import-runner';

const file = process.argv[2];
const commit = process.argv.includes('--commit');
if (!file || !fs.existsSync(file)) {
  console.error('Uso: npm run import-discord -- <export.json> [--commit]');
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(file, 'utf-8'));
const result = await runDiscordImport(storage, payload, {
  dryRun: !commit,
  capturedBy: 'import-cli',
  mediaBaseDir: path.dirname(path.resolve(file)),
});
const fresh = result.candidates.filter(c => !c.duplicate);
console.log(`Canal: ${result.channel}`);
console.log(`Mensajes: ${result.totalMessages} · nuevos: ${fresh.length} · ya importados: ${result.skippedDuplicates} · ignorados: ${result.skippedNoContent}`);
console.log(`Confianza → alta: ${fresh.filter(c => c.confidence === 'alta').length}, media: ${fresh.filter(c => c.confidence === 'media').length}, sin monto: ${fresh.filter(c => c.confidence === 'baja').length}`);
for (const c of fresh.slice(0, 15)) {
  console.log(`  ${c.date}  ${c.author.padEnd(12).slice(0, 12)}  ${String(c.amount ?? '—').padStart(10)} ${c.currency}  ${c.rawText.replace(/\s+/g, ' ').slice(0, 60)}`);
}
console.log(commit ? `\nImportados: ${result.imported}` : '\nVista previa. Agrega --commit para importar.');
