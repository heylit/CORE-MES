import {
  ACESFilmicToneMapping, BackSide, Box3, BoxGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, HemisphereLight, Mesh,
  MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, Sphere, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FONT, MONO } from '../bicim.ts';
import type { Kalem } from '../veri/tipler.ts';
import { build, dispose, fit, isLatheTool, isMillTool } from './cnc3d.ts';
import { sahneRengi, sahneRengi3 } from './renkler.ts';

// Tek WebGL çizici (prototip de tek tuval kullanır: tarayıcının bağlam sınırı ve doku paylaşımı). Bütün 3B görünümler bunu ve
// ortak ortam dokusunu, ışıkları, küçük resim ve kart dokularını kullanır. Çizici modül yüklenince bir kez kurulur: sahneler ortam
// dokusunu kurulurken okur (prototipte envTex açılışta hazırdır) ve ekrandan çıkıp dönünce bağlam yeniden açılmaz. Tuvali sayfada
// değildir; her sahne sonucu kendi tuvaline aktarır (Sahne.tsx). Tuval, varsa ekran dışı tuvaldir (OffscreenCanvas): kare görüntü
// olarak kopyasız aktarılır; yoksa 2B kopyayla. WebGL yoksa glAl() null döner ve görünüm sahnesiz çalışır.

export interface GlBaglami { renderer: WebGLRenderer; canvas: HTMLCanvasElement | OffscreenCanvas; envTex: Texture; maxAniso: number }

function makeEnv(renderer: WebGLRenderer): Texture {
  const s = new Scene();
  // Ortamın parlak panelleri birden büyük (HDR) doğrusal değerlerdir; renk değil ışık şiddetidir (prototipteki gibi).
  s.add(new Mesh(new BoxGeometry(24, 24, 24), new MeshBasicMaterial({ color: new Color(0.05, 0.06, 0.075), side: BackSide })));
  const L = (w: number, h: number, c: Color, x: number, y: number, z: number): void => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: c, side: DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  L(14, 3, new Color(5, 5, 5), 0, 10, 2); L(4, 9, new Color(2.4, 2.6, 3.1), -10, 2, 4); L(4, 9, new Color(1.8, 1.5, 1.2), 10, 1, -2); L(12, 2.5, new Color(0.7, 0.85, 1.2), 0, -3, -10);
  const pm = new PMREMGenerator(renderer), t = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return t;
}

// Yazılım çizicisinde 3B açılmaz (karar kartı 1138 a).
const YAZILIMDA_3B = false;
// Ekran testi iki yolu da koşar: CI'ın başsız tarayıcısı yazılım çizicisidir; sahne 'zorla' ile orada da çizilir, 'kapat' grafik
// birimli makinede sahnesiz açılışı sınar. Yalnız sayfa yüklenmeden önce konan değer okunur; uygulama bunu koymaz.
type SahneSinamasi = 'zorla' | 'kapat';
const sinama = (globalThis as { tmiv2Sahne3B?: SahneSinamasi }).tmiv2Sahne3B;
function glKur(): GlBaglami | null {
  // three 0.186 yalnız WebGL2 ile çizer; tarayıcı WebGL2'yi tanımıyorsa (test ortamı da) bağlam denenmez.
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined' || sinama === 'kapat') return null;
  const canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
  let renderer: WebGLRenderer;
  // Bağlam açılamıyorsa (WebGL kapalı, test ortamı) three hata atar; sahnesiz sürülür.
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  // Grafik birimi yoksa (yazılım çizicisi) sahne işlemciyi doldurur: açılış saniyelerce sürer, kare saniyede birkaç olur ve ekran
  // tıklamaya geç yanıt verir. Görünüm o zaman sahnesiz çalışır (WebGL yok gibi).
  if (!YAZILIMDA_3B && sinama !== 'zorla' && yazilimCizicisi(renderer)) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = false;
  return { renderer, canvas, envTex: makeEnv(renderer), maxAniso: renderer.capabilities.getMaxAnisotropy() };
}

// Çizici adı tarayıcının bildirdiğidir; uzantı yoksa ad bilinmez ve donanım sayılır.
function yazilimCizicisi(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext(), u = gl.getExtension('WEBGL_debug_renderer_info');
  const ad: unknown = u === null ? '' : gl.getParameter(u.UNMASKED_RENDERER_WEBGL);
  return typeof ad === 'string' && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(ad);
}

const baglam = glKur();
export function glAl(): GlBaglami | null { return baglam; }
export const envTex: Texture | null = baglam?.envTex ?? null;
export const maxAniso: number = baglam?.maxAniso ?? 1;

