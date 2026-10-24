import { bekle, tesseract } from './kitaplik.ts';
import { capIsaretiMi, kelimeAyikla, ocrDuzelt, otsu, yaziMaskele, type MetinOgesi } from './okuma.ts';
import { pdfBolge, type PdfBelgesi } from './pdf.ts';

// Çevrimdışı OCR (ocr.ts): metni çizgiye dönüştürülmüş ya da taranmış resimler için. Tesseract eski Arkon'un dosyasıdır (kitaplik.ts).

type OcrOgesi = MetinOgesi & { conf: number };

// ImageData'dan OCR'a hazır siyah-beyaz PNG: uzun yatay ve dikey çizgiler silinir, kırıntılar temizlenir; rot 90° saat yönü döndürür.
async function hazirla(img0: ImageData, rot: boolean, box?: readonly number[] | null) {
  const bx = box ? Math.max(0, Math.floor(box[0]!)) : 0, by = box ? Math.max(0, Math.floor(box[1]!)) : 0;
  const cw = box ? Math.min(img0.width - bx, Math.ceil(box[2]!)) : img0.width, ch = box ? Math.min(img0.height - by, Math.ceil(box[3]!)) : img0.height;
  // Küçük bölge iki kat büyütülür (Tesseract 30 px civarı yazı yüksekliğini sever).
  let img = img0, S = 1;
  if (box && cw * ch < 1.6e6) {
    S = 2;
    const c0 = document.createElement('canvas'); c0.width = cw; c0.height = ch; c0.getContext('2d')?.putImageData(img0, -bx, -by, bx, by, cw, ch);
    const c1 = document.createElement('canvas'); c1.width = cw * S; c1.height = ch * S;
    const x1 = c1.getContext('2d', { willReadFrequently: true });
    if (!x1) throw new Error('Tuval açılamadı');
    x1.imageSmoothingEnabled = true; x1.imageSmoothingQuality = 'high'; x1.drawImage(c0, 0, 0, cw * S, ch * S);
    img = x1.getImageData(0, 0, cw * S, ch * S);
  }
  const W0 = img.width, H0 = img.height, d = img.data;
  const bx2 = S > 1 ? 0 : bx, by2 = S > 1 ? 0 : by, bw = S > 1 ? W0 : cw, bh = S > 1 ? H0 : ch;
  const hist = new Uint32Array(256), g = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) { const j = ((y + by2) * W0 + x + bx2) * 4; const v = (d[j]! * 77 + d[j + 1]! * 150 + d[j + 2]! * 29) >> 8; g[y * bw + x] = v; hist[v]!++; }
  }
  const n = bw * bh, th = otsu(hist, n, 160, 90, 200);
  const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = g[i]! < th ? 1 : 0;
  // Uzun çizgiler silinir (yazı yüksekliğinin yaklaşık 2.5 katından uzun düz koşular).
  const L = Math.max(60 * S, Math.round(Math.max(img0.width, img0.height) * 0.017 * S)), kill = new Uint8Array(n);
  for (let y = 0; y < bh; y++) { let run = 0; for (let x = 0; x <= bw; x++) { if (x < bw && b[y * bw + x]) run++; else { if (run >= L) for (let k = x - run; k < x; k++) kill[y * bw + k] = 1; run = 0; } } }
  for (let x = 0; x < bw; x++) { let run = 0; for (let y = 0; y <= bh; y++) { if (y < bh && b[y * bw + x]) run++; else { if (run >= L) for (let k = y - run; k < y; k++) kill[k * bw + x] = 1; run = 0; } } }
  for (let i = 0; i < n; i++) if (kill[i]) b[i] = 0;
  // Tek piksel kırıntıları.
  for (let y = 1; y < bh - 1; y++) {
    for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x; if (!b[i]) continue;
      const c = b[i - 1]! + b[i + 1]! + b[i - bw]! + b[i + bw]! + b[i - bw - 1]! + b[i - bw + 1]! + b[i + bw - 1]! + b[i + bw + 1]!;
      if (c === 0) b[i] = 0;
    }
  }
  const ow = rot ? bh : bw, oh = rot ? bw : bh;
  const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Tuval açılamadı');
  const out = ctx.createImageData(ow, oh), od = out.data, ob = new Uint8Array(ow * oh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const on = b[y * bw + x]!, xr = rot ? bh - 1 - y : x, yr = rot ? x : y, q = yr * ow + xr, j = q * 4, v = on ? 0 : 255;
      ob[q] = on; od[j] = od[j + 1] = od[j + 2] = v; od[j + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const blob = await new Promise<Blob>((coz, reddet) => cv.toBlob((x) => { if (x) coz(x); else reddet(new Error('Görüntü üretilemedi')); }, 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), ow, oh, bx, by, bw, bh, bin: ob, S };
}

export interface OcrSecenegi { box?: readonly number[] | null; rotate?: boolean; onProgress?: ((p: number) => void) | null }

// Sayfa görüntüsünden yazı okunur; öğeler pdf metin katmanıyla aynı biçimdedir. Büyük sayfa karo karo okunur: arayüz donmaz, ilerleme görünür.
export async function ocrGoruntu(img: ImageData, opt: OcrSecenegi = {}): Promise<OcrOgesi[]> {
  const { TM, api } = await tesseract();
  const passes = opt.rotate === false ? [false] : [false, true], items: OcrOgesi[] = [];
  let done = 0; const total = passes.length;
  for (const rot of passes) {
    const P = await hazirla(img, rot, opt.box);
    TM.FS.writeFile('/input', P.png);
    if (api.SetImageFile(1, 0) === 1) throw new Error('Görüntü OCR\'a verilemedi');
    const tw = 1600, th = 1600, ov = 220, tiles: [number, number, number, number][] = [];
    for (let y = 0; y < P.oh; y += th - ov) for (let x = 0; x < P.ow; x += tw - ov) tiles.push([x, y, Math.min(tw, P.ow - x), Math.min(th, P.oh - y)]);
    for (let t = 0; t < tiles.length; t++) {
      const [x, y, w, h] = tiles[t]!;
      if (w < 40 || h < 40) continue;
      api.SetRectangle(x, y, w, h);
      api.Recognize(null);
      const tsv = api.GetTSVText(0) || '';
      const sym = (api.GetBoxText(0) || '').split('\n').map((l) => l.split(' ')).filter((c) => c.length >= 6)
        .map((c) => ({ ch: c[0]!, x0: +c[1]!, y0: P.oh - +c[4]!, x1: +c[3]!, y1: P.oh - +c[2]! }));
      for (const ln of tsv.split('\n')) {
        const c = ln.split('\t'); if (c.length < 12 || c[0] !== '5') continue;
        let conf = +c[10]!, t0 = (c[11] || '').trim(); if (!t0) continue;
        const l = +c[6]!, tp = +c[7]!, ww = +c[8]!, hh = +c[9]!;
        if (hh < 7 * P.S || ww < 4) continue;
        // Çap işareti çoğu zaman 2, @, 0 ya da O okunur: ilk karakterin genişliği ve delik yapısıyla düzeltilir.
        if (/^[2@0OQ8693D%¢øo]\S*\d/.test(t0)) {
          const ss = sym.filter((q) => q.x0 >= l - 2 && q.x1 <= l + ww + 2 && q.y0 >= tp - 3 && q.y1 <= tp + hh + 3).sort((p, q) => p.x0 - q.x0);
          if (ss.length >= 2) {
            const f = ss[0]!, dw = ss.slice(1).filter((q) => /\d/.test(q.ch)).map((q) => q.x1 - q.x0).sort((p, q) => p - q), md = dw.length ? dw[dw.length >> 1]! : 0;
            if ((md && f.x1 - f.x0 >= md * 1.24 && /^[2@0OQ%¢øoD]/.test(t0)) || capIsaretiMi(P.bin, P.ow, P.oh, f.x0, f.y0, f.x1, f.y1)) { t0 = 'Ø' + t0.slice(1); conf = Math.max(conf, 72); }
          }
        }
        const txt = ocrDuzelt(t0); if (!txt || (conf < 50 && !/\d/.test(txt))) continue;
        const k = 1 / P.S;
        items.push(!rot
          ? { s: txt, x: P.bx + l * k, y: P.by + (tp + hh) * k, h: hh / 0.72 * k, a: 0, w: ww * k, conf, font: 'ocr' }
          : { s: txt, x: P.bx + (tp + hh) * k, y: P.by + (P.bh - 1 - l) * k, h: hh / 0.72 * k, a: -Math.PI / 2, w: ww * k, conf, font: 'ocr' });
      }
      opt.onProgress?.((done + (t + 1) / tiles.length) / total);
      await bekle(0);
    }
    done++;
  }
  return kelimeAyikla(items);
}

export interface OcrSayfasi { w: number; h: number; scale: number; ink: Uint8Array | null }
// Bütün sayfa OCR'ı. Büyük paftada (A2-A0) yazılar sayfa görüntüsünde küçük kalır: sayfa karolara bölünüp her karo yüksek çözünürlükte
// yeniden çizilir. mask okunabilir PDF yazılarıdır, dpi pt başına piksel hedefidir.
export async function ocrPdfSayfasi(pdf: PdfBelgesi | null, n: number, P: OcrSayfasi,
  opt: { img?: ImageData | null; mask?: readonly MetinOgesi[] | null; dpi?: number; onProgress?: ((p: number) => void) | null } = {}): Promise<OcrOgesi[]> {
  const target = opt.dpi || 3.2, f = pdf && P.scale ? Math.min(3, target / P.scale) : 1;
  const mask = opt.mask && opt.mask.length ? opt.mask : null;
  if (f < 1.2 || !pdf) {
    let img = opt.img; if (!img) return [];
    if (mask) { img = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height); yaziMaskele(img, mask, 0, 0, 1); }
    return ocrGoruntu(img, { onProgress: opt.onProgress ?? null });
  }
  const T = Math.round(1500 / f), ov = Math.round(T * 0.12), tiles: [number, number, number, number][] = [];
  for (let y = 0; y < P.h; y += T - ov) for (let x = 0; x < P.w; x += T - ov) tiles.push([x, y, Math.min(T, P.w - x), Math.min(T, P.h - y)]);
  // Boş karolar atlanır (mürekkep yoksa okunacak yazı da yok).
  const inkIn = (b: readonly number[]) => {
    if (!P.ink) return 1;
    let c = 0; const st = 3;
    for (let y = b[1]!; y < b[1]! + b[3]!; y += st) for (let x = b[0]!; x < b[0]! + b[2]!; x += st) if (P.ink[y * P.w + x]) c++;
    return c;
  };
  const work = tiles.filter((b) => b[2] > 20 && b[3] > 20 && inkIn(b) > 30);
  const all: OcrOgesi[] = [];
  for (let t = 0; t < work.length; t++) {
    const b = work[t]!, R = await pdfBolge(pdf, n, P.scale, b, f);
    if (mask) yaziMaskele(R.img, mask.filter((o) => o.x > b[0] - o.w - o.h && o.x < b[0] + b[2] + o.h && o.y > b[1] - o.w - o.h && o.y < b[1] + b[3] + o.h * 2), b[0], b[1], f);
    const ilerleme = opt.onProgress;
    const it = await ocrGoruntu(R.img, { onProgress: ilerleme ? (p) => ilerleme((t + p) / work.length) : null });
    for (const o of it) { o.x = b[0] + o.x / f; o.y = b[1] + o.y / f; o.w /= f; o.h /= f; all.push(o); }
  }
  return kelimeAyikla(all);
}
