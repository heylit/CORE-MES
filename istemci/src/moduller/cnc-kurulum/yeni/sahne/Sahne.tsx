import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { Vector2, type WebGLRenderer } from 'three';
import { glAl } from './gl.ts';
import { sahneRengi } from './renkler.ts';

// Görünümün 3B alanı. Prototipteki gibi tek WebGL çizici vardır (gl.ts); her Sahne her karede kendi öğesinin dikdörtgenine çizilir
// (prototipin renderRect/visibleRect'i) ve sonuç öğenin içindeki tuvale aktarılır. Prototipte tuval görünümlerin arkasındaydı;
// burada görünümlerin panelleri opaktır, aktarım her sahneyi kendi katmanında tutar. Çizici dikdörtgenin görünen kısmına kırpılmış
// gelir (viewport + scissor); temizleme, sahne ve kamera görünümündür. Dikdörtgen istemci (pencere) koordinatıdır. WebGL yoksa ya da
// ekran gizliyse çizim yapılmaz.

export interface Dikdortgen { left: number; top: number; width: number; height: number }
export interface Cizim {
  renderer: WebGLRenderer;
  rect: Dikdortgen;
  // Önceki kareden bu yana geçen süre (sn).
  dt: number;
  sahneRengi: (ad: string) => string;
}

interface Kayit { el: HTMLElement; tuval: HTMLCanvasElement; ciz: (c: Cizim) => void; iz: string }
const kayitlar = new Set<Kayit>();
let kirpma: HTMLElement | null = null;
let calisiyor = false;
let gorunur = false;
let son = 0;
const boyut = new Vector2();

// Görünüm alanını (kırpma) verir; ekran gizlenince ya da alan kalkınca döngü durur.
export function sahneAlaniKur(alan: HTMLElement | null, ekranGorunur: boolean): void {
  kirpma = alan;
  gorunur = alan !== null && ekranGorunur;
  baslat();
}

function baslat(): void {
  if (calisiyor || kayitlar.size === 0 || !gorunur || glAl() === null) return;
  calisiyor = true;
  son = performance.now();
  requestAnimationFrame(kare);
}

interface Gorunen { r: Kayit; e: DOMRect; left: number; top: number; w: number; h: number }

// Kare ana iş parçacığında uzun sürerse (zayıf grafik birimi) sonraki kare o kadar ertelenir: ekran tıklamaya ve yazmaya yanıt
// vermeye devam eder. Hızlı çizimde her ekran yenilemesinde çizilir.
const DOLULUK = 0.5;
function sonraki(sure: number): void {
  const bekle = sure * (1 / DOLULUK - 1);
  if (bekle < 8) requestAnimationFrame(kare);
  else setTimeout(() => { requestAnimationFrame(kare); }, bekle);
}

function kare(simdi: number): void {
  const g = glAl();
  if (!gorunur || kayitlar.size === 0 || g === null) { calisiyor = false; return; }
  const dt = Math.min(0.1, Math.max(0, simdi - son) / 1000);
  son = simdi;
  const { renderer, canvas } = g;
  const k = kirpma?.getBoundingClientRect();
  for (const r of kayitlar) {
    const e = r.el.getBoundingClientRect();
    const left = Math.max(e.left, k?.left ?? 0, 0), top = Math.max(e.top, k?.top ?? 0, 0);
    const right = Math.min(e.right, k?.right ?? window.innerWidth, window.innerWidth), bottom = Math.min(e.bottom, k?.bottom ?? window.innerHeight, window.innerHeight);
    const w = Math.floor(right - left), h = Math.floor(bottom - top);
    if (w <= 10 || h <= 10) { tuvaliGizle(r); continue; }
    const v: Gorunen = { r, e, left, top, w, h };
    // Çizici görünen kısmın boyundadır; kamera öğenin tamamına göre kurulur, kırpma yalnız görünen kısmı çizer.
    renderer.getSize(boyut);
    if (boyut.x !== w || boyut.y !== h) renderer.setSize(w, h, false);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, w, h);
    renderer.setViewport(e.left - left, h - (e.bottom - top), e.width, e.height);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    // Bir görünümün hatası öteki görünümlerin çizimini durdurmasın; hata konsolda kalır.
    try { r.ciz({ renderer, rect: { left: e.left, top: e.top, width: e.width, height: e.height }, dt, sahneRengi }); } catch (hata) { console.error(hata); }
    yerlestir(v);
    aktar(r.tuval, canvas);
  }
  sonraki(performance.now() - simdi);
}

