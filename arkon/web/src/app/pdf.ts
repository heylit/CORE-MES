import { perf } from './temel';
import { FILES, LS, loadModule } from './yukleyici';
import { cssv, rgbOf } from './ortak-ayarlar';

/* ── PDF: çiz, renklendir, ölçü metinlerini oku ── */
let PDFJS = null;
/* Ayrıştırma ana iş parçacığında kalır (pdf.js 3'teki gibi): içe aktarılan çalışan modülü globalThis.pdfjsWorker'ı kurar, pdf.js onu
   sahte çalışan olarak kullanır; ayrı çalışan ve ilkesinde yeni satır gerekmez. */
async function pdfjs() {
  if (!PDFJS) { const [lib] = await Promise.all([loadModule('pdfjs'), loadModule('pdfworker')]); PDFJS = lib; }
  return PDFJS;
}
/* JPEG 2000 ve JBIG2 çözücülerinin wasm'sız sürümü (pdf.js 3'te içerideydi): wasm derlemesi ve ICC renk dönüşümü kapalı kalır.
   Adres mutlak verilir: pdf.js onu kendi modülüne göre değil olduğu gibi kullanır. Tek dosya sürümünde çözücü dosyası yoktur. */
const wasmUrl = () => FILES && FILES.pdfjs ? new URL(FILES.pdfjs.path.replace(/[^/]*$/, '') + 'wasm/', document.baseURI).href : null;
export async function pdfOpen(bytes, askPw) {
  const lib = await pdfjs();
  // isEvalSupported pdf.js 6'da yok sayılır (eval yolu kaldırıldı); 3'e geri dönülürse önlem kendiliğinden geçerli kalsın diye korunur.
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, useWasm: false, wasmUrl: wasmUrl() });
  let gaveUp = false, asked = false;
  task.onPassword = (cb, reason) => { asked = true; const ask = askPw ? askPw(reason === 2) : Promise.resolve(null); ask.then(pw => { if (pw == null) { gaveUp = true; task.destroy(); } else cb(pw); }); };
  try { const pdf = await task.promise; pdf.arkonEnc = asked; return pdf; } catch (e) { if (gaveUp || (e && e.name === 'PasswordException')) throw new Error('PDF şifreli · şifre girilmedi'); throw e; }
}
/* ── Okuma ayarları (Çizim stüdyosunda değiştirilir; tüm sistemde geçerli olanı kv/LS 'readCfg') ── */
export const RCFG0 = { res: 4200, bold: 1, look: 'net', ocr: 'auto', dpi: 3.2, minDims: 3, ex: { table: true, border: true, notes: true, prose: true }, auto: 'mid', balS: 1, mesh: 'normal', hidden: true, fa: 'auto', autoDim: true };
export const cfgFix = c => { const o = Object.assign({}, RCFG0, c || {}, { ex: Object.assign({}, RCFG0.ex, (c && c.ex) || {}) }); if (o.look === 'tint') o.look = 'net'; return o; }; // 'tint' eski varsayılandı → net
export let RCFG = cfgFix(LS.get('readCfg'));
export const setRCFG = c => { RCFG = cfgFix(c); LS.set('readCfg', RCFG); PDFMEM.clear(); };
/** Önbellek anahtarına giren ayar imzası (varsayılanda boş: eski önbellek geçerli kalır) */
export const cfgSig = (c, keys) => { const o: Record<string, any> = {}; let diff = false; keys.forEach(k => { o[k] = c[k]; if (JSON.stringify(c[k]) !== JSON.stringify(RCFG0[k])) diff = true; }); if (!diff) return ''; let h = 0; const t = JSON.stringify(o); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return '~' + (h >>> 0).toString(36); };
export const PDF_KEYS = ['res', 'ocr', 'dpi', 'minDims', 'ex', 'auto'], LOOK_KEYS = ['bold', 'look'];
export async function pdfRender(pdf, n, cfg) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(8, ((cfg && cfg.res) || 4200) / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const t0 = performance.now(); await page.render({ canvasContext: ctx, viewport: vp }).promise; perf('pdf:render', t0);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const tc = await page.getTextContent();
  const fname: Record<string, any> = {}; const fontOf = id => { if (!(id in fname)) { try { const f = page.commonObjs.get(id); fname[id] = (f && (f.name || f.loadedName)) || ''; } catch (e) { fname[id] = ''; } } return fname[id]; };
  const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
    const t = PDFJS.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(t[2], t[3]), a = Math.atan2(t[1], t[0]);
    return { s: it.str, x: t[4], y: t[5], h, a, w: it.width * scale, font: fontOf(it.fontName) };
  });
  // okunabilir metin oranı: Type3 / ToUnicode'suz fontlar çöp karakter verir
  const good = items.filter(o => /[0-9A-Za-zÇĞİÖŞÜçğıöşüØ±°]/.test(o.s)).length;
  page.cleanup && page.cleanup();
  return { w: cv.width, h: cv.height, img, items, pages: pdf.numPages, scale, junk: items.length > 20 && good / items.length < 0.5 };
}
/** Yalnız görüntü: verilen ölçekte sayfayı çizer (ekran çözünürlüğünde net önizleme için) */
export async function pdfRenderImg(pdf, n, scale) {
  const page = await pdf.getPage(n), vp = page.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return ctx.getImageData(0, 0, cv.width, cv.height);
}
/** Sayfanın bir bölgesini yüksek çözünürlükte yeniden çizer (bölge OCR'ı için keskin görüntü) */
export async function pdfRenderRegion(pdf, n, baseScale, box, f0?) {
  const page = await pdf.getPage(n);
  const f = f0 || Math.max(1, Math.min(4, 2200 / Math.max(box[2], box[3])));
  const vp = page.getViewport({ scale: baseScale * f, offsetX: -box[0] * f, offsetY: -box[1] * f });
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(box[2] * f)); cv.height = Math.max(1, Math.round(box[3] * f));
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { img: ctx.getImageData(0, 0, cv.width, cv.height), f };
}
/** Metin katmanından ve OCR'dan gelen ölçüleri birleştirir; aynı yerdeki aynı değer bir kez sayılır */
export function mergeDims(a, b, W, bst) {
  const add = b.filter(p => !a.some(q => q.nom === p.nom && Math.hypot(q.tx - p.tx, q.ty - p.ty) < W * 0.012));
  const out = a.concat(add), sa = a.stats || {}, sb = bst || {};
  out.stats = Object.assign({}, sa, { found: out.length, ocr: true, ocrAdd: add.length, high: 0, mid: 0, low: 0 });
  out.forEach(o => { out.stats[o.lvl] = (out.stats[o.lvl] || 0) + 1; });
  ['table', 'border', 'notes', 'prose'].forEach(k => { out.stats[k] = (sa[k] || 0) + (sb[k] || 0); });
  return out;
}
/* PDF sayfa önbelleği: bellekte son 6 sayfa, kalıcısı IndexedDB'de (dosya özeti + sayfa no) */
export const PDFMEM = new Map();
export const memPut = (k, v) => { PDFMEM.delete(k); PDFMEM.set(k, v); while (PDFMEM.size > 6) PDFMEM.delete(PDFMEM.keys().next().value); };
export function packBits(a) { const o = new Uint8Array((a.length + 7) >> 3); for (let i = 0; i < a.length; i++) if (a[i]) o[i >> 3] |= 1 << (i & 7); return o; }
export function unpackBits(p, n) { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (p[i >> 3] >> (i & 7)) & 1; return a; }
export const pdfStore = C => { const o = Object.assign({}, C, { inkBits: packBits(C.ink) }); delete o.ink; return o; };
export function tint(img, theme, cfg, lo?) {
  const t0 = performance.now();
  const dark = theme === 'dark', look = (cfg && cfg.look) || 'net', bold = Math.max(0, (cfg && cfg.bold != null ? +cfg.bold : 1) - (lo ? 1 : 0)); // ekran çözünürlüğünde pdf.js çizgileri zaten 1 px: kalınlaştırma bir kademe az
  // net: koyu temada beyaza yakın, açık temada siyaha yakın çizgi · blue: mavi teknik resim (blueprint)
  const bp = look === 'blue' ? rgbOf(cssv('--bp')) : rgbOf(cssv('--pdf-ink')), net = look !== 'blue';
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  if (look === 'orig') { d.set(s); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').putImageData(out, 0, 0); return new Promise<Blob>(res => cv.toBlob(res, 'image/png')); }
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i], g = s[i + 1], b = s[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat = (mx - mn) / 255, ink = 1 - lum;
    if (ink < 0.05 && sat < 0.1) { d[i + 3] = 0; continue; }
    // yarı saydam kenar pikselleri güçlendirilir (gama): ince yazı silik görünmesin
    const a = net ? Math.pow(ink, lo ? 0.8 : 0.6) * (lo ? 1.3 : 1.5) : ink * 1.3;
    // net: yalnız kırmızı (eksen çizgisi) renkli kalır, diğer renkli yazı/çizgi mürekkep rengine döner
    if (sat > 0.22 && (!net || (r > 150 && g < 110 && b < 110))) { const k = dark ? 0.35 : 0; d[i] = r + (255 - r) * k; d[i + 1] = g + (255 - g) * k; d[i + 2] = b + (255 - b) * k; d[i + 3] = Math.min(255, (a * 1.08 + sat) * 255); }
    else { d[i] = bp[0]; d[i + 1] = bp[1]; d[i + 2] = bp[2]; d[i + 3] = Math.min(255, a * 255); }
  }
  // ince CAD çizgileri ekrana sığdırınca kaybolmasın: alfa kanalında 3×3 genişletme (kalınlaştırma ayarı kadar tekrar)
  const W = img.width, H = img.height, a0 = new Uint8ClampedArray(W * H);
  for (let pass = 0; pass < bold; pass++) {
  for (let i = 0, j = 3; i < a0.length; i++, j += 4) a0[i] = d[j];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (a0[i] > 200) continue;
    let m = a0[i], mi = i;
    const n = [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1];
    for (let q = 0; q < 8; q++) { const v = a0[n[q]] * (q < 4 ? 0.9 : 0.7); if (v > m) { m = v; mi = n[q]; } }
    if (mi !== i) { const o = 4 * i, p = 4 * mi; d[o] = d[p]; d[o + 1] = d[p + 1]; d[o + 2] = d[p + 2]; d[o + 3] = m; }
  }
  }
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').putImageData(out, 0, 0);
  perf('pdf:tint', t0); const t1 = performance.now();
  return new Promise<Blob>(res => cv.toBlob(b => { perf('pdf:png', t1); res(b); }, 'image/png'));
}
