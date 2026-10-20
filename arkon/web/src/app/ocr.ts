import { libBin, loadLib, tick } from './yukleyici';
import { pdfRenderRegion } from './pdf';

/* ── Çevrimdışı OCR: Tesseract (LSTM, wasm) — metni çizgiye dönüştürülmüş / taranmış resimler için ── */
export let TESS = null;
export function getTess() {
  if (!TESS) TESS = (async () => {
    await loadLib('tesscore');
    const wasm = await libBin('tesswasm');
    const TM = await window.TesseractCore({ wasmBinary: wasm, print() {}, printErr() {} });
    TM.FS.writeFile('/eng.traineddata', await libBin('tesseng'));
    const api = new TM.TessBaseAPI();
    if (api.Init(null, 'eng', 1) === -1) throw new Error('OCR modeli yüklenemedi');
    api.SetVariable('tessedit_pageseg_mode', '11');
    api.SetVariable('user_defined_dpi', '300');
    api.SetVariable('debug_file', '/dev/null');
    return { TM, api };
  })().catch(e => { TESS = null; throw e; });
  return TESS;
}
/** ImageData → OCR'a hazır siyah-beyaz PNG: uzun yatay/dikey çizgiler silinir, kırıntılar temizlenir; rot=1 → 90° saat yönü */
export async function ocrPrep(img0, rot, box) {
  const bx = box ? Math.max(0, Math.floor(box[0])) : 0, by = box ? Math.max(0, Math.floor(box[1])) : 0;
  const cw = box ? Math.min(img0.width - bx, Math.ceil(box[2])) : img0.width, ch = box ? Math.min(img0.height - by, Math.ceil(box[3])) : img0.height;
  // küçük bölge: 2× büyüt (Tesseract ~30 px yazı yüksekliğini sever)
  let img = img0, S = 1, ox = bx, oy = by;
  if (box && cw * ch < 1.6e6) {
    S = 2; const c0 = document.createElement('canvas'); c0.width = cw; c0.height = ch; c0.getContext('2d').putImageData(img0, -bx, -by, bx, by, cw, ch);
    const c1 = document.createElement('canvas'); c1.width = cw * S; c1.height = ch * S; const x1 = c1.getContext('2d', { willReadFrequently: true }); x1.imageSmoothingEnabled = true; x1.imageSmoothingQuality = 'high'; x1.drawImage(c0, 0, 0, cw * S, ch * S);
    img = x1.getImageData(0, 0, cw * S, ch * S); ox = 0; oy = 0;
  }
  const W0 = img.width, H0 = img.height, d = img.data;
  const bx2 = S > 1 ? 0 : bx, by2 = S > 1 ? 0 : by, bw = S > 1 ? W0 : cw, bh = S > 1 ? H0 : ch;
  // Otsu eşiği
  const hist = new Uint32Array(256), g = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const j = ((y + by2) * W0 + x + bx2) * 4; const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; g[y * bw + x] = v; hist[v]++; }
  let sum = 0, sB = 0, wB = 0, best = 0, th = 160; const n = bw * bh; for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
  th = Math.min(200, Math.max(90, th));
  const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = g[i] < th ? 1 : 0;
  // uzun çizgileri sil (yazı yüksekliğinin ~2.5 katından uzun düz koşular)
  const L = Math.max(60 * S, Math.round(Math.max(img0.width, img0.height) * 0.017 * S)), kill = new Uint8Array(n);
  for (let y = 0; y < bh; y++) { let run = 0; for (let x = 0; x <= bw; x++) { if (x < bw && b[y * bw + x]) run++; else { if (run >= L) for (let k = x - run; k < x; k++) kill[y * bw + k] = 1; run = 0; } } }
  for (let x = 0; x < bw; x++) { let run = 0; for (let y = 0; y <= bh; y++) { if (y < bh && b[y * bw + x]) run++; else { if (run >= L) for (let k = y - run; k < y; k++) kill[k * bw + x] = 1; run = 0; } } }
  for (let i = 0; i < n; i++) if (kill[i]) b[i] = 0;
  // tek piksel kırıntıları
  for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) { const i = y * bw + x; if (!b[i]) continue; const c = b[i - 1] + b[i + 1] + b[i - bw] + b[i + bw] + b[i - bw - 1] + b[i - bw + 1] + b[i + bw - 1] + b[i + bw + 1]; if (c === 0) b[i] = 0; }
  const ow = rot ? bh : bw, oh = rot ? bw : bh;
  const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
  const ctx = cv.getContext('2d'), out = ctx.createImageData(ow, oh), od = out.data, ob = new Uint8Array(ow * oh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const on = b[y * bw + x], xr = rot ? bh - 1 - y : x, yr = rot ? x : y, q = yr * ow + xr, j = q * 4, v = on ? 0 : 255;
    ob[q] = on; od[j] = od[j + 1] = od[j + 2] = v; od[j + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const png = new Uint8Array(await (await new Promise<Blob>(r => cv.toBlob(r, 'image/png'))).arrayBuffer());
  return { png, ow, oh, bx, by, bw, bh, bin: ob, S };
}
export const OCR_DIG = { O: '0', o: '0', D: '0', Q: '0', S: '5', s: '5', I: '1', l: '1', '|': '1', i: '1', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9', A: '4', T: '7' };
export function ocrFix(s) {
  s = s.replace(/^[“"'‘`]+|[”"'’`]+$/g, '').replace(/^[£t](?=\s?\d)/, '±').replace(/^([±+-])0(\d+)$/, '$10.$2');
  s = s.replace(/^[O@%Q¢øoD](?=\d)/, 'Ø');
  // önek (Ø/R/M/C) + sayıya benzeyen harfler → rakam (RS → R5, RO.4 → R0.4)
  s = s.replace(/^(Ø|R|M|C)([0-9OoDQSsIlBZzGbgqi|.,]{1,6})$/, (m, p, r) => /[0-9]/.test(r) || r.length <= 2 ? p + r.replace(/[^0-9.,]/g, ch => OCR_DIG[ch] || ch) : m);
  s = s.replace(/^([0-9OoSIlBZ.,]{2,8})$/, (m, r) => /^\d/.test(r) && /\d/.test(r.slice(1)) ? r.replace(/[^0-9.,]/g, ch => OCR_DIG[ch] || ch) : m);
  return s.replace(/(\d)[o*º](?=$|\s|[±+-])/g, '$1°').replace(/(\d)[Il|](?=\d)/g, '$11');
}
/** Karakter kutusunda çap işareti (Ø) var mı: halka + çapraz çizgi → iki çapraz delik */
export function looksDia(bin, W, H, x0, y0, x1, y1) {
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 6 || h < 6 || w * h > 40000) return false;
  const lab = new Int32Array(w * h), st = [];
  const at = (x, y) => bin[(y0 + y) * W + x0 + x];
  // kenara değen boşluklar = dış
  const fill = (sx, sy, id) => { let n = 0, cx = 0, cy = 0; st.push(sx, sy); lab[sy * w + sx] = id; while (st.length) { const y = st.pop(), x = st.pop(); n++; cx += x; cy += y; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const k = ny * w + nx; if (lab[k] || at(nx, ny)) continue; lab[k] = id; st.push(nx, ny); } } return [n, cx / n, cy / n]; };
  for (let x = 0; x < w; x++) { if (!lab[x] && !at(x, 0)) fill(x, 0, -1); if (!lab[(h - 1) * w + x] && !at(x, h - 1)) fill(x, h - 1, -1); }
  for (let y = 0; y < h; y++) { if (!lab[y * w] && !at(0, y)) fill(0, y, -1); if (!lab[y * w + w - 1] && !at(w - 1, y)) fill(w - 1, y, -1); }
  const holes = []; let id = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!lab[k] && !at(x, y)) { const r = fill(x, y, id++); if (r[0] >= 4) holes.push(r); } }
  if (holes.length !== 2) return false;
  const dx = Math.abs(holes[0][1] - holes[1][1]), dy = Math.abs(holes[0][2] - holes[1][2]);
  return dx > w * 0.18 && dy > h * 0.18;
}
/**
 * Sayfa görüntüsünden yazı okur. Dönen öğeler pdfDims ile aynı biçimdedir.
 * opt: { box:[x,y,w,h] (yalnız bölge), rotate: true (dikey yazılar için ikinci geçiş), onProgress(0..1) }
 */
