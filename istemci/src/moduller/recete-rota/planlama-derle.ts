import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Plan motorunun betikleri testler için tek metin olarak okunur. Motor sunucuyla tek kaynaktır (ADR 0018): sunucu modülünün klasöründen okunur.
// Kaynaklar .betik uzantılıdır: lint uygulama kodu için kuruludur, motorun bağlamda koşan betiği için değil.

const MODUL = dirname(fileURLToPath(import.meta.url));
export const MOTOR = resolve(MODUL, '..', '..', '..', '..', 'sunucu', 'moduller', 'plan', 'motor');

// emirler: sunucunun emir, ürün ve rotası kaydın üstüne (sunucuKaydi).
export function planlamaMotoru(kok: string = MOTOR): string {
  return ['engine', 'kisitlar', 'girdi', 'durum', 'emirler'].map((m) => readFileSync(join(kok, `${m}.betik`), 'utf8')).join('\n');
}
