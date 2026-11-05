import { PDFDocument, PDFName, PDFObjectCopier, PDFPage, degrees, rgb } from 'pdf-lib';
import { AyiklamaHatasi } from './ayiklama.ts';
import type { Sayac } from './ayiklama.ts';
import { sayfadanAyikla } from './ayiklama-pdf.ts';
import type { Oge, SayfaKutusu } from './duzenleme.ts';
import { ogeReddi, pdfKutusu, pdfNoktasi, renkBilesenleri, resimYerlesimi } from './duzenleme.ts';

// Düzenlenmiş PDF'i yazar (kart 2123, karar 2123-1 b: pdf-lib). Dolgu, altındaki içeriği örter.
// Ayıklama açıksa (2123-5 c) dolgunun altındaki yazı, resim ve çizim sayfanın içeriğinden çıkarılır ve sonuç yeni belgeye
// copyPages ile kurulur: sayfadan koparılan nesneler, belge künyesi ve yer imleri yeni dosyaya taşınmaz.
// Yazı ve logo PNG olarak gelir: pdf-lib'in standart yazı tipleri Türkçe harfleri basamaz, yazı tarayıcıda resme çizilir.

// Yazının resmi yüksek çözünürlükte çizilir; `olcu` resmin sayfadaki ölçüsüdür (görünüm noktası).
export interface ResimliOge { oge: Oge; png?: Uint8Array; olcu?: { g: number; y2: number } }

export class PdfDuzenlemeHatasi extends Error {}

export type Silinen = Sayac & { not: number };
// silinen: ayıklama yapılmadıysa null.
export interface DuzenlemeSonucu { veri: Uint8Array; silinen: Silinen | null }

async function kaynakAc(kaynak: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(kaynak, { updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && e.name === 'EncryptedPDFError') throw new PdfDuzenlemeHatasi('Şifreli PDF düzenlenemez.');
    throw new PdfDuzenlemeHatasi('PDF okunamadı.');
  }
}

async function ogeleriCiz(belge: PDFDocument, sayfa: PDFPage, no: number, kutu: SayfaKutusu, ogeler: readonly ResimliOge[]): Promise<void> {
  for (const { oge, png, olcu } of ogeler) {
    const red = ogeReddi(oge);
    if (red !== null) throw new PdfDuzenlemeHatasi(`Sayfa ${String(no)}: ${red}`);
    if (oge.tur === 'dolgu') {
      const k = pdfKutusu(kutu, oge);
      sayfa.drawRectangle({ x: k.x, y: k.y, width: k.en, height: k.boy, color: rgb(...renkBilesenleri(oge.renk)), borderWidth: 0 });
    } else if (oge.tur === 'cizgi') {
      const [x0, y0] = pdfNoktasi(kutu, oge.x0, oge.y0);
      const [x1, y1] = pdfNoktasi(kutu, oge.x1, oge.y1);
      sayfa.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: oge.kalin, color: rgb(...renkBilesenleri(oge.renk)) });
    } else {
      if (!png) throw new PdfDuzenlemeHatasi(`Sayfa ${String(no)}: resim verisi yok.`);
      const resim = await belge.embedPng(png);
      const k = oge.tur === 'logo' ? oge : { x: oge.x, y: oge.y, g: olcu?.g ?? resim.width, y2: olcu?.y2 ?? resim.height };
      const y = resimYerlesimi(kutu, k);
      sayfa.drawImage(resim, { x: y.x, y: y.y, width: y.en, height: y.boy, rotate: degrees(y.donme) });
    }
  }
}

export async function duzenlenmisPdf(
  kaynak: Uint8Array, sayfalar: readonly (readonly ResimliOge[])[], kutular: readonly SayfaKutusu[], secenek: { ayikla?: boolean } = {},
): Promise<DuzenlemeSonucu> {
  const kaynakBelge = await kaynakAc(kaynak);
  const n = kaynakBelge.getPageCount();
  if (sayfalar.length !== n || kutular.length !== n) throw new PdfDuzenlemeHatasi('Sayfa sayısı tutmuyor.');
  for (const [i, liste] of sayfalar.entries()) {
    for (const { oge } of liste) {
      const red = ogeReddi(oge);
      if (red !== null) throw new PdfDuzenlemeHatasi(`Sayfa ${String(i + 1)}: ${red}`);
    }
  }
  const dolguVar = sayfalar.some((l) => l.some((o) => o.oge.tur === 'dolgu'));
  if (!secenek.ayikla || !dolguVar) {
    for (const [i, sayfa] of kaynakBelge.getPages().entries()) await ogeleriCiz(kaynakBelge, sayfa, i + 1, kutular[i]!, sayfalar[i]!);
    return { veri: await kaynakBelge.save(), silinen: null };
  }

  const silinen: Silinen = { yazi: 0, resim: 0, cizim: 0, ortulenResim: 0, not: 0 };
  for (const [i, sayfa] of kaynakBelge.getPages().entries()) {
    const alanlar = sayfalar[i]!.flatMap(({ oge }) => (oge.tur === 'dolgu' ? [pdfKutusu(kutular[i]!, oge)] : []));
    try {
      const s = sayfadanAyikla(sayfa, alanlar);
      silinen.yazi += s.yazi; silinen.resim += s.resim; silinen.cizim += s.cizim; silinen.ortulenResim += s.ortulenResim; silinen.not += s.not;
    } catch (e) {
      if (e instanceof AyiklamaHatasi) {
        throw new PdfDuzenlemeHatasi(`Sayfa ${String(i + 1)}: ${e.message} Yalnız örterek kaydetmek için silme seçimini kaldırın.`);
      }
      throw e;
    }
  }
  // Yeni belge: yalnız sayfaların başvurduğu nesneler gelir; koparılan resimler, belge künyesi (Info, XMP), yer imleri, ekler,
  // form, betik ve eski kayıt geçmişi taşınmaz. Sayfa künyesi ve küçük resim bütün sayfalardan düşer.
  // Katman ayarı (OCProperties) taşınır: yoksa görüntüleyici gizli katmanı da gösterir. Sayfalarla aynı kopyalayıcı kullanılır ki
  // katman nesneleri sayfalardaki başvurularla aynı nesne olsun.
  for (const sayfa of kaynakBelge.getPages()) for (const k of ['Thumb', 'Metadata', 'PieceInfo']) sayfa.node.delete(PDFName.of(k));
  const belge = await PDFDocument.create({ updateMetadata: false });
  await kaynakBelge.flush();
  const kopyalayici = PDFObjectCopier.for(kaynakBelge.context, belge.context);
  for (const [i, kaynakSayfa] of kaynakBelge.getPages().entries()) {
    const dugum = kopyalayici.copy(kaynakSayfa.node);
    const sayfa = belge.addPage(PDFPage.of(dugum, belge.context.register(dugum), belge));
    await ogeleriCiz(belge, sayfa, i + 1, kutular[i]!, sayfalar[i]!);
  }
  const katman = kaynakBelge.catalog.get(PDFName.of('OCProperties'));
  if (katman) belge.catalog.set(PDFName.of('OCProperties'), kopyalayici.copy(katman));
  return { veri: await belge.save(), silinen };
}
