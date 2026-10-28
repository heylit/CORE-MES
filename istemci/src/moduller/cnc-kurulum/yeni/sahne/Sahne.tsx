import { useEffect, useRef } from 'react';
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

export function Sahne({ ciz, sinif }: { ciz: (c: Cizim) => void; sinif?: string }) {
  const el = useRef<HTMLDivElement>(null);
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
  }, []);
  return (
    <div ref={el} className={sinif ? `tc-cy-sahne ${sinif}` : 'tc-cy-sahne'}>
      <canvas ref={tuval} className="tc-cy-sahne-tuval" aria-hidden="true" hidden />
    </div>
  );
}
