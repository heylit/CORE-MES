import { kutuNoktasi } from './kurallar.ts';
import type { YaziKutusu } from './okuma.ts';

// Balon dizimi (894 a): çap ölçü yazısının yüksekliğinden gelir, balon yazıya, çizgiye ve başka balona binmez. Karma kipte balon önce
// yazısının yanına konur, temiz yer yoksa çerçevenin iç kenarındaki şeride dizilir. Elle konan balon (yer) sabittir; ötekiler ondan kaçar.
// Eski Arkon eşliği `balonYerlesimi`'ndedir ve değişmez; bu yeni kuraldır.

export type BalonKipi = 'karma' | 'yakin' | 'serit';
export type BalonYerKipi = 'yakin' | 'serit';
export const BALON_KIPLERI: readonly BalonKipi[] = ['karma', 'yakin', 'serit'];
export const BALON_KIPI_ADI: Readonly<Record<BalonKipi, string>> = { karma: 'Karma', yakin: 'Yakın', serit: 'Kenar şeridi' };
export const BALON_BOYLARI: readonly (readonly [number, string])[] = [[0.8, 'S'], [1, 'M'], [1.25, 'L'], [1.5, 'XL']];

export interface DizilecekBalon {
  id: number; x: number; y: number; ar?: YaziKutusu | undefined; yer?: readonly [number, number] | null | undefined; yerKipi?: BalonYerKipi | null | undefined;
}
export interface DizimSecenegi {
  W: number; H: number; carpan: number; kip: BalonKipi;
  ink?: Uint8Array | null | undefined;
  // Balonsuz ölçü ve yazıların kutuları (okuma önerileri); balonların kendi kutuları ayrıca hesaba girer.
  yazilar?: readonly YaziKutusu[] | undefined;
  // Antet ve tablo blokları: balon buraya konmaz.
  yasak?: readonly { x0: number; y0: number; x1: number; y1: number }[] | undefined;
}
export type Kilavuz = [number, number, number, number];
export interface DizimKonumu { x: number; y: number; lead: Kilavuz | null; yer: 'sabit' | 'yakin' | 'serit' }
export interface Dizim { R: number; pos: Record<number, DizimKonumu> }

// Yarıçap = 1,1 x ortanca yazı yüksekliği x ayar çarpanı. Okumada yarı yükseklik yazı boyunun 0,62'sidir. Yazısı bilinmeyen resimde eski
// ölçü (sayfa genişliğinin binde 16'sı) geçerlidir; sonuç sayfanın binde 6 ile 24'ü arasında tutulur.
export function balonYaricapi(bal: readonly Pick<DizilecekBalon, 'ar'>[], W: number, carpan: number): number {
  const U = W / 1000, k = carpan > 0 ? carpan : 1;
  const h = bal.flatMap((b) => (b.ar && b.ar[3] > 0 ? [b.ar[3] / 0.62] : [])).sort((a, b) => a - b);
  const R = h.length ? 1.1 * h[h.length >> 1]! * k : 16 * U * k;
  return Math.max(6 * U, Math.min(24 * U, R));
}

const icinde = (ar: YaziKutusu, x: number, y: number, pay: number) => { const p = kutuNoktasi(ar, x, y); return Math.hypot(p[0] - x, p[1] - y) <= pay; };

// Yazı kutularının ızgara dizini. Dizim her aday yer için yazılara bakar; bütün kutuları taramak balon ve yazı sayısıyla karesel büyür ve
// her balon değişikliğinde ekranı dondurur. Kutu, köşegen yarıçaplı dairesini örten hücrelere konur: bir noktaya `pay` kadar yakın kutunun en
// yakın noktası o dairededir, o noktanın hücresi de sorgu karesindedir. Aday bulunduktan sonra kesin sınama aynıdır: sonuç değişmez.
interface KutuDizini { herBiri(x: number, y: number, pay: number, f: (ar: YaziKutusu) => boolean): boolean }
function kutuDizini(kutular: readonly YaziKutusu[], hucre: number): KutuDizini {
  const anahtar = (gx: number, gy: number) => (gx + 1e5) * 2e5 + gy + 1e5;
  const hucreler = new Map<number, number[]>();
  kutular.forEach((ar, i) => {
    const r = Math.hypot(ar[2], ar[3]);
    for (let gx = Math.floor((ar[0] - r) / hucre); gx <= Math.floor((ar[0] + r) / hucre); gx++) {
      for (let gy = Math.floor((ar[1] - r) / hucre); gy <= Math.floor((ar[1] + r) / hucre); gy++) {
        const k = anahtar(gx, gy), l = hucreler.get(k);
        if (l) l.push(i); else hucreler.set(k, [i]);
      }
    }
  });
  const damga = new Uint32Array(kutular.length);
  let tur = 0;
  return {
    // f true dönünce durur ve true döner (Array.some gibi); her kutu bir sorguda en çok bir kez görülür.
    herBiri(x, y, pay, f) {
      tur++;
      for (let gx = Math.floor((x - pay) / hucre); gx <= Math.floor((x + pay) / hucre); gx++) {
        for (let gy = Math.floor((y - pay) / hucre); gy <= Math.floor((y + pay) / hucre); gy++) {
          const l = hucreler.get(anahtar(gx, gy));
          if (l) for (const i of l) { if (damga[i] === tur) continue; damga[i] = tur; if (f(kutular[i]!)) return true; }
        }
      }
      return false;
    },
  };
}

