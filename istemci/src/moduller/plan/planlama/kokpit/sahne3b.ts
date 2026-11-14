import {
  BoxGeometry, BufferGeometry, Color, DirectionalLight, EdgesGeometry, Group, HemisphereLight, Line, LineBasicMaterial, LineSegments, Mesh,
  MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type Material, type Object3D,
} from 'three';
import { matrisYuku, type Hucre3B } from './kurallar.ts';

// Kokpit 3B sahnesi (kart 3208 a): tezgâh × gün ızgarası üç bakışla. D: Matris'in düz hâli, istenince yük kadar yükselir. E: yükseklik yük,
// renk hücredeki en kötü emir, saydamlık taslakta yeri değişen iş payı. H: saydam kutu onaylı plan, dolu çubuk taslak. Sahne React dışında
// tutulur: her karede yeniden çizim React'ı yormaz; yalnız hareket varken kare istenir.

export type Bakis = 'D' | 'E' | 'H';
export type Kamera = 'egik' | 'ust' | 'on' | 'yan';
const RENK_ADLARI = ['hafif', 'orta', 'dolu', 'tam', 'bos', 'kapali', 'gec', 'risk', 'iyi', 'azaldi', 'zemin', 'izgara', 'ink', 'muted'] as const;
type RenkAdi = (typeof RENK_ADLARI)[number];
export type Renkler = Record<RenkAdi, Color>;
// Renk adı -> kokpit tasarım değişkeni. WebGL CSS okuyamaz; değer sahnenin kabından çözülür.
const DEGISKEN: Record<RenkAdi, string> = {
  hafif: '--yuk-hafif', orta: '--yuk-orta', dolu: '--yuk-dolu', tam: '--yuk-tam', bos: '--panel2', kapali: '--edge2',
  gec: '--d-gec', risk: '--d-risk', iyi: '--d-iyi', azaldi: '--d-sur', zemin: '--panel-solid', izgara: '--edge2', ink: '--ink', muted: '--muted',
};

// color-mix ve oklab'ı three okuyamaz: değer bir piksele boyanıp geri okunur (tarayıcı çözer). Saydam değer zeminle karışmış okunur.
export function renkleriOku(kap: HTMLElement): Renkler {
  const st = getComputedStyle(kap), tv = document.createElement('canvas');
  tv.width = 1; tv.height = 1;
  const x = tv.getContext('2d', { willReadFrequently: true });
  const zemin = st.getPropertyValue('--panel-solid').trim();
  const oku = (ad: string): Color => {
    const v = st.getPropertyValue(ad).trim();
    if (!x || !v) return new Color(0.5, 0.5, 0.5);
    x.clearRect(0, 0, 1, 1);
    if (zemin) { x.fillStyle = zemin; x.fillRect(0, 0, 1, 1); }
    x.fillStyle = v; x.fillRect(0, 0, 1, 1);
    const [r = 128, g = 128, b = 128] = x.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  };
  return Object.fromEntries(RENK_ADLARI.map((a) => [a, oku(DEGISKEN[a])])) as Renkler;
}

// Yazılımla çizen tarayıcıda 3B açılmaz (karar 1138 a): sahne işlemciyi doldurur, sayfa geç yanıt verir. Ekran testi 'zorla' ile
// başsız tarayıcıda da çizer, 'kapat' ile sahnesiz yolu sınar; değeri uygulama koymaz. Aynı ölçü cnc-kurulum sahnesindedir (gl.ts).
type SahneSinamasi = 'zorla' | 'kapat';
export type CiziciDurumu = { tur: 'tamam'; r: WebGLRenderer } | { tur: 'yok' | 'yazilim' };
export function ciziciAc(tuval: HTMLCanvasElement): CiziciDurumu {
  const sinama = (globalThis as { tmiv2Sahne3B?: SahneSinamasi }).tmiv2Sahne3B;
  // three 0.186 yalnız WebGL2 ile çizer.
  if (typeof WebGL2RenderingContext === 'undefined' || sinama === 'kapat') return { tur: 'yok' };
  let r: WebGLRenderer;
  try { r = new WebGLRenderer({ canvas: tuval, antialias: true, alpha: true }); } catch { return { tur: 'yok' }; }
  if (sinama !== 'zorla' && yazilimCizicisi(r)) { r.dispose(); return { tur: 'yazilim' }; }
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputColorSpace = SRGBColorSpace;
  return { tur: 'tamam', r };
}
function yazilimCizicisi(r: WebGLRenderer): boolean {
  const gl = r.getContext(), u = gl.getExtension('WEBGL_debug_renderer_info');
  const ad: unknown = u === null ? '' : gl.getParameter(u.UNMASKED_RENDERER_WEBGL);
  return typeof ad === 'string' && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(ad);
}

