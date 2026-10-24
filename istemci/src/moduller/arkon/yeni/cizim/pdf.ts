import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { pdfjs, pdfWasmAdresi, type PdfKitapligi } from './kitaplik.ts';
import type { OkumaAyari } from './kurallar.ts';
import type { MetinOgesi } from './okuma.ts';

// PDF: sayfayı vektörden çiz, metin katmanını oku, görüntüyü temaya göre renklendir (pdf.ts). Tarayıcı tuvali gerekir.
// Tuvali pdf.js değil biz açarız (beyaz zemin önce çizilir): canvas null, canvasContext verilir (eskisi gibi).

export type PdfBelgesi = PDFDocumentProxy & { arkonEnc?: boolean };
let LIB: PdfKitapligi | null = null;

// Şifreli PDF: sor(yeniden) şifreyi ya da vazgeçince null verir.
export async function pdfAc(bytes: Uint8Array, sor?: (yeniden: boolean) => Promise<string | null>): Promise<PdfBelgesi> {
  const lib = LIB = await pdfjs();
  // isEvalSupported pdf.js 6'da yok sayılır; eski sürüme dönülürse önlem kendiliğinden geçerli kalsın diye korunur.
  const ayar = { data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, useWasm: false, wasmUrl: pdfWasmAdresi() };
  const task = lib.getDocument(ayar);
  let vazgecti = false;
  let soruldu = false;
  task.onPassword = (cb: (pw: string) => void, neden: number) => {
    soruldu = true;
    const s = sor ? sor(neden === 2) : Promise.resolve(null);
    void s.then((pw) => { if (pw == null) { vazgecti = true; void task.destroy(); } else cb(pw); });
  };
  try {
    const pdf = await task.promise as PdfBelgesi;
    pdf.arkonEnc = soruldu;
    return pdf;
  } catch (e) {
    if (vazgecti || (e instanceof Error && e.name === 'PasswordException')) throw new Error('PDF şifreli · şifre girilmedi');
    throw e;
  }
}

function tuval(w: number, h: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Tuval açılamadı');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  return { cv, ctx };
}

export interface PdfSayfasi { w: number; h: number; img: ImageData; items: MetinOgesi[]; pages: number; scale: number; junk: boolean }

