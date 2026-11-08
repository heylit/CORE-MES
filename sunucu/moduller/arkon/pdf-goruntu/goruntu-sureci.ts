// PDF görüntü süreci (ADR 0032): ana sunucu `surec.ts` ile fork eder; ağa açılmaz, veritabanına bağlanmaz, ortam değişkeni almaz.
// Yalnız IPC ile PDF baytı alır, renklendirilmiş PNG'ler döner. PDF güvenilmeyen girdidir: çökmesi ya da asılması ana sunucuyu durdurmaz.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renklendirPiksel } from '#paylasilan/pdf-renk.ts';
import { ILETILER, loOlcegi, pdfBasligiVar, PDF_AZAMI_BAYT, sayfaOlcegi } from './kurallar.ts';
import type { GoruntuIstegi, GoruntuYaniti, HazirGoruntu } from './surec.ts';

interface Tuval { width: number; height: number; getContext(t: '2d'): Baglam; encode(t: 'png'): Promise<Buffer> }
interface Baglam {
  fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  putImageData(d: unknown, x: number, y: number): void; createImageData(w: number, h: number): { data: Uint8ClampedArray };
}
interface Kitaplik {
  getDocument(a: object): { promise: Promise<Belge>; destroy(): Promise<void> };
}
interface Sayfa {
  getViewport(a: { scale: number }): { width: number; height: number };
  render(a: object): { promise: Promise<void> };
  cleanup(): void;
}
interface Belge { numPages: number; getPage(n: number): Promise<Sayfa> }

const iste = createRequire(import.meta.url);
const tuvalKitapligi = iste('@napi-rs/canvas') as { createCanvas(w: number, h: number): Tuval };
// Standart PDF yazı tipleri paketin kendi klasöründen okunur (dosya yolu; ağ yok).
const PDFJS_KOKU = fileURLToPath(new URL('.', pathToFileURL(iste.resolve('pdfjs-dist/package.json'))));
let pdfjs: Promise<Kitaplik> | null = null;
const kitaplik = (): Promise<Kitaplik> => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<Kitaplik>);

function tuval(w: number, h: number): { cv: Tuval; ctx: Baglam } {
  const cv = tuvalKitapligi.createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  return { cv, ctx };
}

async function ciz(sayfa: Sayfa, olcek: number): Promise<{ w: number; h: number; piksel: Uint8ClampedArray }> {
  const vp = sayfa.getViewport({ scale: olcek });
  const w = Math.round(vp.width), h = Math.round(vp.height);
  const { cv, ctx } = tuval(w, h);
  await sayfa.render({ canvas: cv, canvasContext: ctx, viewport: vp }).promise;
  return { w, h, piksel: ctx.getImageData(0, 0, w, h).data };
}

async function png(w: number, h: number, kaynak: Uint8ClampedArray, ayar: GoruntuIstegi['isler'][number]['ayar']): Promise<Buffer> {
  const { cv, ctx } = tuval(w, h);
  const hedef = ctx.createImageData(w, h);
  renklendirPiksel(kaynak, w, h, hedef.data, ayar);
  ctx.putImageData(hedef, 0, 0);
  return cv.encode('png');
}

const hata = (kalici: boolean, metin: string): GoruntuYaniti => ({ tamam: false, kalici, hata: metin, bellek: process.memoryUsage().rss });

async function isle(g: GoruntuIstegi): Promise<GoruntuYaniti> {
  if (g.veri.length > PDF_AZAMI_BAYT) return hata(true, ILETILER.cokBuyuk);
  if (!pdfBasligiVar(g.veri)) return hata(true, ILETILER.pdfDegil);
  const bas = performance.now();
  const lib = await kitaplik();
  // isEvalSupported: PDF içindeki fonksiyonlar derlenmez; şifreli PDF parolasız açılamaz ve kalıcı hata olur (tablet kendisi sorar).
  const gorev = lib.getDocument({
    data: g.veri.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, useWasm: false,
    standardFontDataUrl: PDFJS_KOKU + 'standard_fonts/', cMapUrl: PDFJS_KOKU + 'cmaps/', cMapPacked: true, stopAtErrors: false,
  });
  try {
    const belge = await gorev.promise;
    if (g.sayfa > belge.numPages) return hata(true, ILETILER.sayfaYok);
    const sayfa = await belge.getPage(g.sayfa);
    const v1 = sayfa.getViewport({ scale: 1 });
    const goruntuler: HazirGoruntu[] = [];
    const hi = await ciz(sayfa, sayfaOlcegi(Math.max(v1.width, v1.height), g.res));
    for (const is of g.isler.filter((x) => !x.ayar.lo)) goruntuler.push({ imza: is.imza, genislik: hi.w, yukseklik: hi.h, png: await png(hi.w, hi.h, hi.piksel, is.ayar) });
    const loIsleri = g.isler.filter((x) => x.ayar.lo);
    // Tablet ekrana sığan görüntüyü yalnız sayfa kaydından küçükse çizer (TeknikResim.tsx L < C.w * 0.8); sunucu da öyle.
    const loSayfa = sayfa.getViewport({ scale: 1 }).width * loOlcegi(v1.width);
    if (loIsleri.length > 0 && loSayfa < hi.w * 0.8) {
      const lo = await ciz(sayfa, loOlcegi(v1.width));
      for (const is of loIsleri) goruntuler.push({ imza: is.imza, genislik: lo.w, yukseklik: lo.h, png: await png(lo.w, lo.h, lo.piksel, is.ayar) });
    }
    sayfa.cleanup();
    return { tamam: true, goruntuler, sureMs: Math.round(performance.now() - bas), bellek: process.memoryUsage().rss };
  } catch {
    // Hata metnine dosya içeriği girmez (ADR 0024 karar 3 kalıbı).
    return hata(true, ILETILER.okunamadi);
  } finally {
    await gorev.destroy().catch(() => undefined);
  }
}

process.on('message', (ileti: GoruntuIstegi) => {
  void isle(ileti).then(
    (yanit) => process.send?.({ ...yanit, kimlik: ileti.kimlik }),
    () => process.send?.({ ...hata(true, ILETILER.okunamadi), kimlik: ileti.kimlik }),
  );
});
process.on('disconnect', () => process.exit(0));
