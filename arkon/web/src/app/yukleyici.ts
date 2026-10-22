import { IN_APP, perf } from './temel';
import { calisanOkuyucu } from '../data/step-calisani';

/* ── çevrimdışı kütüphane yükleyici ── */
export const LIBS: Record<string, any> = {};
// Tek dosya sürümünde kütüphaneler sayfaya gömülüdür (<script id="lib-…">). Kaynak kod projesinde
// index.html window.ARKON_FILES ile dosya yollarını verir; örnek dosyalar açılışta önceden yüklenir.
export const FILES = window.ARKON_FILES || null, FILEDATA: Record<string, any> = {};
export async function preloadFiles() {
  if (!FILES) return;
  await Promise.all(Object.entries<any>(FILES).filter(([id, f]) => f.preload && !document.getElementById(id)).map(async ([id, f]) => { const r = await fetch(f.path); if (!r.ok) throw new Error(f.path + ' yüklenemedi'); FILEDATA[id] = new Uint8Array(await r.arrayBuffer()); }));
}
/** gömülü ya da dosyadan ikili veri (gzip ise açılmış hâli) */
export async function libBin(id) {
  if (document.getElementById('lib-' + id)) return gunzip(b64bytes('lib-' + id));
  const f = FILES && FILES[id]; if (!f) throw new Error('Kütüphane bulunamadı: ' + id);
  const r = await fetch(f.path); if (!r.ok) throw new Error(f.path + ' yüklenemedi (yerel sunucu gerekli)');
  const u = new Uint8Array(await r.arrayBuffer()); return f.gz ? gunzip(u) : u;
}
/** örnek verisi sayfada gömülü ya da önceden yüklenmiş mi (TB2) */
export const ornekVerisiVar = (id: string) => !!(document.getElementById(id) || FILEDATA[id]);
export function b64bytes(id) { const el = document.getElementById(id); if (!el) { if (FILEDATA[id]) return FILEDATA[id].slice(); throw new Error('Gömülü veri yok: ' + id); } const bin = atob(el.textContent.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export async function gunzip(u) { if (typeof DecompressionStream === 'undefined') throw new Error('Tarayıcı çok eski (DecompressionStream yok). Chrome/Edge güncel sürüm kullanın.'); const st = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(st).arrayBuffer()); }
export function loadLib(id) {
  if (!LIBS[id] && !document.getElementById('lib-' + id) && FILES && FILES[id]) LIBS[id] = new Promise<void>((res, rej) => { const t0 = performance.now(), s = document.createElement('script'); s.src = FILES[id].path; s.onload = () => { perf('lib:' + id, t0); res(); }; s.onerror = () => rej(new Error(FILES[id].path + ' yüklenemedi')); document.head.appendChild(s); });
  if (!LIBS[id]) LIBS[id] = (async () => { const t0 = performance.now(); const code = new TextDecoder().decode(await gunzip(b64bytes('lib-' + id))); const s = document.createElement('script'); s.textContent = code; document.head.appendChild(s); perf('lib:' + id, t0); })();
  return LIBS[id];
}
/** ES modül kütüphanesi (pdf.js 6): dosya yolundan, tek dosya sürümünde gömülü kopyadan içe aktarılır. Düşerse sonraki deneme yeniden yükler. */
export const MODS: Record<string, Promise<any>> = {};
export function loadModule(id) {
  if (!MODS[id]) MODS[id] = (async () => {
    const t0 = performance.now();
    let url;
    if (document.getElementById('lib-' + id)) url = URL.createObjectURL(new Blob([await gunzip(b64bytes('lib-' + id))], { type: 'text/javascript' }));
    else if (FILES && FILES[id]) url = new URL(FILES[id].path, document.baseURI).href;
    else throw new Error('Kütüphane bulunamadı: ' + id);
    const m = await import(/* @vite-ignore */ url); perf('lib:' + id, t0); return m;
  })().catch(h => { delete MODS[id]; throw h; });
  return MODS[id];
}
export let OCCT = null;
/* Dosya sürümünde okuyucu ayrı çalışanda koşar (kendi içerik ilkesiyle, step-calisani.ts); tek dosya sürümünde çalışan dosyası yoktur, ana iş parçacığında kalır.
   İki yolda da ReadStepFile/ReadIgesFile sonucu await ile alınır. Kurulum düşerse sonraki deneme yeniden kurar. */
export async function getOcct() {
  if (!OCCT) OCCT = (async () => {
    const t0 = performance.now();
    const wasm = await libBin('occtwasm');
    const yol = FILES && FILES.occtcalisan && typeof Worker !== 'undefined' ? FILES.occtcalisan.path : null;
    const m = yol ? await calisanOkuyucu(new Worker(yol), wasm.buffer) : await (async () => { await loadLib('occt'); return window.occtimportjs({ wasmBinary: wasm.buffer }); })();
    perf('occt:init', t0); return m;
  })().catch(h => { OCCT = null; throw h; });
  return OCCT;
}
export const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
export const LS = { get(k) { try { return JSON.parse(localStorage.getItem('arkon:' + k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('arkon:' + k, JSON.stringify(v)); } catch (e) {} } };
export async function download(name, data, type) {
  if (!window.ArkonAndroid && IN_APP && window.claude && window.claude.use) {
    try { const d = await window.claude.use('downloads'); if (d) { if (/\.arkon$/i.test(name)) name += '.json'; await d.save({ filename: name, data: data }); return; } }
    catch (e) { if (e && (e.code === 'declined' || e.code === 'rate_limited')) return; }
  }
  if (window.ArkonAndroid && window.ArkonAndroid.save) { const u8 = typeof data === 'string' ? new TextEncoder().encode(data) : data; let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); window.ArkonAndroid.save(name, btoa(bin), type || 'application/octet-stream'); return; } const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500); }
/* performans modu: zayıf tablette bulanıklık ve sürekli animasyonlar kapanır (otomatik ya da elle) */
let takildi = false;
export const LITE = {
  auto() { const n = navigator.hardwareConcurrency || 8, m = (navigator as any).deviceMemory || 8; let rm = false; try { rm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {} return n <= 4 || m <= 3 || rm; },
  get() { const v = LS.get('lite'); return v === true || v === false ? v : takildi || LITE.auto(); },
  set(v) { LS.set('lite', v); document.documentElement.classList.toggle('lite', v); }
};
document.documentElement.classList.toggle('lite', LITE.get());
/* Elle seçim yoksa takılan cihazda performans modu oturum boyunca açılır: donanım sayısı güçlü görünen tablet de takılabilir.
   Tarayıcının uzun kare bildirimi dinlenir (ayrı ölçüm döngüsü yok); açılışın ağır ilk saniyeleri sayılmaz, bir kez açılan kapanmaz. */
const TAKILMA_MS = 100, TAKILMA_SAYISI = 3, TAKILMA_PENCERE_MS = 10000, ACILIS_MS = 5000;
(function takilmaGozle() {
  if (typeof PerformanceObserver === 'undefined' || LITE.get()) return;
  const tur = (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
  let uzun: number[] = [];
  const g = new PerformanceObserver(l => {
    if (LS.get('lite') !== null) { g.disconnect(); return; }
    const simdi = performance.now();
    for (const e of l.getEntries()) if (e.duration >= TAKILMA_MS && e.startTime >= ACILIS_MS) uzun.push(e.startTime);
    uzun = uzun.filter(t => simdi - t < TAKILMA_PENCERE_MS);
    if (uzun.length > TAKILMA_SAYISI) { takildi = true; document.documentElement.classList.add('lite'); g.disconnect(); }
  });
  try { g.observe({ type: tur, buffered: true }); } catch (e) {}
})();
// Düğme TMI kabuğunun üst çubuğundadır (tüm uygulama için tek); kabuk aynı 'arkon:lite' anahtarını yazar, açık Arkon ekranı yeniden yüklenmeden uyar.
window.addEventListener('storage', e => { if (e.key === 'arkon:lite') document.documentElement.classList.toggle('lite', LITE.get()); });
/** Ekran modülleri (Ayarlar sayfasından açılıp kapanır; bu cihazda saklanır) */
export const FEAT0 = { spindle: false, autoCount: false };
export const FEAT = { get() { return Object.assign({}, FEAT0, LS.get('feat') || {}); }, set(k, v) { LS.set('feat', Object.assign(FEAT.get(), { [k]: v })); } };