export async function pdfCiz(pdf: PdfBelgesi, n: number, cfg: Pick<OkumaAyari, 'res'> | null): Promise<PdfSayfasi & { ms: number }> {
  const page: PDFPageProxy = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(8, (cfg?.res || 4200) / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const { cv, ctx } = tuval(Math.round(vp.width), Math.round(vp.height));
  const t0 = performance.now();
  await page.render({ canvas: null, canvasContext: ctx, viewport: vp }).promise;
  const ms = performance.now() - t0;
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const tc = await page.getTextContent();
  const fname: Record<string, string> = {};
  const fontOf = (id: string) => {
    if (!(id in fname)) {
      try { const f = page.commonObjs.get(id) as { name?: string; loadedName?: string } | null; fname[id] = (f && (f.name || f.loadedName)) || ''; } catch { fname[id] = ''; }
    }
    return fname[id] ?? '';
  };
  const Util = (LIB ?? await pdfjs()).Util;
  const items: MetinOgesi[] = [];
  for (const it of tc.items) {
    if (!('str' in it) || !it.str || !it.str.trim()) continue;
    const t = Util.transform(vp.transform, it.transform) as number[];
    const h = Math.hypot(t[2]!, t[3]!), a = Math.atan2(t[1]!, t[0]!);
    items.push({ s: it.str, x: t[4]!, y: t[5]!, h, a, w: it.width * scale, font: fontOf(it.fontName) });
  }
  // Okunabilir metin oranı: Type3 ya da ToUnicode'suz fontlar çöp karakter verir.
  const good = items.filter((o) => /[0-9A-Za-zÇĞİÖŞÜçğıöşüØ±°]/.test(o.s)).length;
  page.cleanup();
  return { w: cv.width, h: cv.height, img, items, pages: pdf.numPages, scale, junk: items.length > 20 && good / items.length < 0.5, ms };
}

// Yalnız görüntü: verilen ölçekte sayfa (ekran çözünürlüğünde net önizleme için).
export async function pdfGoruntu(pdf: PdfBelgesi, n: number, scale: number): Promise<ImageData> {
  const page = await pdf.getPage(n), vp = page.getViewport({ scale });
  const { cv, ctx } = tuval(Math.round(vp.width), Math.round(vp.height));
  await page.render({ canvas: null, canvasContext: ctx, viewport: vp }).promise;
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

// Sayfanın bir bölgesi yüksek çözünürlükte yeniden çizilir (bölge OCR'ı ve derin yakınlaşma için keskin görüntü).
export async function pdfBolge(pdf: PdfBelgesi, n: number, baseScale: number, box: readonly number[], f0?: number): Promise<{ img: ImageData; f: number }> {
  const page = await pdf.getPage(n);
  const f = f0 || Math.max(1, Math.min(4, 2200 / Math.max(box[2]!, box[3]!)));
  const vp = page.getViewport({ scale: baseScale * f, offsetX: -box[0]! * f, offsetY: -box[1]! * f });
  const { cv, ctx } = tuval(Math.max(1, Math.round(box[2]! * f)), Math.max(1, Math.round(box[3]! * f)));
  await page.render({ canvas: null, canvasContext: ctx, viewport: vp }).promise;
  return { img: ctx.getImageData(0, 0, cv.width, cv.height), f };
}

// Tasarım değişkeninin rengi (tema değişince yeniden okunur).
function degiskenRengi(ad: string): [number, number, number] {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !deger) return [0, 0, 0];
  ctx.fillStyle = deger;
  const c = String(ctx.fillStyle);
  if (c.startsWith('#')) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const m = c.match(/[\d.]+/g) ?? ['0', '0', '0'];
  return [+m[0]!, +m[1]!, +m[2]!];
}

const pngYap = (img: ImageData): Promise<Blob> => {
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d')?.putImageData(img, 0, 0);
  return new Promise<Blob>((coz, reddet) => cv.toBlob((b) => { if (b) coz(b); else reddet(new Error('Görüntü üretilemedi')); }, 'image/png'));
};

// Görüntü temaya göre renklendirilir. net: koyu temada beyaza, açık temada siyaha yakın çizgi · blue: mavi teknik resim · orig: PDF'in renkleri.
// lo: ekran çözünürlüğünde pdf.js çizgileri zaten 1 px, kalınlaştırma bir kademe az.
export function renklendir(img: ImageData, koyu: boolean, cfg: Pick<OkumaAyari, 'look' | 'bold'> | null, lo = false): Promise<Blob> {
  const look = cfg?.look || 'net', bold = Math.max(0, (cfg && cfg.bold != null ? +cfg.bold : 1) - (lo ? 1 : 0));
  const bp = degiskenRengi(look === 'blue' ? '--bp' : '--ink'), net = look !== 'blue';
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  if (look === 'orig') { d.set(s); return pngYap(out); }
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i]!, g = s[i + 1]!, b = s[i + 2]!, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat = (mx - mn) / 255, ink = 1 - lum;
    if (ink < 0.05 && sat < 0.1) { d[i + 3] = 0; continue; }
    // Yarı saydam kenar pikselleri güçlendirilir (gama): ince yazı silik görünmesin.
    const a = net ? Math.pow(ink, lo ? 0.8 : 0.6) * (lo ? 1.3 : 1.5) : ink * 1.3;
    // net: yalnız kırmızı (eksen çizgisi) renkli kalır, öteki renkli yazı ve çizgi mürekkep rengine döner.
    if (sat > 0.22 && (!net || (r > 150 && g < 110 && b < 110))) {
      const k = koyu ? 0.35 : 0; d[i] = r + (255 - r) * k; d[i + 1] = g + (255 - g) * k; d[i + 2] = b + (255 - b) * k; d[i + 3] = Math.min(255, (a * 1.08 + sat) * 255);
    } else { d[i] = bp[0]; d[i + 1] = bp[1]; d[i + 2] = bp[2]; d[i + 3] = Math.min(255, a * 255); }
  }
  // İnce CAD çizgileri ekrana sığınca kaybolmasın: alfa kanalında 3×3 genişletme (kalınlaştırma ayarı kadar tekrar).
  const W = img.width, H = img.height, a0 = new Uint8ClampedArray(W * H);
  for (let pass = 0; pass < bold; pass++) {
    for (let i = 0, j = 3; i < a0.length; i++, j += 4) a0[i] = d[j]!;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (a0[i]! > 200) continue;
        let m = a0[i]!, mi = i;
        const n = [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1];
        for (let q = 0; q < 8; q++) { const v = a0[n[q]!]! * (q < 4 ? 0.9 : 0.7); if (v > m) { m = v; mi = n[q]!; } }
        if (mi !== i) { const o = 4 * i, p = 4 * mi; d[o] = d[p]!; d[o + 1] = d[p + 1]!; d[o + 2] = d[p + 2]!; d[o + 3] = m; }
      }
    }
  }
  return pngYap(out);
}
