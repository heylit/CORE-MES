import { pdfAc } from '../../ortak/cizim/pdf.ts';
import { metinYeterli, pdfSatirlari, type OkunanBilgiler } from './irsaliye-okuma.ts';
import {
  PDF_OKUMA_BEKLEMESI_MS, PDF_OKUNAN_SAYFA, enCok, pdfMi, pdfOkumasi, resimMi, sayfaOkumasi, type PdfSayfasi, type SayfaOkumasi,
} from './irsaliye-okuyucu.ts';

// İrsaliye sayfaları tek PDF olur (3063): fotoğraf en uzun kenarı IRSALIYE_SINIRI.kenar pikseli aşmayacak biçimde JPEG'e küçültülür
// (300 dpi A4 ~2480 px; okunurluk için yeterli, telefon fotoğrafı 3-6 MB yerine ~0,5-1 MB), A4 sayfaya oranı korunarak yerleşir.
// Seçilen PDF'in sayfaları olduğu gibi kopyalanır (okunması yalnız öneri içindir). pdf-lib yalnız gerektiğinde yüklenir. Sunucu yalnız PDF'i bağlar.
// Okunan fotoğraf sayfası aranabilir sayfadır (aynı görüntü + görünmez metin, irsaliye-okuyucu.ts); okunamayan bugünkü gibi görüntüdür.

export const IRSALIYE_SINIRI = { sayfa: 20, kenar: 2000, kalite: 0.82, dosyaBayt: 30 * 1024 * 1024 } as const;
const A4 = { g: 595.28, y: 841.89 } as const;

export function sayfaReddi(f: Pick<File, 'type' | 'size' | 'name'>, mevcut: number): string | null {
  if (mevcut >= IRSALIYE_SINIRI.sayfa) return `Bir irsaliyede en çok ${IRSALIYE_SINIRI.sayfa} sayfa olur.`;
  if (!pdfMi(f) && !f.type.startsWith('image/')) return 'Yalnız fotoğraf ya da PDF eklenir.';
  if (f.size > IRSALIYE_SINIRI.dosyaBayt) return 'Dosya çok büyük (en çok 30 MB).';
  return null;
}

// Yatay fotoğraf yatay A4'e konur; resim sayfaya sığar, ortalanır.
export function sayfaYerlesimi(en: number, boy: number): { sayfa: [number, number]; x: number; y: number; g: number; h: number } {
  const yatay = en > boy;
  const [sg, sy] = yatay ? [A4.y, A4.g] : [A4.g, A4.y];
  const o = Math.min(sg / en, sy / boy);
  const g = en * o, h = boy * o;
  return { sayfa: [sg, sy], x: (sg - g) / 2, y: (sy - h) / 2, g, h };
}

export function kucukOlcu(en: number, boy: number, kenar: number = IRSALIYE_SINIRI.kenar): { en: number; boy: number } {
  const o = Math.min(1, kenar / Math.max(en, boy));
  return { en: Math.max(1, Math.round(en * o)), boy: Math.max(1, Math.round(boy * o)) };
}

async function tuvaldenJpeg(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((coz, reddet) => { c.toBlob((b) => { if (b) coz(b); else reddet(new Error('Fotoğraf işlenemedi')); }, 'image/jpeg', IRSALIYE_SINIRI.kalite); });
  return new Uint8Array(await blob.arrayBuffer());
}

async function jpegeCevir(f: Blob): Promise<{ veri: Uint8Array; en: number; boy: number }> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
  try {
    const o = kucukOlcu(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = o.en; c.height = o.boy;
    const x = c.getContext('2d');
    if (!x) throw new Error('Tuval açılamadı');
    x.drawImage(bmp, 0, 0, o.en, o.boy);
    return { veri: await tuvaldenJpeg(c), ...o };
  } finally {
    bmp.close();
  }
}

// Sayfa eklenince çağrılır; PDF yapılırken aynı okuma beklenir.
export function sayfayiOkut(f: File): Promise<SayfaOkumasi | null> {
  return sayfaOkumasi(f, () => jpegeCevir(f));
}

// PDF'in ilk sayfaları: metin katmanı yeterliyse metni, değilse sayfa fotoğraf gibi çizilir (fotoğrafla aynı en uzun kenar).
async function pdfSayfalari(f: File): Promise<PdfSayfasi[]> {
  const belge = await pdfAc(new Uint8Array(await f.arrayBuffer()));
  try {
    const sayfalar: PdfSayfasi[] = [];
    for (let n = 1; n <= Math.min(belge.numPages, PDF_OKUNAN_SAYFA); n++) {
      const sayfa = await belge.getPage(n);
      const icerik = await sayfa.getTextContent();
      const metin = pdfSatirlari(icerik.items.flatMap((o) => ('str' in o ? [{ str: o.str, x: Number(o.transform[4]), y: Number(o.transform[5]) }] : [])));
      if (metinYeterli(metin)) { sayfalar.push({ metin }); continue; }
      const bir = sayfa.getViewport({ scale: 1 });
      const vp = sayfa.getViewport({ scale: IRSALIYE_SINIRI.kenar / Math.max(bir.width, bir.height) });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const x = c.getContext('2d');
      if (!x) throw new Error('Tuval açılamadı');
      x.fillStyle = 'white'; x.fillRect(0, 0, c.width, c.height);
      await sayfa.render({ canvas: null, canvasContext: x, viewport: vp }).promise;
      sayfalar.push({ goruntu: { veri: await tuvaldenJpeg(c), en: c.width, boy: c.height } });
    }
    return sayfalar;
  } finally {
    void belge.loadingTask.destroy();
  }
}

// Eklenen sayfanın önerileri: fotoğraf okunur, PDF'in metni ya da çizilmiş sayfası okunur. Başka dosya okunmaz.
export function belgeyiOkut(f: File): Promise<OkunanBilgiler | null> {
  if (resimMi(f)) return sayfayiOkut(f).then((o) => o?.bilgiler ?? null);
  if (pdfMi(f)) return pdfOkumasi(f, () => pdfSayfalari(f));
  return Promise.resolve(null);
}

export async function irsaliyePdfi(dosyalar: readonly File[]): Promise<Uint8Array> {
  if (dosyalar.length === 0) throw new Error('Sayfa yok');
  const { PDFDocument } = await import('pdf-lib');
  const belge = await PDFDocument.create();
  belge.setTitle('İrsaliye');
  belge.setProducer('CORE MES');
  const son = Date.now() + PDF_OKUMA_BEKLEMESI_MS;
  for (const f of dosyalar) {
    if (pdfMi(f)) {
      let kaynak;
      try {
        kaynak = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { updateMetadata: false });
      } catch {
        throw new Error(`${f.name} okunamadı (şifreli ya da bozuk PDF).`);
      }
      for (const s of await belge.copyPages(kaynak, kaynak.getPageIndices())) belge.addPage(s);
      continue;
    }
    const okuma = await enCok(sayfayiOkut(f), son - Date.now());
    if (okuma) {
      try {
        const aranabilir = await PDFDocument.load(okuma.pdf, { updateMetadata: false });
        for (const s of await belge.copyPages(aranabilir, aranabilir.getPageIndices())) belge.addPage(s);
        continue;
      } catch {
        // Okuyucunun PDF'i açılmazsa sayfa görüntü olarak girer.
      }
    }
    const j = await jpegeCevir(f);
    const resim = await belge.embedJpg(j.veri);
    const y = sayfaYerlesimi(j.en, j.boy);
    belge.addPage(y.sayfa).drawImage(resim, { x: y.x, y: y.y, width: y.g, height: y.h });
  }
  return belge.save();
}
