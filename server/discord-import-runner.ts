import fs from 'node:fs';
import path from 'node:path';
import type { DiscordImportResult } from '@shared/schema';
import { parseDiscordExport, mimeFromFileName, type DiscordExport } from './discord-import';
import type { DatabaseStorage } from './storage';

/**
 * Parse + (optionally) insert a DiscordChatExporter JSON export.
 * `mediaBaseDir` is set by the CLI importer: when the export was made with
 * `--media`, attachment URLs are relative file paths that we copy into
 * DATA_DIR/attachments so the receipts don't expire.
 */
export async function runDiscordImport(
  storage: DatabaseStorage,
  payload: DiscordExport,
  options: { dryRun: boolean; capturedBy?: string; mediaBaseDir?: string },
): Promise<DiscordImportResult> {
  const parsed = parseDiscordExport(payload, storage.existingSourceRefs('discord'));
  let imported = 0;
  if (!options.dryRun) {
    for (const candidate of parsed.candidates) {
      if (candidate.duplicate) continue;
      const id = `discord-${candidate.sourceRef}`;
      const inserted = storage.insertDraft({
        id,
        date: candidate.date,
        category: 'Sin categoría',
        description: candidate.rawText.split('\n')[0].slice(0, 140) || 'Gasto desde Discord',
        // USD: keep the original amount; COP amount stays 0 until a TRM is entered.
        amount: candidate.currency === 'COP' ? candidate.amount ?? 0 : 0,
        currency: candidate.currency,
        originalAmount: candidate.currency === 'USD' ? candidate.amount : null,
        paidWith: candidate.paidWith,
        paidBy: candidate.author,
        brand: candidate.brand,
        status: 'capturado',
        source: 'discord',
        sourceRef: candidate.sourceRef,
        rawText: candidate.rawText,
        notes: candidate.currency === 'USD' && candidate.amount
          ? `Monto detectado en USD: ${candidate.amount}. Completa la TRM al revisar.`
          : candidate.confidence === 'baja' ? 'No se detectó monto en el mensaje.' : undefined,
        capturedBy: options.capturedBy,
      });
      if (!inserted) continue;
      imported += 1;
      for (const url of candidate.attachmentUrls) {
        const fileName = decodeURIComponent(url.split('?')[0].split(/[\\/]/).pop() || 'adjunto');
        const isRemote = /^https?:\/\//i.test(url);
        const localPath = !isRemote && options.mediaBaseDir ? path.resolve(options.mediaBaseDir, decodeURIComponent(url)) : null;
        if (localPath && fs.existsSync(localPath)) {
          storage.addAttachmentFromFile(id, localPath, fileName, mimeFromFileName(fileName));
        } else if (isRemote) {
          await storage.addExternalAttachment(id, fileName, url, mimeFromFileName(fileName));
        }
      }
    }
  }
  return { ...parsed, imported, dryRun: options.dryRun };
}
