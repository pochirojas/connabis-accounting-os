import type { AttachmentUpload, DocumentType, ExpenseBrand, ExpenseStatus } from '@shared/schema';
import { DOCUMENT_TYPE_LABELS, EXPENSE_BRAND_LABELS, EXPENSE_STATUS_LABELS } from '@shared/schema';

export const CATEGORY_OPTIONS = [
  'Materia prima', 'Empaque e insumos', 'Litografía y etiquetas', 'Inventario', 'Capex',
  'Marketing', 'Logística', 'Comisiones', 'Software', 'Impuestos', 'Gastos bancarios',
  'Servicios profesionales', 'Legal y registro', 'Nómina', 'Muestras', 'Reposiciones',
  'Operación', 'Otros', 'Sin categoría',
];

// Payment accounts actually in use (Oct 2026).
export const PAID_WITH_OPTIONS = [
  'Nequi', 'Nequi Edison (Wompi)', 'Nu Débito', 'Nu Crédito', 'Daviplata', 'Bancolombia',
  'Efectivo', 'Mercado Pago', 'Otro',
];

export const BRAND_OPTIONS = (Object.keys(EXPENSE_BRAND_LABELS) as ExpenseBrand[]).map(value => ({ value, label: EXPENSE_BRAND_LABELS[value] }));
export const DOCUMENT_OPTIONS = (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map(value => ({ value, label: DOCUMENT_TYPE_LABELS[value] }));
export const STATUS_OPTIONS = (Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map(value => ({ value, label: EXPENSE_STATUS_LABELS[value] }));

export function todayBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Convert a picked file into an upload payload. Photos are downscaled to ≤1800px JPEG. */
export async function fileToUpload(file: File): Promise<AttachmentUpload> {
  const isRasterImage = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (isRasterImage && file.size > 700_000) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/jpeg', 0.82));
      return { fileName: file.name.replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: await readAsDataUrl(blob) };
    } catch {
      // fall through to raw upload
    }
  }
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.name.toLowerCase().endsWith('.xml') ? 'application/xml' : 'application/octet-stream');
  return { fileName: file.name, mimeType, dataBase64: await readAsDataUrl(file) };
}

export function parseMoney(value: string): number {
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  // Colombian input: "45.000" or "45000" → 45000; "12,5" → 12.5
  const normalized = /\.\d{3}(\.|$)/.test(cleaned) || /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