// Prototip three r128'in eski ışık birimleriyle yazıldı; 0.186'da ışık fiziksel birimdedir ve aynı görünüm için yoğunluk π ile
// çarpılır (three r155 geçiş notu).
const ISIK_BIRIMI = Math.PI;
export function lights(sc: Scene, k: number): void {
  sc.add(new HemisphereLight(sahneRengi3('isik-gok'), sahneRengi3('isik-yer'), 0.55 * k * ISIK_BIRIMI));
  const d = new DirectionalLight(sahneRengi3('isik-ana'), 1.1 * k * ISIK_BIRIMI); d.position.set(4, 9, 8); sc.add(d);
  const d2 = new DirectionalLight(sahneRengi3('isik-dolgu'), 0.4 * k * ISIK_BIRIMI); d2.position.set(-6, 2, -4); sc.add(d2);
}

export function srgbDoku(c: HTMLCanvasElement): CanvasTexture { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t; }
function tuval(w: number, h: number): { c: HTMLCanvasElement; x: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  let x: CanvasRenderingContext2D | null = null;
  try { x = c.getContext('2d'); } catch { /* tuval desteği yok */ }
  return { c, x };
}

// ---------- küçük resimler (3B çizim -> kart) ----------
const TS = 320;
let kucuk: { rt: WebGLRenderTarget; scene: Scene; cam: PerspectiveCamera; pix: Uint8Array } | null = null;
const thumbCache: Record<string, HTMLCanvasElement | null> = {};

export function thumb(opt: Kalem): HTMLCanvasElement | null {
  if (opt.kind === 'empty') return null;
  const onceki = thumbCache[opt.id];
  if (onceki !== undefined) return onceki;
  if (baglam === null) return null;
  const { renderer } = baglam;
  if (kucuk === null) {
    const rt = new WebGLRenderTarget(TS, TS); rt.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene(); scene.environment = baglam.envTex; lights(scene, 1);
    kucuk = { rt, scene, cam: new PerspectiveCamera(30, 1, 0.1, 500), pix: new Uint8Array(TS * TS * 4) };
  }
  const { rt, scene, cam, pix } = kucuk;
  const obj = build(opt), dir = new Vector3(0.75, 0.55, 1);
  if (isMillTool(opt)) { obj.rotation.z = -0.78; dir.set(0.25, 0.3, 1); }
  else if (isLatheTool(opt)) { obj.rotation.y = -0.45; obj.rotation.x = 0.45; dir.set(0.3, 0.6, 1); }
  else if (opt.kind === 'cool' || opt.kind === 'z_probe' || opt.kind === 'z_edge') dir.set(0.3, 0.3, 1);
  const o = fit(obj, 3); scene.add(o);
  const sph = new Box3().setFromObject(o).getBoundingSphere(new Sphere());
  const dist = sph.radius / Math.sin(15 * Math.PI / 180);
  cam.position.copy(sph.center).addScaledVector(dir.normalize(), dist); cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix(); cam.lookAt(sph.center);
  // Küçük resim ortak çizicinin kırpma ve görüş alanı durumunu bozmamalı: sahne döngüsü her karede kendisininkini kurar.
  renderer.setScissorTest(false);
  renderer.setRenderTarget(rt); renderer.setViewport(0, 0, TS, TS); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, TS, TS, pix); renderer.setRenderTarget(null);
  scene.remove(o); dispose(o);
  const { c, x } = tuval(TS, TS);
  if (x === null) { thumbCache[opt.id] = null; return null; }
  const id = x.createImageData(TS, TS), rb = TS * 4;
  for (let r = 0; r < TS; r++) id.data.set(pix.subarray(r * rb, (r + 1) * rb), (TS - 1 - r) * rb);
  x.putImageData(id, 0, 0);
  thumbCache[opt.id] = c;
  return c;
}

// Küçük resim bir kez PNG adresine çevrilir (liste görünümleri <img> ile gösterir; prototipin thumbURL'i).
const thumbURL: Record<string, string> = {};
export function thumbUrl(opt: Kalem): string | null {
  const v = thumbURL[opt.id];
  if (v !== undefined) return v;
  const c = thumb(opt);
  if (c === null) return null;
  return (thumbURL[opt.id] = c.toDataURL('image/png'));
}