function kesisir(a: Kilavuz, b: Kilavuz): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(a[0], a[1], a[2], a[3], b[0], b[1]) * o(a[0], a[1], a[2], a[3], b[2], b[3]) < 0
    && o(b[0], b[1], b[2], b[3], a[0], a[1]) * o(b[0], b[1], b[2], b[3], a[2], a[3]) < 0;
}

// Kılavuz balonun kenarından yazı kutusunun en yakın noktasına (yazısız balonda ölçü noktasına) gider; balon yazıya değiyorsa çizilmez.
export function kilavuzCizgisi(b: Pick<DizilecekBalon, 'x' | 'y' | 'ar'>, bx: number, by: number, R: number): Kilavuz | null {
  const p = b.ar ? kutuNoktasi(b.ar, bx, by) : [b.x, b.y] as [number, number], d = Math.hypot(p[0] - bx, p[1] - by);
  if (d <= R * (b.ar ? 1.05 : 0.6)) return null;
  const k = R / d;
  return [bx + (p[0] - bx) * k, by + (p[1] - by) * k, p[0], p[1]];
}

export function balonDizimi(bal: readonly DizilecekBalon[] | null | undefined, sec: DizimSecenegi): Dizim {
  const { W, H, ink } = sec;
  const R = balonYaricapi(bal ?? [], W, sec.carpan), bosluk = R * 0.35;
  const out: Dizim = { R, pos: {} };
  if (!bal || !bal.length) return out;
  const kutular: YaziKutusu[] = [...(sec.yazilar ?? []), ...bal.flatMap((b) => (b.ar ? [b.ar] : []))];
  const yasak = sec.yasak ?? [];
  const yerler: [number, number][] = [], kilavuzlar: Kilavuz[] = [];
  const dizin = kutuDizini(kutular, 2 * R);

  // `esik` verilirse oran eşiği aşınca sayım durur: dönen değer yine eşiğin üstündedir (yalnız eşikle karşılaştırılan yerde kullanılır).
  const murekkep = (x: number, y: number, r: number, esik = Number.POSITIVE_INFINITY) => {
    if (!ink) return 0;
    let n = 0;
    for (const f of [0.3, 0.6, 0.92]) for (let k = 0; k < 20; k++) {
      const a = k * Math.PI / 10, px = Math.round(x + Math.cos(a) * r * f), py = Math.round(y + Math.sin(a) * r * f);
      if (px > 0 && py > 0 && px < W && py < H && ink[py * W + px]) { n++; if (n / 60 > esik) return n / 60; }
    }
    return n / 60;
  };
  // Kılavuzun kestiği çizgi sayısı; uçtaki birkaç piksel (yazının kendisi) sayılmaz.
  const cizgiKesimi = (l: Kilavuz) => {
    if (!ink) return 0;
    const d = Math.hypot(l[2] - l[0], l[3] - l[1]), adim = Math.max(1, W / 1500), pay = R * 0.3;
    let n = 0, once = 0;
    for (let s = pay; s < d - pay; s += adim) {
      const px = Math.round(l[0] + (l[2] - l[0]) * s / d), py = Math.round(l[1] + (l[3] - l[1]) * s / d), v = ink[py * W + px] ?? 0;
      if (v && !once) n++; once = v;
    }
    return n;
  };
  const yaziKeser = (l: Kilavuz, kendi: YaziKutusu | undefined) => {
    const d = Math.hypot(l[2] - l[0], l[3] - l[1]), adim = R * 0.4;
    for (let s = adim; s < d - adim; s += adim) {
      const px = l[0] + (l[2] - l[0]) * s / d, py = l[1] + (l[3] - l[1]) * s / d;
      if (dizin.herBiri(px, py, 0, (ar) => ar !== kendi && icinde(ar, px, py, 0))) return true;
    }
    return false;
  };
  const sayfada = (x: number, y: number) => x > R * 1.2 && y > R * 1.2 && x < W - R * 1.2 && y < H - R * 1.2
    && !yasak.some((b) => x > b.x0 - R && x < b.x1 + R && y > b.y0 - R && y < b.y1 + R);
  const balonaBiner = (x: number, y: number) => yerler.some((p) => Math.hypot(p[0] - x, p[1] - y) < 2 * R + bosluk);
  const yaziyaBiner = (x: number, y: number) => dizin.herBiri(x, y, R + bosluk * 0.5, (ar) => icinde(ar, x, y, R + bosluk * 0.5));
  const koy = (b: DizilecekBalon, x: number, y: number, yer: DizimKonumu['yer']) => {
    const l = kilavuzCizgisi(b, x, y, R);
    out.pos[b.id] = { x, y, lead: l, yer }; yerler.push([x, y]); if (l) kilavuzlar.push(l);
  };

  for (const b of bal) if (b.yer) koy(b, b.yer[0], b.yer[1], 'sabit');
  const kalan = bal.filter((b) => !b.yer);
  // Sıkışık olan önce yer seçer.
  const yakinYazi = (x: number, y: number) => { let n = 0; dizin.herBiri(x, y, R * 6, (ar) => { if (Math.hypot(ar[0] - x, ar[1] - y) < R * 6) n++; return false; }); return n; };
  const zorluk = (b: DizilecekBalon) => murekkep(b.x, b.y, R * 4) + yakinYazi(b.x, b.y) * 0.05;
  const sirali = kalan.map((b) => [zorluk(b), b] as const).sort((p, q) => q[0] - p[0]).map((p) => p[1]);
  const seride: DizilecekBalon[] = [];
  for (const b of sirali) {
    const istek = b.yerKipi ?? (sec.kip === 'serit' ? 'serit' : 'yakin');
    if (istek === 'serit') { seride.push(b); continue; }
    const ox = b.ar ? b.ar[0] : b.x, oy = b.ar ? b.ar[1] : b.y;
    let en: [number, number, number] | null = null;
    for (let y = 0; y < 24; y++) {
      const a = (-60 + y * 15) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
      const kenar = b.ar ? Math.abs(b.ar[2] * (ux * Math.cos(b.ar[4]) + uy * Math.sin(b.ar[4]))) + Math.abs(b.ar[3] * (-ux * Math.sin(b.ar[4]) + uy * Math.cos(b.ar[4]))) : 0;
      for (let k = 0; k < 8; k++) {
        const d = kenar + bosluk + R + k * R * 0.8, x = ox + ux * d, yy = oy + uy * d;
        if (!sayfada(x, yy) || balonaBiner(x, yy) || yaziyaBiner(x, yy)) continue;
        const m = murekkep(x, yy, R, 0.04); if (m > 0.04) continue;
        const l = kilavuzCizgisi(b, x, yy, R);
        let maliyet = m * 400 + (d / R) * 5 + y * 0.05;
        if (l) maliyet += cizgiKesimi(l) * 25 + (yaziKeser(l, b.ar) ? 300 : 0) + kilavuzlar.filter((q) => kesisir(l, q)).length * 200;
        if (!en || maliyet < en[0]) en = [maliyet, x, yy];
      }
    }
    if (!en || (sec.kip === 'karma' && !b.yerKipi && en[0] > 120)) { seride.push(b); continue; }
    koy(b, en[1], en[2], 'yakin');
  }
  if (seride.length) seritDizimi(seride, { W, H, R, bosluk, murekkep, balonaBiner, yaziyaBiner, sayfada, cizgiKesimi, yaziKeser, koy });
  return out;
}