export async function ocrImage(img, opt) {
  opt = opt || {};
  const { TM, api } = await getTess();
  const passes = opt.rotate === false ? [0] : [0, 1], items = [];
  let done = 0; const total = passes.length;
  for (const rot of passes) {
    const P = await ocrPrep(img, rot, opt.box);
    TM.FS.writeFile('/input', P.png);
    if (api.SetImageFile(1, 0) === 1) throw new Error('Görüntü OCR\'a verilemedi');
    // büyük sayfalar karo karo okunur: arayüz donmasın, ilerleme gösterilsin
    const tw = 1600, th = 1600, ov = 220, tiles = [];
    for (let y = 0; y < P.oh; y += th - ov) for (let x = 0; x < P.ow; x += tw - ov) tiles.push([x, y, Math.min(tw, P.ow - x), Math.min(th, P.oh - y)]);
    for (let t = 0; t < tiles.length; t++) {
      const [x, y, w, h] = tiles[t];
      if (w < 40 || h < 40) continue;
      api.SetRectangle(x, y, w, h);
      api.Recognize(null);
      const tsv = api.GetTSVText(0) || '';
      const sym = (api.GetBoxText(0) || '').split('\n').map(l => l.split(' ')).filter(c => c.length >= 6).map(c => ({ ch: c[0], x0: +c[1], y0: P.oh - +c[4], x1: +c[3], y1: P.oh - +c[2] }));
      for (const ln of tsv.split('\n')) {
        const c = ln.split('\t'); if (c.length < 12 || c[0] !== '5') continue;
        let conf = +c[10], t0 = (c[11] || '').trim(); if (!t0) continue;
        const l = +c[6], tp = +c[7], ww = +c[8], hh = +c[9];
        if (hh < 7 * P.S || ww < 4) continue;
        // çap işareti çoğu zaman 2 / @ / 0 / O okunur: ilk karakterin genişliği ve delik yapısı ile düzelt
        if (/^[2@0OQ8693D%¢øo]\S*\d/.test(t0)) {
          const ss = sym.filter(q => q.x0 >= l - 2 && q.x1 <= l + ww + 2 && q.y0 >= tp - 3 && q.y1 <= tp + hh + 3).sort((p, q) => p.x0 - q.x0);
          if (ss.length >= 2) {
            const f = ss[0], dw = ss.slice(1).filter(q => /\d/.test(q.ch)).map(q => q.x1 - q.x0).sort((p, q) => p - q), md = dw.length ? dw[dw.length >> 1] : 0;
            if ((md && f.x1 - f.x0 >= md * 1.24 && /^[2@0OQ%¢øoD]/.test(t0)) || looksDia(P.bin, P.ow, P.oh, f.x0, f.y0, f.x1, f.y1)) { t0 = 'Ø' + t0.slice(1); conf = Math.max(conf, 72); }
          }
        }
        const txt = ocrFix(t0); if (!txt || (conf < 50 && !/\d/.test(txt))) continue;
        let o;
        const k = 1 / P.S;
        if (!rot) o = { s: txt, x: P.bx + l * k, y: P.by + (tp + hh) * k, h: hh / 0.72 * k, a: 0, w: ww * k, conf };
        else o = { s: txt, x: P.bx + (tp + hh) * k, y: P.by + (P.bh - 1 - l) * k, h: hh / 0.72 * k, a: -Math.PI / 2, w: ww * k, conf };
        o.font = 'ocr'; items.push(o);
      }
      if (opt.onProgress) opt.onProgress((done + (t + 1) / tiles.length) / total);
      await tick(0);
    }
    done++;
  }
  return dedupeWords(items);
}
/** Karo bindirmesinden ve iki geçişten gelen çakışmaları ayıklar (rakamlı, uzun ve güvenli okuma kalır) */
export function wordBox(o) { const c = Math.cos(o.a || 0), s = Math.sin(o.a || 0), x2 = o.x + c * o.w, y2 = o.y + s * o.w; const hx = s * o.h * 0.72, hy = -c * o.h * 0.72; const xs = [o.x, x2, o.x + hx, x2 + hx], ys = [o.y, y2, o.y + hy, y2 + hy]; return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
export function dedupeWords(items) {
  items.forEach(o => { o.bb = wordBox(o); });
  const val = o => (/\d/.test(o.s) ? 100 + Math.min(o.s.length, 6) * 10 : 0) + o.conf;
  items.sort((p, q) => val(q) - val(p));
  const keep = [];
  for (const o of items) {
    const ov = keep.find(k => { const a = k.bb, b = o.bb, ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); const ar = (b[2] - b[0]) * (b[3] - b[1]); return ix * iy > 0.45 * Math.min(ar, (a[2] - a[0]) * (a[3] - a[1])); });
    if (!ov) keep.push(o);
  }
  return keep;
}
/** Okunabilir PDF yazılarını görüntüden siler: OCR yalnız çizgiye dönüşmüş yazıları okur, aynı ölçü iki kez gelmez */
export function maskText(img, items, ox, oy, f) {
  if (!items || !items.length) return img;
  const W = img.width, H = img.height, d = img.data;
  for (const o of items) {
    if (!/[0-9A-Za-z]/.test(o.s)) continue;
    const b = wordBox(o), p = o.h * 0.22;
    const x0 = Math.max(0, Math.floor((b[0] - p - ox) * f)), y0 = Math.max(0, Math.floor((b[1] - p - oy) * f)), x1 = Math.min(W, Math.ceil((b[2] + p - ox) * f)), y1 = Math.min(H, Math.ceil((b[3] + p - oy) * f));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = 255; }
  }
  return img;
}
/**
 * Bütün sayfa OCR'ı. Büyük paftada (A2–A0) yazılar sayfa görüntüsünde küçük kalır: sayfa karolara bölünüp
 * her karo yüksek çözünürlükte yeniden çizilir. opt: { img, ink, mask (okunabilir PDF yazıları), dpi (pt başına px hedefi), onProgress }
 */
