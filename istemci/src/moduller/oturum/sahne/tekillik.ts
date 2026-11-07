import {
  ACESFilmicToneMapping, AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Fog, Line,
  LineBasicMaterial, LinearSRGBColorSpace, Mesh, MeshStandardMaterial, Path, PerspectiveCamera, PMREMGenerator, PointLight, Points,
  PointsMaterial, Scene, Shape, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HARFLER, icindekiHarf, O_R as OR, O_X as OX, type Nokta } from '../../../ortak/arayuz/core-harfleri.ts';
import {
  BITIS, cizilmeli, durmayiUzat, ILK_DURMA, kaliteDusmeli, OLCUM_ATLA, OLCUM_KARE, PATLAMA as B, SABIT_KARE, tamponSirasi,
} from './zamanlama.ts';

// Giriş sahnesi "Tekillik" (karar 2148-1): üç yörünge ve çevresindeki kabuk O'nun ortasında tek noktaya çekilir; patlamayla
// yıldızlar O halkasına dağılır ve orada döner, kalan parçacıklar C, R ve E'ye savrulur, katı harfler belirir. Süs çizimidir.
// Bu dosya three'yi taşır ve giriş ekranından sonradan (dinamik ithal) yüklenir: form sahneyi beklemez.

const OY = 0;
const sinir = (x: number): number => Math.min(1, Math.max(0, x));
const icDis = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const cikis = (x: number): number => 1 - Math.pow(1 - x, 3);
const giris = (x: number): number => x * x * x;
// Tohumlu sayı dizisi: sahne her açılışta aynı görünür.
function tohumlu(s: number): () => number { let t = s; return () => ((t = (t * 16807) % 2147483647) / 2147483647); }

// WebGL CSS okuyamaz: renk tasarım değişkeninden (--giris3d-<ad>, tokens.css) okunur; değişken yoksa nötr gri, renk uydurulmaz.
function renkMetni(ad: string): string {
  let v = '';
  try { v = getComputedStyle(document.documentElement).getPropertyValue(`--giris3d-${ad}`).trim(); } catch { /* tarayıcı dışı */ }
  return v || 'rgb(128, 128, 128)';
}
const renk = (ad: string): Color => new Color().setStyle(renkMetni(ad));
// Parçacık rengi tepe noktası rengine doğrudan yazılır (dönüştürülmeden), değişkenin sayısal değeri aynen kullanılır.
const hamRenk = (ad: string): Color => new Color().setStyle(renkMetni(ad), LinearSRGBColorSpace);
const rgbMetni = (c: Color, a: number): string => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

type SahneSinamasi = 'zorla' | 'kapat';
// Ekran testi için (cnc-kurulum gl.ts ile aynı ad): 'zorla' yazılım çizicisinde de çizer, 'kapat' sahnesiz açılışı sınar.
const sinama = (): SahneSinamasi | undefined => (globalThis as { tmiv2Sahne3B?: SahneSinamasi }).tmiv2Sahne3B;

// Grafik birimi yoksa (yazılım çizicisi, sanal makine, uzak masaüstü) sahne işlemciyi doldurur; o zaman giriş sahnesiz açılır.
function yazilimCizicisi(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext(), u = gl.getExtension('WEBGL_debug_renderer_info');
  const ad: unknown = u === null ? '' : gl.getParameter(u.UNMASKED_RENDERER_WEBGL);
  return typeof ad === 'string' && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(ad);
}

const vektorler = (n: readonly Nokta[]): Vector2[] => n.map(([x, y]) => new Vector2(x, y));

function hedefler(rnd: () => number, n: number): { x: number; y: number; z: number; k: number }[] {
  const out: { x: number; y: number; z: number; k: number }[] = [];
  while (out.length < n) {
    const x = -190 + rnd() * 380, y = -52 + rnd() * 104, k = icindekiHarf(x, y);
    if (k >= 0) out.push({ x, y, z: 9.5 - rnd() * 3, k });
  }
  return out;
}

function radyalDoku(boy: number, duraklar: readonly [number, string][]): CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = boy;
  const c = cv.getContext('2d');
  if (c !== null) {
    const g = c.createRadialGradient(boy / 2, boy / 2, 0, boy / 2, boy / 2, boy / 2);
    duraklar.forEach(([d, r]) => g.addColorStop(d, r)); c.fillStyle = g; c.fillRect(0, 0, boy, boy);
  }
  return new CanvasTexture(cv);
}