export interface SahneVerisi {
  tezgahlar: readonly { kod: string; grup: number; grupAdi: string | null }[];
  gunler: readonly { ad: string; kisa: string; kapali: boolean }[];
  hucre: readonly (readonly Hucre3B[])[];
  dar: boolean;
}
export interface Secim { ti: number; gi: number }

const BEYAZ = new Color(1, 1, 1);
const AR = 1.15, KARE_TEZGAH = 14, BOY = 6, TABAN = 0.06, KALDIR_MS = 700, GECIS_MS = 800;
// Kamera bakışları: azimut, kutup açısı, uzaklık (ızgarayı ekrana sığdıran uzaklığın katı; üstten bakışta yükseklik görünmez, daha yakın).
const KAMERA: Record<Kamera, readonly [number, number, number]> = { egik: [-0.72, 0.95, 0.95], ust: [0, 0.02, 0.8], on: [0, 1.35, 1], yan: [-Math.PI / 2, 1.35, 1] };
// Yük oranı sahnede bu kadar aşabilir (aşırı yük görünsün, sahne taşmasın).
const EN_COK_YUK = 1.25;
// Sahne bakışının hedefi azaldığında kamera her karede kalan farkın bu payı kadar yaklaşır.
const YAKLASMA = 0.14;

interface Etiket { el: HTMLElement; p: Vector3; kosul?: () => boolean; sag: boolean; w: number; h: number }
interface Animasyon { bas: number; sure: number; ilk: number; son: number; f: (x: number) => void }
interface Hucreli extends Mesh { userData: { ti: number; gi: number; h: number; a?: number; b?: number; tepe?: Mesh } }

export class Sahne3B {
  readonly #r: WebGLRenderer;
  readonly #tuval: HTMLCanvasElement;
  readonly #katman: HTMLElement;
  readonly #secildi: (s: Secim | null) => void;
  readonly #sahne = new Scene();
  readonly #kamera = new PerspectiveCamera(40, 1, 0.1, 400);
  #kok = new Group();
  #etiket: Etiket[] = [];
  #secilebilir: Hucreli[] = [];
  #anim: Animasyon[] = [];
  #yor = { th: -0.72, ph: 0.95, r: 30, hedef: new Vector3(), git: null as null | { th: number; ph: number; r: number }, don: false };
  #en = 20;
  // Son seçilen kamera bakışı; kullanıcı yakınlaştırmadıysa boyut değişince uzaklık yeniden sığdırılır.
  #son: Kamera = 'egik';
  #elle = false;
  #boy = 10;
  #w = 1; #h = 1;
  #kare = 0;
  #d3 = 0;
  #k = 1;
  #vurgu: Hucreli | null = null;
  readonly #isaret = new Map<number, { x: number; y: number }>();
  #iki: { d: number; r: number } | null = null;
  #tasindi = false;
  readonly #azHareket = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly #kapat: (() => void)[] = [];
  readonly #gok = new HemisphereLight(BEYAZ, BEYAZ, 0.85 * Math.PI);
  #parla = new Color();

  constructor(r: WebGLRenderer, tuval: HTMLCanvasElement, katman: HTMLElement, secildi: (s: Secim | null) => void) {
    this.#r = r; this.#tuval = tuval; this.#katman = katman; this.#secildi = secildi;
    // three 0.186 ışığı fiziksel birimde ister; aynı görünüm için şiddet π ile çarpılır (r155 geçiş notu).
    // Işık renksizdir (beyaz); yer yansıması kurulumda zeminin renginden alınır.
    this.#sahne.add(this.#gok);
    const gunes = new DirectionalLight(BEYAZ, 0.55 * Math.PI); gunes.position.set(12, 30, 18); this.#sahne.add(gunes);
    this.#sahne.add(this.#kok);
    this.#dinle();
  }