export async function ocrPdfPage(pdf, n, P, opt) {
  opt = opt || {};
  const target = opt.dpi || 3.2, f = pdf && P.scale ? Math.min(3, target / P.scale) : 1;
  const mask = opt.mask && opt.mask.length ? opt.mask : null;
  if (f < 1.2) {
    let img = opt.img; if (!img) return [];
    if (mask) { img = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height); maskText(img, mask, 0, 0, 1); }
    return ocrImage(img, { onProgress: opt.onProgress });
  }
  const T = Math.round(1500 / f), ov = Math.round(T * 0.12), tiles = [];
  for (let y = 0; y < P.h; y += T - ov) for (let x = 0; x < P.w; x += T - ov) tiles.push([x, y, Math.min(T, P.w - x), Math.min(T, P.h - y)]);
  // boş karoları atla (mürekkep yoksa okunacak yazı da yok)
  const inkIn = b => { if (!P.ink) return 1; let c = 0; const st = 3; for (let y = b[1]; y < b[1] + b[3]; y += st) for (let x = b[0]; x < b[0] + b[2]; x += st) if (P.ink[y * P.w + x]) c++; return c; };
  const work = tiles.filter(b => b[2] > 20 && b[3] > 20 && inkIn(b) > 30);
  const all = [];
  for (let t = 0; t < work.length; t++) {
    const b = work[t], R = await pdfRenderRegion(pdf, n, P.scale, b, f);
    if (mask) maskText(R.img, mask.filter(o => o.x > b[0] - o.w - o.h && o.x < b[0] + b[2] + o.h && o.y > b[1] - o.w - o.h && o.y < b[1] + b[3] + o.h * 2), b[0], b[1], f);
    const it = await ocrImage(R.img, { onProgress: opt.onProgress ? p => opt.onProgress((t + p) / work.length) : null });
    for (const o of it) { o.x = b[0] + o.x / f; o.y = b[1] + o.y / f; o.w /= f; o.h /= f; all.push(o); }
  }
  return dedupeWords(all);
}

