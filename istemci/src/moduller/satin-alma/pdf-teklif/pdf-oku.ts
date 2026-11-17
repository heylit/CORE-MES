import { pdfAc, pdfCiz } from '../../../ortak/cizim/pdf.ts';
import type { Oge } from './okuma.ts';
import { belgeTani } from './tanima.ts';

// 3404: PDF bu bilgisayarda okunur. Önce yazı katmanı (pdf.js), yoksa sayfa görüntüsünden yazı tanıma (Tesseract). İkisi de
// Arkon'un yerel kitaplık dosyalarıdır (ortak/cizim/kitaplik.ts): dosya dışarı gönderilmez, dil verisi dışarıdan çekilmez.

export const AZAMI_SAYFA = 20;
export const AZAMI_BAYT = 25 * 1024 * 1024;
// Ekranda gösterilen sayfa çözünürlüğü (uzun kenar, piksel). Yazı tanıma daha ince okunur: A4'te yaklaşık 280 dpi.
const COZUNURLUK = 2000;
const TANIMA_COZUNURLUGU = 3300;
// Bu kadar okunabilir öğe yoksa sayfa taranmış sayılır.
const EN_AZ_OGE = 8;

export interface OkunanSayfa { no: number; w: number; h: number; resim: string; ogeler: Oge[]; tanima: boolean }
export interface Ilerleme { asama: 'acma' | 'metin' | 'tanima'; sayfa: number; sayfaSayisi: number; oran: number }

export class PdfOkumaHatasi extends Error {}

export function pdfImzasiVarMi(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

function resimYaz(img: ImageData): string {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  cv.getContext('2d')?.putImageData(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.85);
}

export async function pdfTeklifOku(
  bytes: Uint8Array, parolaSor: (yeniden: boolean) => Promise<string | null>, ilerle: (i: Ilerleme) => void,
): Promise<{ sayfalar: OkunanSayfa[]; parolali: boolean }> {
  if (bytes.length > AZAMI_BAYT) throw new PdfOkumaHatasi('Dosya 25 MB\'tan büyük.');
  if (!pdfImzasiVarMi(bytes)) throw new PdfOkumaHatasi('Dosya PDF değil.');
  ilerle({ asama: 'acma', sayfa: 0, sayfaSayisi: 0, oran: 0 });
  const pdf = await pdfAc(bytes, parolaSor);
  try {
    if (pdf.numPages > AZAMI_SAYFA) throw new PdfOkumaHatasi(`PDF ${String(pdf.numPages)} sayfa; en çok ${String(AZAMI_SAYFA)} sayfa okunur.`);
    const sayfalar: OkunanSayfa[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      ilerle({ asama: 'metin', sayfa: n, sayfaSayisi: pdf.numPages, oran: 0 });
      const s = await pdfCiz(pdf, n, { res: COZUNURLUK });
      const metin = s.junk ? [] : s.items.filter((o) => Math.abs(o.a) < 0.05).map((o) => ({ s: o.s, x: o.x, y: o.y, w: o.w, h: o.h }));
      let ogeler: Oge[] = metin, tanima = false;
      if (metin.length < EN_AZ_OGE) {
        tanima = true;
        ilerle({ asama: 'tanima', sayfa: n, sayfaSayisi: pdf.numPages, oran: 0 });
        const buyuk = await pdfCiz(pdf, n, { res: TANIMA_COZUNURLUGU });
        ogeler = await belgeTani(buyuk.img, s.w / buyuk.img.width, (oran) => ilerle({ asama: 'tanima', sayfa: n, sayfaSayisi: pdf.numPages, oran }));
      }
      sayfalar.push({ no: n, w: s.w, h: s.h, resim: resimYaz(s.img), ogeler, tanima });
    }
    return { sayfalar, parolali: pdf.arkonEnc === true };
  } finally {
    void pdf.loadingTask.destroy();
  }
}