  boyut(w: number, h: number): void {
    this.#w = Math.max(1, w); this.#h = Math.max(1, h);
    this.#r.setSize(this.#w, this.#h, false);
    this.#kamera.aspect = this.#w / this.#h; this.#kamera.updateProjectionMatrix();
    for (const e of this.#etiket) { e.w = 0; }
    if (!this.#elle) { const r = this.#uzaklik(KAMERA[this.#son][2]); if (this.#yor.git) this.#yor.git.r = r; else this.#yor.r = r; }
    this.iste();
  }

  // Bakışı veriyle yeniden kurar; kamera bakışı korunmaz (her bakış kendi açılışıyla gelir).
  kur(b: Bakis, v: SahneVerisi, renk: Renkler, kaldirilmis: boolean): void {
    this.#temizle();
    this.#gok.groundColor.copy(renk.zemin); this.#parla = renk.muted.clone().multiplyScalar(0.35);
    const nT = v.tezgahlar.length, nG = v.gunler.length;
    // Tezgâh çoğaldıkça satır aralığı daralır: ızgara 14 tezgâhlık kare orana yakın kalır, uzun bir şeride dönüp küçülmez.
    const dz = Math.max(0.42, Math.min(1, KARE_TEZGAH / Math.max(1, nT))), AZ = AR * dz;
    const z = b === 'D' ? (ti: number) => ti * AZ : (ti: number) => ti * AZ + (v.tezgahlar[ti]?.grup ?? 0) * 0.9;
    const derin = z(Math.max(0, nT - 1)), W = nG * AR;
    // Sol ve ön kenardaki yazılar için pay: tezgâh kodu uzadıkça kamera sola açılır (kod ızgaraya değmez, kenarda kırpılmaz); istasyon başlığı ayrıca yer ister.
    const kodPay = Math.max(0, Math.max(0, ...v.tezgahlar.map((t) => t.kod.length)) - (v.dar ? 3 : 5)) * (v.dar ? 0.6 : 0.3);
    const bas = (b !== 'D' && !v.dar ? 1.2 : 0) + kodPay / 2;
    this.#en = W + 4 + 2 * bas; this.#boy = derin + 4;
    this.#yor.hedef.set(W / 2 - AR / 2 - bas, 0, derin / 2);
    const zem = new Mesh(new PlaneGeometry(W + 4, derin + 4), new MeshLambertMaterial({ color: renk.zemin }));
    zem.rotation.x = -Math.PI / 2; zem.position.set(W / 2 - AR / 2, -0.01, derin / 2); this.#kok.add(zem);

    // Tezgâh kodu önce eklenir ve çakışmada kalır; kod da istasyon başlığı da sağ kenarından hizalanır, başlık kodun solunda durur.
    v.tezgahlar.forEach((t, ti) => { this.#yazi(t.kod, new Vector3(-0.85, 0, z(ti)), 'k', undefined, true); });
    if (b !== 'D') v.tezgahlar.forEach((t, ti) => {
      if (t.grupAdi !== null && v.tezgahlar[ti - 1]?.grup !== t.grup) this.#yazi(t.grupAdi, new Vector3((v.dar ? -1.9 : -2.7) - kodPay, 0, z(ti) - 0.45), 'bas', () => !v.dar || this.#yor.ph < 0.6, true);
    });
    v.gunler.forEach((g, gi) => this.#yazi(v.dar ? g.kisa : g.ad, new Vector3(gi * AR, 0, derin + AZ / 2 + 0.6), g.kapali ? 'k' : ''));
    if (b !== 'D') {
      for (const y of [0.5, 1]) {
        const g = new BufferGeometry().setFromPoints([new Vector3(-0.8, y * BOY, -0.6), new Vector3(W - 0.4, y * BOY, -0.6)]);
        this.#kok.add(new Line(g, new LineBasicMaterial({ color: renk.izgara })));
        this.#yazi(`%${String(y * 100)}`, new Vector3(-1.4, y * BOY, -0.6), 'k', () => this.#yor.ph > 0.5);
      }
    }

    const kutu = (w: number, c: Color, ti: number, gi: number, h: number): Hucreli => {
      const m = new Mesh(new BoxGeometry(w, 1, w * dz), new MeshLambertMaterial({ color: c })) as unknown as Hucreli;
      m.userData = { ti, gi, h }; m.position.set(gi * AR, 0, z(ti)); return m;
    };
    const boy = (y: number): number => TABAN + Math.min(EN_COK_YUK, y) * BOY;
    v.hucre.forEach((satir, ti) => satir.forEach((c, gi) => {
      if (b === 'D') {
        const sinif = c.yuk === null ? 'kapali' : matrisYuku({ acik: 1, plan: c.yuk });
        const m = kutu(AR * 0.86, renk[sinif], ti, gi, c.yuk === null ? TABAN : boy(c.yuk));
        if (c.durum === 'gec' && c.yuk !== null) { const tepe = new Mesh(new BoxGeometry(AR * 0.86, 0.12, AR * 0.86 * dz), new MeshLambertMaterial({ color: renk.gec })); m.userData.tepe = tepe; this.#kok.add(tepe); tepe.position.set(gi * AR, 0, z(ti)); }
        this.#ekle(m);
        if (!v.dar && c.yuk !== null && c.yuk >= 0.05) this.#yazi(String(Math.round(c.yuk * 100)), new Vector3(gi * AR, 0.3, z(ti)), 'sayi', () => this.#yor.ph < 0.5 && this.#d3 < 0.5);
      } else if (b === 'E') {
        if (c.yuk === null) { const k = new Mesh(new BoxGeometry(AR * 0.86, 0.04, AR * 0.86 * dz), new MeshLambertMaterial({ color: renk.kapali })); k.position.set(gi * AR, 0.02, z(ti)); this.#kok.add(k); return; }
        if (c.durum === null) return;
        const m = kutu(AR * 0.86, renk[c.durum], ti, gi, boy(c.yuk));
        const d = c.degisen ?? 0, mat = m.material as MeshLambertMaterial;
        mat.transparent = d > 0; mat.opacity = 1 - d * 0.65;
        this.#ekle(m);
      } else {
        if (c.yuk === null) return;
        const a = c.once ?? c.yuk, s = c.yuk;
        if (a < 0.03 && s < 0.03) return;
        const f = s - a, m = kutu(AR * 0.62, f > 0.1 ? renk.risk : f < -0.1 ? renk.azaldi : renk.iyi, ti, gi, boy(s));
        m.userData.a = a; m.userData.b = s;
        const hayal = new Mesh(new BoxGeometry(AR * 0.9, 1, AR * 0.9 * dz), new MeshLambertMaterial({ color: renk.muted, transparent: true, opacity: 0.22, depthWrite: false }));
        hayal.scale.y = boy(a); hayal.position.set(gi * AR, hayal.scale.y / 2, z(ti));
        hayal.add(new LineSegments(new EdgesGeometry(hayal.geometry), new LineBasicMaterial({ color: renk.ink, transparent: true, opacity: 0.45 })));
        this.#kok.add(hayal);
        this.#ekle(m);
      }
    }));
    this.#d3 = b === 'D' && !kaldirilmis ? 0 : 1;
    this.#k = 1;
    this.#yukseklikleri();
    this.kamera(b === 'D' && !kaldirilmis ? 'ust' : 'egik', true);
  }

  kamera(k: Kamera, hemen = false): void {
    const [th, ph, c] = KAMERA[k], r = this.#uzaklik(c);
    this.#yor.don = false; this.#son = k; this.#elle = false;
    if (hemen || this.#azHareket) { Object.assign(this.#yor, { th, ph, r, git: null }); } else this.#yor.git = { th, ph, r };
    this.iste();
  }
  donsun(acik: boolean): void { this.#yor.don = acik; this.iste(); }

  // D: 0 düz (Matris gibi), 1 yük kadar yüksek.
  kaldir(hedef: 0 | 1): void {
    this.#oynat(this.#d3, hedef, KALDIR_MS, (x) => { this.#d3 = x; this.#yukseklikleri(); });
    if (hedef === 1) this.kamera('egik'); else this.kamera('ust');
  }
  // H: 0 onaylı plan, 1 taslak.
  oran(k: number, kayarak = false): void {
    if (kayarak) this.#oynat(this.#k, k, GECIS_MS, (x) => { this.#k = x; this.#yukseklikleri(); });
    else { this.#k = k; this.#yukseklikleri(); this.iste(); }
  }
  get oranDegeri(): number { return this.#k; }

  vurgula(s: Secim | null): void {
    if (this.#vurgu) (this.#vurgu.material as MeshLambertMaterial).emissive.setScalar(0);
    this.#vurgu = s === null ? null : this.#secilebilir.find((m) => m.userData.ti === s.ti && m.userData.gi === s.gi) ?? null;
    if (this.#vurgu) (this.#vurgu.material as MeshLambertMaterial).emissive.copy(this.#parla);
    this.iste();
  }

  // Bir kare ister; hareket sürdükçe döngü kendini yeniler.
  iste(): void { if (this.#kare === 0) this.#kare = requestAnimationFrame((t) => { this.#kare = 0; this.#ciz(t); }); }

  kapat(): void {
    if (this.#kare !== 0) cancelAnimationFrame(this.#kare);
    for (const f of this.#kapat) f();
    this.#temizle();
    this.#r.dispose();
  }

  // Izgarayı (yazı payı ve en yüksek çubukla) saran küre her bakış açısında görüş alanına sığar; dar ekranda yatay açı belirler.
  #uzaklik(c: number): number {
    const dikey = Math.atan(Math.tan((this.#kamera.fov * Math.PI) / 360)), yatay = Math.atan(Math.tan(dikey) * this.#kamera.aspect);
    return (c * Math.hypot(this.#en / 2, this.#boy / 2, BOY / 2)) / Math.sin(Math.min(dikey, yatay));
  }
  #ekle(m: Hucreli): void { this.#kok.add(m); this.#secilebilir.push(m); }
  #yukseklikleri(): void {
    for (const m of this.#secilebilir) {
      const { a, b, h, tepe } = m.userData;
      m.scale.y = a !== undefined && b !== undefined ? TABAN + Math.min(EN_COK_YUK, a + (b - a) * this.#k) * BOY : TABAN + (h - TABAN) * this.#d3;
      m.position.y = m.scale.y / 2;
      if (tepe) tepe.position.y = m.scale.y + 0.06;
    }
  }
  #oynat(ilk: number, son: number, sure: number, f: (x: number) => void): void {
    this.#anim = this.#anim.filter((a) => a.f !== f);
    if (this.#azHareket) { f(son); this.iste(); return; }
    this.#anim.push({ bas: performance.now(), sure, ilk, son, f });
    this.iste();
  }
  #yazi(metin: string, p: Vector3, sinif: string, kosul?: () => boolean, sag = false): void {
    const el = document.createElement('span');
    el.className = `tc-pyq-3b-et${sinif ? ` tc-pyq-3b-et-${sinif}` : ''}`; el.textContent = metin; el.hidden = true;
    this.#katman.appendChild(el);
    this.#etiket.push({ el, p, ...(kosul ? { kosul } : {}), sag, w: 0, h: 0 });
  }
  #temizle(): void {
    this.#sahne.remove(this.#kok);
    this.#kok.traverse((o: Object3D) => {
      const x = o as Partial<Mesh>;
      x.geometry?.dispose();
      const mt = x.material as Material | Material[] | undefined;
      if (Array.isArray(mt)) mt.forEach((y) => { y.dispose(); }); else mt?.dispose();
    });
    this.#kok = new Group(); this.#sahne.add(this.#kok);
    this.#katman.replaceChildren();
    this.#etiket = []; this.#secilebilir = []; this.#anim = []; this.#vurgu = null;
  }

  #ciz(t: number): void {
    let devam = false;
    for (const a of this.#anim.slice()) {
      const x = Math.min(1, (t - a.bas) / a.sure);
      a.f(a.ilk + (a.son - a.ilk) * (1 - (1 - x) ** 3));
      if (x >= 1) this.#anim.splice(this.#anim.indexOf(a), 1); else devam = true;
    }
    const y = this.#yor;
    if (y.git) {
      let d = y.git.th - y.th; d = Math.atan2(Math.sin(d), Math.cos(d));
      y.th += d * YAKLASMA; y.ph += (y.git.ph - y.ph) * YAKLASMA; y.r += (y.git.r - y.r) * YAKLASMA;
      if (Math.abs(d) < 0.002 && Math.abs(y.git.ph - y.ph) < 0.002 && Math.abs(y.git.r - y.r) < 0.05) { y.th = y.git.th; y.ph = y.git.ph; y.r = y.git.r; y.git = null; } else devam = true;
    }
    if (y.don && !this.#azHareket) { y.th += 0.003; devam = true; }
    const sp = Math.sin(y.ph);
    this.#kamera.position.set(y.hedef.x + y.r * sp * Math.sin(y.th), y.hedef.y + y.r * Math.cos(y.ph), y.hedef.z + y.r * sp * Math.cos(y.th));
    this.#kamera.lookAt(y.hedef);
    this.#r.render(this.#sahne, this.#kamera);
    this.#etiketler();
    if (devam) this.iste();
  }

  // Çakışan yazı gizlenir: önce eklenen (tezgâh kodu, sonra istasyon ve gün adları) kalır.
  #etiketler(): void {
    const yer: [number, number, number, number][] = [], v = new Vector3();
    for (const e of this.#etiket) {
      if (e.kosul && !e.kosul()) { e.el.hidden = true; continue; }
      v.copy(e.p).project(this.#kamera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { e.el.hidden = true; continue; }
      if (e.w === 0) { e.el.hidden = false; e.w = e.el.offsetWidth + 2; e.h = e.el.offsetHeight; }
      const x = ((v.x + 1) / 2) * this.#w - (e.sag ? e.w / 2 : 0), yy = ((1 - v.y) / 2) * this.#h;
      const k: [number, number, number, number] = [x - e.w / 2, yy - e.h / 2, x + e.w / 2, yy + e.h / 2];
      if (yer.some((o) => k[0] < o[2] && k[2] > o[0] && k[1] < o[3] && k[3] > o[1])) { e.el.hidden = true; continue; }
      yer.push(k); e.el.hidden = false;
      e.el.style.setProperty('--x', `${x.toFixed(1)}px`); e.el.style.setProperty('--y', `${yy.toFixed(1)}px`);
    }
  }

  #dinle(): void {
    const tv = this.#tuval, y = this.#yor;
    const asagi = (e: PointerEvent): void => {
      tv.setPointerCapture(e.pointerId); this.#isaret.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.#tasindi = false; y.git = null;
      if (this.#isaret.size === 2) { const [a, b] = [...this.#isaret.values()]; if (a && b) this.#iki = { d: Math.hypot(a.x - b.x, a.y - b.y), r: y.r }; }
    };
    const hareket = (e: PointerEvent): void => {
      const o = this.#isaret.get(e.pointerId); if (!o) return;
      const dx = e.clientX - o.x, dy = e.clientY - o.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.#tasindi = true;
      this.#isaret.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.#isaret.size === 1) { y.th -= dx * 0.008; y.ph = Math.min(1.5, Math.max(0.02, y.ph - dy * 0.008)); }
      else if (this.#iki) { const [a, b] = [...this.#isaret.values()]; if (a && b) { this.#elle = true; y.r = this.#sinir(this.#iki.r * this.#iki.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); } }
      this.iste();
    };
    const yukari = (e: PointerEvent): void => { if (this.#isaret.size === 1 && !this.#tasindi) this.#sec(e); this.#isaret.delete(e.pointerId); if (this.#isaret.size < 2) this.#iki = null; };
    const iptal = (e: PointerEvent): void => { this.#isaret.delete(e.pointerId); this.#iki = null; };
    const teker = (e: WheelEvent): void => { e.preventDefault(); y.git = null; this.#elle = true; y.r = this.#sinir(y.r * (1 + Math.sign(e.deltaY) * 0.1)); this.iste(); };
    tv.addEventListener('pointerdown', asagi); tv.addEventListener('pointermove', hareket); tv.addEventListener('pointerup', yukari); tv.addEventListener('pointercancel', iptal);
    tv.addEventListener('wheel', teker, { passive: false });
    this.#kapat.push(() => {
      tv.removeEventListener('pointerdown', asagi); tv.removeEventListener('pointermove', hareket); tv.removeEventListener('pointerup', yukari); tv.removeEventListener('pointercancel', iptal);
      tv.removeEventListener('wheel', teker);
    });
  }
  #sinir(r: number): number { return Math.min(this.#en * 5, Math.max(this.#en * 0.3, r)); }
  #sec(e: PointerEvent): void {
    const k = this.#tuval.getBoundingClientRect(), ray = new Raycaster();
    ray.setFromCamera(new Vector2(((e.clientX - k.left) / k.width) * 2 - 1, -((e.clientY - k.top) / k.height) * 2 + 1), this.#kamera);
    const vur = ray.intersectObjects(this.#secilebilir, false)[0]?.object as Hucreli | undefined;
    this.#secildi(vur ? { ti: vur.userData.ti, gi: vur.userData.gi } : null);
  }
}
