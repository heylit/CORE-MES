import { PDFDocument, degrees, rgb } from 'pdf-lib';
import type { Oge, SayfaKutusu } from './duzenleme.ts';
import { ogeReddi, pdfKutusu, pdfNoktasi, renkBilesenleri, resimYerlesimi } from './duzenleme.ts';

// Düzenlenmiş PDF'i yazar (kart 2123, karar 2123-1 b: pdf-lib). Dolgu altındaki içeriği yalnız örter; içerik dosyada kalır.
// Yazı ve logo PNG olarak gelir: pdf-lib'in standart yazı tipleri Türkçe harfleri basamaz, yazı tarayıcıda resme çizilir.

// Yazının resmi yüksek çözünürlükte çizilir; `olcu` resmin sayfadaki ölçüsüdür (görünüm noktası).
export interface ResimliOge { oge: Oge; png?: Uint8Array; olcu?: { g: number; y2: number } }

export class PdfDuzenlemeHatasi extends Error {}

export async function duzenlenmisPdf(kaynak: Uint8Array, sayfalar: readonly (readonly ResimliOge[])[], kutular: readonly SayfaKutusu[]): Promise<Uint8Array> {
  let belge: PDFDocument;
  try {
    belge = await PDFDocument.load(kaynak, { updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && e.name === 'EncryptedPDFError') throw new PdfDuzenlemeHatasi('Şifreli PDF düzenlenemez.');
    throw new PdfDuzenlemeHatasi('PDF okunamadı.');
  }
  const pdfSayfalari = belge.getPages();
  if (sayfalar.length !== pdfSayfalari.length || kutular.length !== pdfSayfalari.length) throw new PdfDuzenlemeHatasi('Sayfa sayısı tutmuyor.');
  for (const [i, sayfa] of pdfSayfalari.entries()) {
    const kutu = kutular[i]!;
    for (const { oge, png, olcu } of sayfalar[i]!) {
      const red = ogeReddi(oge);
      if (red !== null) throw new PdfDuzenlemeHatasi(`Sayfa ${String(i + 1)}: ${red}`);
      if (oge.tur === 'dolgu') {
        const k = pdfKutusu(kutu, oge);
        sayfa.drawRectangle({ x: k.x, y: k.y, width: k.en, height: k.boy, color: rgb(...renkBilesenleri(oge.renk)), borderWidth: 0 });
      } else if (oge.tur === 'cizgi') {
        const [x0, y0] = pdfNoktasi(kutu, oge.x0, oge.y0);
        const [x1, y1] = pdfNoktasi(kutu, oge.x1, oge.y1);
        sayfa.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: oge.kalin, color: rgb(...renkBilesenleri(oge.renk)) });
      } else {
        if (!png) throw new PdfDuzenlemeHatasi(`Sayfa ${String(i + 1)}: resim verisi yok.`);
        const resim = await belge.embedPng(png);
        const k = oge.tur === 'logo' ? oge : { x: oge.x, y: oge.y, g: olcu?.g ?? resim.width, y2: olcu?.y2 ?? resim.height };
        const y = resimYerlesimi(kutu, k);
        sayfa.drawImage(resim, { x: y.x, y: y.y, width: y.en, height: y.boy, rotate: degrees(y.donme) });
      }
    }
  }
  return belge.save();
}