// ---------- kart dokuları ----------
export function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
export function wrap(x: CanvasRenderingContext2D, text: string | null | undefined, mx: number, maxL: number): string[] {
  const words = String(text || '').split(' ');
  let lines: string[] = [], cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (x.measureText(t).width > mx && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxL) {
    lines = lines.slice(0, maxL);
    let l = lines[maxL - 1] ?? '';
    while (x.measureText(`${l}…`).width > mx && l.length) l = l.slice(0, -1);
    lines[maxL - 1] = `${l}…`;
  }
  return lines;
}
export function draw(x: CanvasRenderingContext2D, text: string | null | undefined, px: number, py: number, mx: number, maxL: number, lh: number): number {
  const L = wrap(x, text, mx, maxL);
  L.forEach((s, i) => { x.fillText(s, px, py + i * lh); });
  return py + L.length * lh;
}

// Tuval bağlamı yoksa doku boştur; malzeme yine kurulur.
const texCache: Record<string, Texture> = {};
export function cardTex(opt: Kalem, def: { cat: string; col: string }): Texture {
  const key = `${opt.id}|${def.cat}`;
  const onceki = texCache[key];
  if (onceki) return onceki;
  const W = 512, H = 350, { c, x } = tuval(W, H);
  if (x === null) return (texCache[key] = new Texture());
  const col = opt.col || def.col || sahneRengi('vurgu');
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, sahneRengi('kart-ust')); gr.addColorStop(1, sahneRengi('kart-alt')); x.fillStyle = gr; rr(x, 0, 0, W, H, 22); x.fill();
  x.strokeStyle = sahneRengi('kart-kenar'); x.lineWidth = 3; rr(x, 1.5, 1.5, W - 3, H - 3, 21); x.stroke();
  const tg = x.createRadialGradient(101, 101, 10, 101, 101, 110); tg.addColorStop(0, sahneRengi('kart-cukur-ic')); tg.addColorStop(1, sahneRengi('kart-cukur-dis')); x.fillStyle = tg; rr(x, 16, 16, 170, 170, 14); x.fill();
  const th = thumb(opt);
  if (th) x.drawImage(th, 16, 16, 170, 170);
  else {
    x.setLineDash([10, 8]); x.strokeStyle = sahneRengi('kart-bos'); x.lineWidth = 3; rr(x, 40, 40, 122, 122, 12); x.stroke(); x.setLineDash([]);
    x.fillStyle = sahneRengi('kart-bos'); x.font = `700 48px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('—', 101, 101); x.textAlign = 'left';
  }
  x.textBaseline = 'middle'; x.fillStyle = col; rr(x, 200, 22, 6, 28, 3); x.fill();
  x.font = `700 21px ${FONT}`; x.fillText(def.cat, 214, 37);
  x.textBaseline = 'alphabetic';
  x.font = `500 23px ${MONO}`; x.fillStyle = sahneRengi('kart-kod'); const y2 = draw(x, opt.code || '', 200, 84, 296, 2, 28);
  x.font = `600 25px ${FONT}`; x.fillStyle = sahneRengi('kart-etiket'); draw(x, opt.tags || '', 200, Math.max(y2 + 16, 146), 296, 2, 29);
  x.font = `700 34px ${FONT}`; x.fillStyle = sahneRengi('kart-ad'); const ny = draw(x, opt.name, 18, 232, 476, 2, 38);
  x.font = `400 22px ${FONT}`; x.fillStyle = sahneRengi('kart-aciklama'); draw(x, opt.desc || '', 18, Math.min(ny + 4, 334), 476, 1, 24);
  const t = srgbDoku(c); t.anisotropy = maxAniso;
  return (texCache[key] = t);
}

const numCache: Record<string, Texture> = {};
export function numTex(n: number, on?: boolean): Texture {
  const k = `${String(n)}${on ? 'a' : ''}`;
  const onceki = numCache[k];
  if (onceki) return onceki;
  const { c, x } = tuval(64, 64);
  if (x === null) return (numCache[k] = new Texture());
  x.fillStyle = on ? sahneRengi('vurgu') : sahneRengi('numara-zemin'); x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.fillStyle = on ? sahneRengi('numara-secili-yazi') : sahneRengi('numara-yazi'); x.font = `700 26px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 32, 34);
  return (numCache[k] = srgbDoku(c));
}

// Prototipin invalidateItem'ı: kalem değişince küçük resmi ve kart dokuları yeniden üretilir.
export function onbellekSil(id: string): void {
  delete thumbCache[id];
  delete thumbURL[id];
  for (const k of Object.keys(texCache)) {
    if (k.startsWith(`${id}|`)) { texCache[k]?.dispose(); delete texCache[k]; }
  }
}