// Tuval görünen kısmın üstündedir; yeri ve boyu tasarım değişkeniyle verilir (yalnız değişince yazılır).
function yerlestir(v: Gorunen): void {
  const t = v.r.tuval;
  // Gizli tuvalin konum öğesi yoktur; yer ölçülmeden önce açılır.
  if (t.hidden) t.hidden = false;
  const ust = t.offsetParent;
  const ur = ust?.getBoundingClientRect(), x = v.left - (ur?.left ?? 0) - (ust?.clientLeft ?? 0), y = v.top - (ur?.top ?? 0) - (ust?.clientTop ?? 0);
  const iz = `${String(x)}|${String(y)}|${String(v.w)}|${String(v.h)}`;
  if (iz === v.r.iz) return;
  v.r.iz = iz;
  t.style.setProperty('--tc-cy-sx', `${String(x)}px`); t.style.setProperty('--tc-cy-sy', `${String(y)}px`);
  t.style.setProperty('--tc-cy-sw', `${String(v.w)}px`); t.style.setProperty('--tc-cy-sh', `${String(v.h)}px`);
}

// Ekran dışı tuvalin karesi görüntü olarak devredilir (kopya ve bekleme yok). Ekran dışı tuval yoksa 2B kopya: bu, çizimin bitmesini
// bekletir (yazılım çiziminde belirgin yavaşlar).
function aktar(t: HTMLCanvasElement, kaynak: HTMLCanvasElement | OffscreenCanvas): void {
  if (kaynak instanceof HTMLCanvasElement) {
    if (t.width !== kaynak.width || t.height !== kaynak.height) { t.width = kaynak.width; t.height = kaynak.height; }
    const x = t.getContext('2d');
    if (x === null) return;
    x.clearRect(0, 0, t.width, t.height);
    x.drawImage(kaynak, 0, 0);
    return;
  }
  t.getContext('bitmaprenderer')?.transferFromImageBitmap(kaynak.transferToImageBitmap());
}

function tuvaliGizle(r: Kayit): void {
  if (r.iz === '') return;
  r.iz = '';
  r.tuval.hidden = true;
}

// ---------- çizim modu (karar kartları 1138 a ve 1271) ----------
// 3D, grafik birimli bilgisayarda varsayılandır; 3D açılamayan bilgisayarda (glAl() null) yalnız 2B vardır. Seçim tarayıcıda tutulur:
// her bilgisayarın kendi tercihidir, sunucuya gitmez.
export type CizimModu = '3d' | '2b';
const MOD_ANAHTARI = 'tmiv2.cnc-kurulum.cizim-modu';
const modDinleyicileri = new Set<() => void>();
let mod: CizimModu = ilkMod();

function ilkMod(): CizimModu {
  if (glAl() === null) return '2b';
  let kayitli: string | null = null;
  try { kayitli = localStorage.getItem(MOD_ANAHTARI); } catch { /* tarayıcı deposu kapalı */ }
  return kayitli === '2b' ? '2b' : '3d';
}
export function cizimModu(): CizimModu { return mod; }
export function cizimModunuSec(m: CizimModu): void {
  const yeni: CizimModu = m === '3d' && glAl() !== null ? '3d' : '2b';
  if (yeni === mod) return;
  mod = yeni;
  try { localStorage.setItem(MOD_ANAHTARI, yeni); } catch { /* tarayıcı deposu kapalı */ }
  for (const d of modDinleyicileri) d();
}
export function useCizimModu(): CizimModu {
  return useSyncExternalStore((d) => { modDinleyicileri.add(d); return () => { modDinleyicileri.delete(d); }; }, cizimModu, cizimModu);
}

export function CizimModuSecici() {
  const m = useCizimModu(), uc = glAl() !== null;
  return (
    <span className="tc-cy-mod" role="group" aria-label="Çizim modu">
      <Dugme tur={m === '3d' ? 'birincil' : 'ikincil'} aria-pressed={m === '3d'} disabled={!uc}
        title={uc ? '3D çizim' : 'Bu bilgisayarda 3D çizim kapalı (ekran kartı yok)'} onClick={() => { cizimModunuSec('3d'); }}>3D</Dugme>
      <Dugme tur={m === '2b' ? 'birincil' : 'ikincil'} aria-pressed={m === '2b'} title="Hafif 2B çizim" onClick={() => { cizimModunuSec('2b'); }}>2B</Dugme>
    </span>
  );
}

// ---------- 2B çizim ----------
// 2B çizim düz tuvale yapılır ve yalnız görünümün imzası (veri, oynatma konumu, anahtarlar) ya da boyut değişince yeniden çizilir:
// grafik birimi gerekmez, boşta işlemci harcamaz. Tekerlek yakınlaştırır, sürükleme kaydırır, çift tık sığdırır.
export interface Gorunum2b { k: number; dx: number; dy: number }
export interface Cizici2b {
  imza(): string;
  // w, h CSS pikselidir; tuval cihaz piksel oranına göre ölçeklenmiş gelir.
  ciz(x: CanvasRenderingContext2D, w: number, h: number, g: Gorunum2b): void;
}

