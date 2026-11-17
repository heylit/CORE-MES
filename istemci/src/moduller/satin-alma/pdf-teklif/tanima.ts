import { tesseract, vendorAdresi, type TessApi } from '../../../ortak/cizim/kitaplik.ts';
import type { Oge } from './okuma.ts';

// 3404: taranmış teklif sayfasında yazı tanıma. Çizim OCR'ı (ortak/cizim/ocr.ts) seyrek ölçü yazısı için ayarlıdır (tek tek kelime,
// yalnız İngilizce); teklif belgesi satır satır düz metindir. Aynı yerel Tesseract çekirdeği ayrı bir örnekle, Türkçe + İngilizce ve
// blok kipinde kullanılır. Dil dosyası uygulamanın kendi kitaplık klasöründen gelir; dışarıya istek yoktur.

const PSM_BLOK = '6';

async function gzipDosya(k: 'tesstur'): Promise<Uint8Array> {
  const r = await fetch(vendorAdresi(k));
  if (!r.ok) throw new Error('Türkçe yazı tanıma verisi yüklenemedi');
  const akis = new Blob([new Uint8Array(await r.arrayBuffer())]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

let belgeApi: Promise<{ api: TessApi; yaz(png: Uint8Array): void }> | null = null;
function api(): Promise<{ api: TessApi; yaz(png: Uint8Array): void }> {
  belgeApi ??= (async () => {
    const { TM } = await tesseract();
    TM.FS.writeFile('/tur.traineddata', await gzipDosya('tesstur'));
    const a = new TM.TessBaseAPI();
    if (a.Init(null, 'tur+eng', 1) === -1) throw new Error('Yazı tanıma modeli yüklenemedi');
    a.SetVariable('tessedit_pageseg_mode', PSM_BLOK);
    a.SetVariable('user_defined_dpi', '300');
    a.SetVariable('preserve_interword_spaces', '1');
    a.SetVariable('debug_file', '/dev/null');
    // SetImageFile çekirdeğin sabit /input dosyasını okur.
    return { api: a, yaz: (veri: Uint8Array) => { TM.FS.writeFile('/input', veri); } };
  })().catch((h: unknown) => { belgeApi = null; throw h; });
  return belgeApi;
}

async function png(img: ImageData): Promise<Uint8Array> {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  cv.getContext('2d')?.putImageData(img, 0, 0);
  const b = await new Promise<Blob | null>((coz) => { cv.toBlob(coz, 'image/png'); });
  if (!b) throw new Error('Sayfa görüntüsü hazırlanamadı');
  return new Uint8Array(await b.arrayBuffer());
}

const bekle = () => new Promise<void>((coz) => { setTimeout(coz, 0); });

/** Sayfa görüntüsündeki kelimeler; konumlar `olcek` ile ekran sayfasının birimine çevrilir. Sayfa tek seferde okunur: bu çekirdekte
 * SetRectangle ile bölge okumak blok kipinde metni bozuyor (ORN taranmış teklifte denendi); bir A4 sayfa birkaç saniye sürer. */
export async function belgeTani(img: ImageData, olcek: number, ilerle: (oran: number) => void): Promise<Oge[]> {
  const { api: a, yaz } = await api();
  yaz(await png(img));
  if (a.SetImageFile(1, 0) === 1) throw new Error('Görüntü yazı tanımaya verilemedi');
  ilerle(0.1);
  await bekle();
  a.Recognize(null);
  const ogeler: Oge[] = [];
  for (const ln of (a.GetTSVText(0) || '').split('\n')) {
    const c = ln.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const s = (c[11] ?? '').trim(), conf = Number(c[10]);
    if (!s || !(conf >= 0)) continue;
    const x = Number(c[6]), top = Number(c[7]), w = Number(c[8]), h = Number(c[9]);
    ogeler.push({ s, x: x * olcek, y: (top + h) * olcek, w: w * olcek, h: h * olcek, conf });
  }
  ilerle(1);
  return ogeler;
}