interface SeritBaglami {
  W: number; H: number; R: number; bosluk: number;
  murekkep: (x: number, y: number, r: number, esik?: number) => number;
  balonaBiner: (x: number, y: number) => boolean; yaziyaBiner: (x: number, y: number) => boolean; sayfada: (x: number, y: number) => boolean;
  cizgiKesimi: (l: Kilavuz) => number; yaziKeser: (l: Kilavuz, kendi: YaziKutusu | undefined) => boolean;
  koy: (b: DizilecekBalon, x: number, y: number, yer: DizimKonumu['yer']) => void;
}
interface Kenar { yatay: boolean; sabit: number; yuva: number[]; uye: DizilecekBalon[] }

// Kenar şeridi: her kenarda çerçeve çizgisinin içinde boş yuvalar aranır (en çok yuvası olan çizgi seçilir). Balon, uzaklık ve kılavuzunun
// keseceği çizgi ve yazı en az olan kenara gider; kenar içinde yazı sırasıyla, toplam kayma en az olacak biçimde yuvalara eşlenir. Sıra
// korunduğu için aynı kenardaki kılavuzlar kesişmez.
function seritDizimi(liste: readonly DizilecekBalon[], c: SeritBaglami): void {
  const { W, H, R, bosluk } = c, M = Math.min(W, H), adim = 2 * R + bosluk, yarim = adim / 2;
  const kenarlar: Kenar[] = [];
  for (const [yatay, ust] of [[true, true], [true, false], [false, true], [false, false]] as const) {
    let en: Kenar | null = null;
    for (const o of [0.025, 0.04, 0.055, 0.07]) {
      const sabit = ust ? M * o + R : (yatay ? H : W) - M * o - R, uzun = yatay ? W : H, yuva: number[] = [];
      for (let v = M * 0.03 + R; v <= uzun - M * 0.03 - R; v += yarim) {
        const x = yatay ? v : sabit, y = yatay ? sabit : v;
        if (c.sayfada(x, y) && !c.balonaBiner(x, y) && !c.yaziyaBiner(x, y) && c.murekkep(x, y, R, 0.04) < 0.04) yuva.push(v);
      }
      if (!en || yuva.length > en.yuva.length) en = { yatay, sabit, yuva, uye: [] };
    }
    if (en) kenarlar.push(en);
  }
  const bedel = (b: DizilecekBalon, k: Kenar) => {
    const ox = b.ar ? b.ar[0] : b.x, oy = b.ar ? b.ar[1] : b.y;
    const l: Kilavuz = k.yatay ? [ox, k.sabit, ox, oy] : [k.sabit, oy, ox, oy];
    return Math.abs((k.yatay ? oy : ox) - k.sabit) / R + c.cizgiKesimi(l) * 2 + (c.yaziKeser(l, b.ar) ? 30 : 0);
  };
  const kalanlar: DizilecekBalon[] = [];
  for (const b of liste) {
    const k = [...kenarlar].sort((p, q) => bedel(b, p) - bedel(b, q)).find((q) => q.uye.length < Math.floor(q.yuva.length / 2));
    if (k) k.uye.push(b); else kalanlar.push(b);
  }
  for (const k of kenarlar) {
    const u = k.uye.map((b) => [k.yatay ? (b.ar ? b.ar[0] : b.x) : (b.ar ? b.ar[1] : b.y), b] as const).sort((p, q) => p[0] - q[0]);
    const secilen = siraKoruyanEsleme(u.map((p) => p[0]), k.yuva, adim);
    u.forEach(([, b], i) => {
      const v = secilen[i];
      if (v === undefined) { kalanlar.push(b); return; }
      c.koy(b, k.yatay ? v : k.sabit, k.yatay ? k.sabit : v, 'serit');
    });
  }
  // Şeride sığmayan balon yazısının yanında kalır (örtüşmeden kaçmak yerine görünür kalmak).
  for (const b of kalanlar) c.koy(b, b.ar ? b.ar[0] : b.x, (b.ar ? b.ar[1] - b.ar[3] : b.y) - R * 1.4, 'yakin');
}