function Tuval2b({ cizici }: { cizici: Cizici2b }) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const ciziciRef = useRef(cizici);
  useEffect(() => { ciziciRef.current = cizici; }, [cizici]);
  useEffect(() => {
    const t = tuval.current;
    // Tuval desteği olmayan ortamda (test) 2B bağlamı denenmez.
    if (t === null || typeof CanvasRenderingContext2D === 'undefined') return undefined;
    const x = t.getContext('2d');
    if (x === null) return undefined;
    const g: Gorunum2b = { k: 1, dx: 0, dy: 0 };
    let iz = '', kare = 0, bekle: ReturnType<typeof setTimeout> | null = null, surukle: { x: number; y: number } | null = null;
    const adim = (): void => {
      kare = 0;
      if (gorunur) {
        const w = t.clientWidth, h = t.clientHeight, oran = Math.min(window.devicePixelRatio || 1, 2);
        const yeni = `${ciziciRef.current.imza()}|${String(w)}|${String(h)}|${String(oran)}|${String(g.k)}|${String(g.dx)}|${String(g.dy)}`;
        if (yeni !== iz && w > 10 && h > 10) {
          iz = yeni;
          if (t.width !== Math.round(w * oran) || t.height !== Math.round(h * oran)) { t.width = Math.round(w * oran); t.height = Math.round(h * oran); }
          x.setTransform(oran, 0, 0, oran, 0, 0);
          x.clearRect(0, 0, w, h);
          try { ciziciRef.current.ciz(x, w, h, g); } catch (hata) { console.error(hata); }
        }
        kare = requestAnimationFrame(adim);
      } else bekle = setTimeout(() => { bekle = null; kare = requestAnimationFrame(adim); }, 250);
    };
    kare = requestAnimationFrame(adim);
    const tekerlek = (e: WheelEvent): void => {
      e.preventDefault();
      const r = t.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      const k2 = Math.min(40, Math.max(0.5, g.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))), o = k2 / g.k;
      g.dx = mx - (mx - g.dx) * o; g.dy = my - (my - g.dy) * o; g.k = k2;
    };
    const bas = (e: PointerEvent): void => { surukle = { x: e.clientX, y: e.clientY }; t.setPointerCapture(e.pointerId); };
    const oynat = (e: PointerEvent): void => {
      if (!surukle) return;
      g.dx += e.clientX - surukle.x; g.dy += e.clientY - surukle.y; surukle = { x: e.clientX, y: e.clientY };
    };
    const birak = (): void => { surukle = null; };
    const sigdir = (): void => { g.k = 1; g.dx = 0; g.dy = 0; };
    t.addEventListener('wheel', tekerlek, { passive: false });
    t.addEventListener('pointerdown', bas); t.addEventListener('pointermove', oynat);
    t.addEventListener('pointerup', birak); t.addEventListener('pointercancel', birak); t.addEventListener('dblclick', sigdir);
    return () => {
      if (kare) cancelAnimationFrame(kare);
      if (bekle) clearTimeout(bekle);
      t.removeEventListener('wheel', tekerlek); t.removeEventListener('pointerdown', bas); t.removeEventListener('pointermove', oynat);
      t.removeEventListener('pointerup', birak); t.removeEventListener('pointercancel', birak); t.removeEventListener('dblclick', sigdir);
    };
  }, []);
  return <canvas ref={tuval} className="tc-cy-sahne-2b" data-cizim="2b" aria-hidden="true" />;
}

function Tuval3b({ el, ciz }: { el: RefObject<HTMLDivElement | null>; ciz: (c: Cizim) => void }) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const cizRef = useRef(ciz);
  useEffect(() => { cizRef.current = ciz; }, [ciz]);
  useEffect(() => {
    const d = el.current, t = tuval.current;
    if (d === null || t === null) return undefined;
    const kayit: Kayit = { el: d, tuval: t, ciz: (c) => { cizRef.current(c); }, iz: '' };
    kayitlar.add(kayit);
    baslat();
    return () => { kayitlar.delete(kayit); };
  }, [el]);
  return <canvas ref={tuval} className="tc-cy-sahne-tuval" aria-hidden="true" hidden />;
}

// Görünüm 3D çizimini (ciz) ve varsa 2B çizimini (cizici2b) verir; hangisinin çizileceğini çizim modu seçer. 2B çizimi olmayan
// görünüm 2B modda sahnesiz çalışır.
export function Sahne({ ciz, cizici2b, sinif }: { ciz: (c: Cizim) => void; cizici2b?: Cizici2b; sinif?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const m = useCizimModu();
  return (
    <div ref={el} className={sinif ? `tc-cy-sahne ${sinif}` : 'tc-cy-sahne'} data-cizim-modu={m}>
      {m === '3d' ? <Tuval3b el={el} ciz={ciz} /> : cizici2b ? <Tuval2b cizici={cizici2b} /> : null}
    </div>
  );
}
