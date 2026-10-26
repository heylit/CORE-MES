import { ayarDuzelt, type OkumaAyari } from './kurallar.ts';
import { bitPaketle, type MetinOgesi, type OkumaIstatistigi, type OkumaTanisi, type OlcuListesi } from './okuma.ts';
import type { CizimAyarlari } from './ortam.tsx';

// Okuma ayarının cihazdaki kaydı ve PDF sayfa belleği (pdf.ts RCFG, PDFMEM). Kayıtlar eski ekranınkiyle aynı anahtar ve biçimdedir:
// cihazda 'arkon:readCfg', önbellekte 'pdf:<özet>#<sayfa><imza>'; iki ekran birbirinin okumasını kullanır.

export const cihazAyari = (cihaz: CizimAyarlari): OkumaAyari => ayarDuzelt(cihaz.oku('readCfg'));

// Sayfa kaydı: okuma sonucu, mürekkep haritası ve renklendirilmiş görüntüler (tema ve görünüş imzasıyla).
export interface PdfKaydi {
  w: number; h: number; pages: number; scale: number; items: MetinOgesi[]; junk: boolean; textless: boolean; cls: string;
  dims: OlcuListesi; stats?: OkumaIstatistigi; diag?: OkumaTanisi; ink: Uint8Array; png: Record<string, Blob>; pngLo?: Record<string, Blob>;
  enc: boolean; ms?: { render?: number; dims?: number; ocr?: number }; ocrDims?: OlcuListesi; ocrStats?: OkumaIstatistigi; ocrDiag?: OkumaTanisi;
}
export type SaklananPdfKaydi = Omit<PdfKaydi, 'ink'> & { inkBits: Uint8Array };

// Bellekte son altı sayfa; kalıcısı cihaz önbelleğinde (dosya özeti ve sayfa no).
export const PDF_BELLEGI = new Map<string, PdfKaydi>();
export function bellegeKoy(k: string, v: PdfKaydi): void {
  PDF_BELLEGI.delete(k); PDF_BELLEGI.set(k, v);
  while (PDF_BELLEGI.size > 6) { const ilk = PDF_BELLEGI.keys().next().value; if (ilk === undefined) break; PDF_BELLEGI.delete(ilk); }
}
export function saklanacak(C: PdfKaydi): SaklananPdfKaydi {
  const { ink, ...geri } = C;
  return { ...geri, inkBits: bitPaketle(ink) };
}

// "Ayarları bu cihazda kullan": kaydedilir, bellekteki sayfalar yeni ayarla yeniden okunur.
export function cihazAyariYaz(cihaz: CizimAyarlari, c: OkumaAyari): void {
  cihaz.yaz('readCfg', ayarDuzelt(c));
  PDF_BELLEGI.clear();
}