// Sıralı hedefleri sıralı yuvalara, aralarında en az `adim` kalacak ve toplam kayma en az olacak biçimde eşler (dinamik programlama).
export function siraKoruyanEsleme(hedef: readonly number[], yuva: readonly number[], adim: number): number[] {
  const n = hedef.length, m = yuva.length, SONSUZ = Number.POSITIVE_INFINITY;
  if (!n || !m) return [];
  const dp = Array.from({ length: n }, () => new Float64Array(m).fill(SONSUZ)), geri = Array.from({ length: n }, () => new Int32Array(m).fill(-1));
  for (let j = 0; j < m; j++) dp[0]![j] = Math.abs(yuva[j]! - hedef[0]!);
  for (let i = 1; i < n; i++) {
    let enIyi = SONSUZ, enJ = -1, q = 0;
    for (let j = 0; j < m; j++) {
      // j'den en az `adim` gerideki bütün yuvaların en iyisi (yuvalar sıralı, q ileri gider).
      while (q < m && yuva[j]! - yuva[q]! >= adim - 1e-9) { if (dp[i - 1]![q]! < enIyi) { enIyi = dp[i - 1]![q]!; enJ = q; } q++; }
      if (enJ >= 0 && enIyi < SONSUZ) { dp[i]![j] = enIyi + Math.abs(yuva[j]! - hedef[i]!); geri[i]![j] = enJ; }
    }
  }
  let j = -1, en = SONSUZ;
  for (let q = 0; q < m; q++) if (dp[n - 1]![q]! < en) { en = dp[n - 1]![q]!; j = q; }
  if (j < 0) return [];
  const out = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) { out[i] = yuva[j]!; j = geri[i]![j]!; }
  return out;
}