export interface TekillikAyari {
  // Hareket azaltma tercihi: sahne yalnız son kareyi bir kez çizer.
  readonly hareketsiz: boolean;
  // Patlama anındaki yatay ışık şeridi (giriş ekranının öğesi); sahne yalnız saydamlığını ve genişliğini sürer.
  readonly parlama: HTMLElement | null;
  // Kelimenin altındaki yazı ("Sanayinin işletim sistemi"): sahne onu harflerin alt kenarının ekrandaki yerine taşır ve
  // harfler geldikten sonra gösterir; kadraj her boyutta değiştiği için yeri CSS ile sabitlenemez.
  readonly alti?: HTMLElement | null;
}

// Sahneyi yönetme: kapatma ve baştan oynatma (açılış sesi açıldığında sahne sesle birlikte baştan başlar).
export interface Tekillik { readonly kapat: () => void; readonly bastan: () => void }

// Yazının dayandığı nokta: kelimenin ortası, harflerin alt kenarının (y = -50) biraz altı.
const ALTI_Y = -74;

// Sahneyi kabın içine kurar; WebGL2 yoksa ya da yazılım çizicisiyse null döner (giriş sahnesiz açılır).
export function tekillikKur(kap: HTMLElement, ayar: TekillikAyari): Tekillik | null {
  if (typeof WebGL2RenderingContext === 'undefined' || sinama() === 'kapat') return null;
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  if (sinama() !== 'zorla' && yazilimCizicisi(renderer)) { renderer.dispose(); renderer.forceContextLoss(); return null; }

  const PIKSEL = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PIKSEL);
  renderer.toneMapping = ACESFilmicToneMapping; renderer.outputColorSpace = SRGBColorSpace;
  kap.prepend(renderer.domElement);
  // Sahne saydamdır, zemini giriş ekranı çizer (gece mavisi, kart 2184); uzaktaki parçalar zeminin orta tonuna kararır.
  const sahne = new Scene();
  sahne.background = null; sahne.fog = new Fog(renk('zemin-orta'), 500, 1600);
  const pm = new PMREMGenerator(renderer), cevre = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  sahne.environment = cevre;
  const kamera = new PerspectiveCamera(30, 1.8, 1, 5000);
  const atilacak: { dispose: () => void }[] = [cevre];

  // Parçacık bulutu: yörünge yıldızları, elektron izleri ve kabuk tek nokta kümesidir.
  const rnd = tohumlu(229), PHI = [0, Math.PI / 3, (2 * Math.PI) / 3], EL = 150;
  const yor = (k: number, a: number): [number, number, number] => {
    const x = 140 * Math.cos(a), y = 48 * Math.sin(a), ph = (PHI[k] ?? 0) + 0.12, cp = Math.cos(ph), sp = Math.sin(ph);
    const x2 = x * cp - y * sp, y2 = x * sp + y * cp;
    return [x2, y2 * Math.cos(0.38), y2 * Math.sin(0.38)];
  };
  const NR = 2400, ys = Array.from({ length: NR }, (_, i) => ({ k: i % 3, a: rnd() * Math.PI * 2, dr: (rnd() - 0.5) * 19, ra: rnd() * Math.PI * 2, j: rnd() * 0.35, w: 0.8 + rnd() * 0.4 }));
  const NE = 3 * EL;
  const hd = hedefler(rnd, 4400 * 3).filter((q) => q.k !== 1).slice(0, 4400), NS = hd.length;
  const kb = hd.map(() => {
    const u = rnd() * 2 - 1, f = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 80 + rnd() * 70;
    return { x: R * s * Math.cos(f), y: R * u * 0.6, z: R * s * Math.sin(f) * 0.7, w: 0.35 + rnd() * 0.4, j: rnd() * 0.4, g: rnd() * 0.12 };
  });
  const N = NR + NE + NS, poz = new Float32Array(N * 3), rk = new Float32Array(N * 3);
  const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(poz, 3)); geo.setAttribute('color', new BufferAttribute(rk, 3));
  const beyaz = renkMetni('tarama');
  const noktaDokusu = radyalDoku(32, [[0, beyaz], [0.35, rgbMetni(renk('tarama'), 0.85)], [1, rgbMetni(renk('tarama'), 0)]]);
  const noktaMal = new PointsMaterial({ size: 2.1 * 1.5, map: noktaDokusu, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const bulut = new Points(geo, noktaMal); bulut.frustumCulled = false; sahne.add(bulut);
  atilacak.push(geo, noktaDokusu, noktaMal);
  const soguk = hamRenk('parca-soguk'), sicakUc = hamRenk('parca-sicak');

  // Katı harfler: her harfin kendi malzemesi vardır, harfler sırayla belirir; O katı değildir, yıldızlardan oluşur.
  const harfMal = HARFLER.map(() => {
    const yuz = new MeshStandardMaterial({ color: renk('harf-yuz'), metalness: 1, roughness: 0.2, transparent: true, opacity: 0 });
    const yan = new MeshStandardMaterial({ color: renk('harf-yan'), metalness: 1, roughness: 0.18, transparent: true, opacity: 0 });
    atilacak.push(yuz, yan); return { yuz, yan };
  });
  const harfler = HARFLER.map((h, k) => {
    const sekil = new Shape(vektorler(h.dis)); h.delikler.forEach((d) => sekil.holes.push(new Path(vektorler(d))));
    const g = new ExtrudeGeometry(sekil, { depth: 16, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 1.6, bevelSegments: 4, curveSegments: 32 });
    g.translate(0, 0, -9); atilacak.push(g);
    const m = harfMal[k]; const ag = new Mesh(g, m === undefined ? [] : [m.yuz, m.yan]); ag.visible = false; sahne.add(ag);
    return ag;
  });
  const harfGel = (f: (k: number) => number): void => harfMal.forEach((m, k) => {
    const u = f(k); m.yuz.opacity = m.yan.opacity = u; m.yuz.transparent = m.yan.transparent = u < 1; m.yuz.depthWrite = m.yan.depthWrite = u > 0.95;
    const ag = harfler[k]; if (ag !== undefined) ag.visible = u > 0;
  });
  // Altın kenar: harf hatları soldan çizilerek belirir.
  const kenarMal = new LineBasicMaterial({ color: renk('kenar'), transparent: true, blending: AdditiveBlending, depthWrite: false });
  atilacak.push(kenarMal);
  const kenarlar = HARFLER.flatMap((h) => [h.dis, ...h.delikler]).map((n) => {
    const v = n.map(([x, y]) => new Vector3(x, y, 9.7)); v.push((v[0] ?? new Vector3()).clone());
    const lg = new BufferGeometry().setFromPoints(v); lg.setDrawRange(0, 0); sahne.add(new Line(lg, kenarMal)); atilacak.push(lg);
    return { lg, n: v.length };
  });
  const kenarCiz = (u: number): void => kenarlar.forEach((k) => k.lg.setDrawRange(0, Math.floor(k.n * u)));

  // Işıklar ve haleler.
  const k1 = new DirectionalLight(renk('isik-soguk'), 2.2); k1.position.set(-400, 160, 200); sahne.add(k1);
  const k2 = new DirectionalLight(renk('isik-sicak'), 1.8); k2.position.set(420, -60, 260); sahne.add(k2);
  const isik = new PointLight(renk('isik-nokta'), 0, 700, 1.2); sahne.add(isik);
  const tarayan = new PointLight(renk('tarama'), 0, 320, 1.2); sahne.add(tarayan);
  const haleRengi = renk('hale');
  const hale = (): Sprite => {
    const d = radyalDoku(128, [[0, rgbMetni(renk('tarama'), 1)], [0.12, rgbMetni(haleRengi, 0.9)], [0.4, rgbMetni(haleRengi, 0.25)], [1, rgbMetni(haleRengi, 0)]]);
    const m = new SpriteMaterial({ map: d, blending: AdditiveBlending, depthWrite: false, transparent: true });
    const sp = new Sprite(m); sahne.add(sp); atilacak.push(d, m); return sp;
  };
  const ha = hale(), pat = hale();
  ha.position.set(OX, OY, 0); pat.position.set(OX, OY, 12); isik.position.set(OX, 0, 60);

  let yari = false;
  const parlak = (): number => (yari ? 1.35 : 1);
  const yaz = (i: number, x: number, y: number, z: number, s: number, p: number): void => {
    const j = tamponSirasi(i, N) * 3, q = p * parlak();
    poz[j] = x; poz[j + 1] = y; poz[j + 2] = z;
    rk[j] = (soguk.r + (sicakUc.r - soguk.r) * s) * q; rk[j + 1] = (soguk.g + (sicakUc.g - soguk.g) * s) * q; rk[j + 2] = (soguk.b + (sicakUc.b - soguk.b) * s) * q;
  };
  const atla = (i: number): boolean => yari && i % 2 === 1;

  const altiNokta = new Vector3();
  const ciz = (t: number): void => {
    const gir = sinir(t / 0.7), hiz = 1 + 4 * giris(sinir((t - 1.2) / (B - 1.2)));
    const don = t * 0.6 + 2.2 * giris(sinir((t - 1.2) / (B - 1.2)));
    let i = 0;
    // Yörünge yıldızları: önce yörüngede, sonra noktaya, patlamayla O halkasına.
    for (const p of ys) {
      if (atla(i)) { i++; continue; }
      const c = giris(sinir((t - 1.2 - p.j) / (B - 1.2 - p.j))), [x, y, z] = yor(p.k, p.a + 0.05 * t + don * p.w);
      const u = cikis(sinir((t - B - p.j * 0.3) / 1.2)), r = (OR + p.dr) * (1 + 0.35 * Math.sin(Math.PI * u));
      const ar = p.ra + 0.55 * Math.max(0, t - B) * (0.8 + 0.4 * ((p.dr + 9.5) / 19));
      const hx = Math.cos(ar) * r * u, hy = Math.sin(ar) * r * u, hz = 9.5 * u;
      const pr = t < B ? 0.45 + 1.2 * c : 0.9 + u * (0.9 + 0.7 * Math.sin(t * 2.3 + i * 1.7));
      yaz(i++, OX + (t < B ? x * (1 - c) : hx), OY + (t < B ? y * (1 - c) : hy), t < B ? z * (1 - c) : hz, 1.3,
        pr * gir * (t < B ? 0.75 : 0.75 + 0.45 * sinir((t - B) / 1.5)));
    }
    // Elektronlar: izli, noktaya çekilir; patlamadan sonra O üstünde kuyruklu yıldız.
    for (let k = 0; k < 3; k++) {
      const ae = 1.3 * k + t * (3.2 - 0.4 * k) * hiz * 0.5;
      for (let j = 0; j < EL; j++) {
        if (atla(i)) { i++; continue; }
        const g = Math.pow(1 - j / EL, 2), c = giris(sinir((t - 1.2) / (B - 1.2))), [x, y, z] = yor(k, ae - j * 0.014);
        const u = cikis(sinir((t - B) / 1.2)), ar = 1.3 * k + t * (2.6 - 0.4 * k) - j * 0.02;
        const hx = Math.cos(ar) * OR * u, hy = Math.sin(ar) * OR * u;
        yaz(i++, OX + (t < B ? x * (1 - c) : hx), OY + (t < B ? y * (1 - c) : hy), t < B ? z * (1 - c) : 10 * u, 1.3, (0.4 + 2.6 * g) * 0.65 * gir * (t < B ? 1 : u));
      }
    }
    // Kabuk: noktaya çekilir, patlamayla C, R ve E'ye.
    for (let n = 0; n < NS; n++) {
      if (atla(i)) { i++; continue; }
      const p = kb[n], q = hd[n];
      if (p === undefined || q === undefined) { i++; continue; }
      const a = t * p.w * hiz, ca = Math.cos(a), sa = Math.sin(a);
      const sk = 1 - giris(sinir((t - 1.0 - p.j) / (B - 1.0 - p.j)));
      const x = OX + (p.x * ca - p.z * sa) * sk, y = p.y * sk, z = (p.x * sa + p.z * ca) * sk;
      const d = Math.hypot(q.x - OX, q.y), u = cikis(sinir((t - B - p.g - d * 0.0012) / 1.1)), yay = Math.sin(Math.PI * u) * (20 + d * 0.15);
      yaz(i++, x + (q.x - x) * u, y + (q.y - y) * u + (q.y / 60) * yay * 0.4, z + (q.z - z) * u + yay, t < B ? 0.4 + 0.6 * (1 - sk) : 1 - 0.5 * u,
        gir * (0.5 + 1.4 * (1 - sk) * (1 - u) + 0.5 * u) * (1 - 0.75 * sinir((t - 4.8) / 1.0)));
    }
    geo.attributes['position']!.needsUpdate = true; geo.attributes['color']!.needsUpdate = true;

    const top = giris(sinir((t - 1.2) / (B - 1.2))), pt = t > B ? Math.exp(-(t - B) * 3.2) : 0;
    ha.scale.setScalar(t < B ? 20 + 120 * top + 8 * Math.sin(t * 30) * top : 0.001); ha.material.opacity = t < B ? 0.5 + 0.5 * top : 0;
    pat.scale.setScalar(t < B ? 0.001 : 80 + 750 * (1 - pt) * pt * 2.2); pat.material.opacity = 0.8 * pt;
    harfGel((k) => (k === 1 ? 0 : icDis(sinir((t - B - 0.55 - Math.abs(k - 1) * 0.12) / 0.9))));
    kenarCiz(icDis(sinir((t - B - 0.3) / 1.3)));
    isik.intensity = t < B ? 4e4 + 8e4 * top : 2.2e5 * pt; isik.position.set(OX, 0, t < B ? 60 : 140);
    sahne.environmentIntensity = 0.3 + 0.7 * icDis(sinir((t - B) / 1.4));
    const tp = (t - 5.0) / 1.3;
    tarayan.intensity = tp > 0 && tp < 1 ? 9e4 * Math.sin(Math.PI * tp) : 0; tarayan.position.set(-260 + 520 * sinir(tp), 40, 70);

    // Başlangıçta atomun tamamı (yarı genişlik ~165, yarı yükseklik ~135) kadraja sığar; kamera yörüngeler çekildikçe noktaya
    // yaklaşır, patlamadan sonra kelimeyi kadraja alır.
    const tf = Math.tan((kamera.fov * Math.PI) / 360), Rsig = Math.max(340, Math.max(135 / tf, 165 / (tf * kamera.aspect)) + 60);
    const c1 = cikis(sinir((t - B) / 1.8)), R = Rsig + (300 - Rsig) * top + 280 * c1, th = 0.3 * (1 - c1), lx = OX * (1 - c1);
    kamera.position.set(lx + Math.sin(th) * R, 50 * (1 - c1), Math.cos(th) * R); kamera.lookAt(lx, 0, 0);

    const pl = ayar.parlama, a = t - B;
    if (pl !== null) {
      pl.style.opacity = String(a > 0 ? Math.exp(-a * 3.2) : 0);
      pl.style.transform = `translateY(-50%) scaleX(${a > 0 ? 0.3 + 1.2 * cikis(sinir(a / 0.6)) : 0.3})`;
    }
    const al = ayar.alti;
    if (al) {
      altiNokta.set(0, ALTI_Y, 0).project(kamera);
      al.style.top = `${((1 - altiNokta.y) / 2) * 100}%`;
      al.style.opacity = String(icDis(sinir((t - B - 1.2) / 0.8)));
    }
    renderer.render(sahne, kamera);
  };

  const boyut = (): void => {
    const w = kap.clientWidth, h = kap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h; kamera.fov = w / h < 1.3 ? 48 : 30; kamera.updateProjectionMatrix();
  };

  let t = ayar.hareketsiz ? SABIT_KARE : 0, kare = 0, onceki: number | null = null, durma = ILK_DURMA, olcum: number[] = [], sayac = 0;
  const kaliteyiDusur = (): void => {
    yari = true; geo.setDrawRange(0, Math.ceil(N / 2)); renderer.setPixelRatio(1); boyut();
  };
  const adim = (z: number): void => {
    kare = requestAnimationFrame(adim);
    const gecen = onceki === null ? 0 : z - onceki;
    if (onceki !== null && !cizilmeli(t, gecen)) return;
    onceki = z;
    // Sekme arka plandayken tarayıcı kare vermez; dönüşte zaman sıçramasın diye adım 0,1 saniyeyle sınırlı.
    t = Math.min(t + Math.min(gecen, 100) / 1000, durma);
    if (!yari && t < B && sayac++ >= OLCUM_ATLA && olcum.length < OLCUM_KARE) {
      olcum.push(gecen);
      if (kaliteDusmeli(olcum) === true) kaliteyiDusur();
    }
    ciz(t);
    if (t >= durma) { cancelAnimationFrame(kare); kare = 0; }
  };
  const oynat = (): void => { if (kare === 0) { onceki = null; kare = requestAnimationFrame(adim); } };
  // Dokunma, fare ya da tuş O'yu 20 saniye daha döndürür; sahne bitmeden gelen girdi süreyi uzatır.
  const uyan = (): void => { if (t < BITIS) return; durma = durmayiUzat(durma, t); oynat(); };
  const OLAYLAR = ['pointermove', 'pointerdown', 'keydown'] as const;

  const gozcu = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { boyut(); if (kare === 0) ciz(t); });
  gozcu?.observe(kap);
  boyut();
  if (ayar.hareketsiz) ciz(t);
  else { OLAYLAR.forEach((o) => window.addEventListener(o, uyan, { passive: true })); oynat(); }

  const bastan = (): void => {
    if (ayar.hareketsiz) return;
    t = 0; durma = ILK_DURMA; onceki = null; oynat();
  };
  const kapat = (): void => {
    cancelAnimationFrame(kare); kare = 0; olcum = [];
    OLAYLAR.forEach((o) => window.removeEventListener(o, uyan));
    gozcu?.disconnect();
    atilacak.forEach((a) => a.dispose());
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
  return { kapat, bastan };
}
