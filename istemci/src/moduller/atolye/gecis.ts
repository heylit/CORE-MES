import type { GecisTuru, KapiKenari } from '#paylasilan/sozlesme/atolye.ts';
import { bolumeCevir, fabrikaKutusu, fabrikayaCevir } from './fabrika.ts';
import type { BolumKonumu, Nokta2 } from './fabrika.ts';

// Bölüm geçişleri: bölümün dış kenarında, ofset kenarın ortasından (ön ve arka kenarda x, sol ve sağda z yönünde).
// Ortak duvardaki geçiş iki bölümü bağlar; yürüyüş ve rota bölümden bölüme yalnız buradan geçer.

export const GECIS_TURU_ADI: Record<GecisTuru, string> = { kepenk: 'Kepenk', acik: 'Açık geçiş', kapi: 'Kapı', yangin_kapisi: 'Yangın kapısı' };
export const GECIS_GENISLIGI: Record<GecisTuru, number> = { kepenk: 4, acik: 3, kapi: 1, yangin_kapisi: 1.2 };
export const GECIS_ENAZ = 0.8;
export const GECIS_ENCOK = 20;

export interface GecisOlcusu {
  tur: GecisTuru;
  kenar: KapiKenari;
  ofset: number;
  genislik: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100 + 0;
const yatay = (k: KapiKenari): boolean => k === 'arka' || k === 'on';
export const kenarBoyu = (k: KapiKenari, g: number, d: number): number => (yatay(k) ? g : d);

// Kenar boyunca konumu (0 kenarın sol ya da üst ucu) bölüm noktasına çevirir.
export function kenarNoktasi(k: KapiKenari, boyunca: number, g: number, d: number): Nokta2 {
  if (k === 'arka') return { x: boyunca, z: 0 };
  if (k === 'on') return { x: boyunca, z: d };
  if (k === 'sol') return { x: 0, z: boyunca };
  return { x: g, z: boyunca };
}

// Geçişin kenar boyunca aralığı [baş, son] (metre, kenarın ucundan).
export function gecisAraligi(gc: Pick<GecisOlcusu, 'kenar' | 'ofset' | 'genislik'>, g: number, d: number): [number, number] {
  const orta = kenarBoyu(gc.kenar, g, d) / 2 + gc.ofset;
  return [orta - gc.genislik / 2, orta + gc.genislik / 2];
}

export function gecisOrtasi(gc: Pick<GecisOlcusu, 'kenar' | 'ofset'>, g: number, d: number): Nokta2 {
  return kenarNoktasi(gc.kenar, kenarBoyu(gc.kenar, g, d) / 2 + gc.ofset, g, d);
}

// Bölüm noktası en yakın kenara oturur; geçiş kenardan taşmaz (kenardan uzunsa ortada kalır, kural kayıtta söyler).
export function kenaraOtur(p: Nokta2, genislik: number, g: number, d: number): { kenar: KapiKenari; ofset: number } {
  const uzak: [KapiKenari, number][] = [['arka', p.z], ['sol', p.x], ['on', d - p.z], ['sag', g - p.x]];
  const kenar = uzak.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const boy = kenarBoyu(kenar, g, d);
  const sinir = Math.max(0, boy / 2 - genislik / 2);
  const boyunca = (yatay(kenar) ? p.x : p.z) - boy / 2;
  return { kenar, ofset: r2(Math.min(sinir, Math.max(-sinir, boyunca))) };
}

// ---------- bölümler arası bağlantı ----------

export interface GecisliBolum {
  salonId: number;
  konum: BolumKonumu;
  g: number;
  d: number;
  gecisler: readonly GecisOlcusu[];
}

// Bölüm kenarındaki açıklık: bölümün kendi geçişi ya da komşu bölümün bu kenara düşen geçişi (duvar ikisinde de açılır).
export interface Aciklik {
  kenar: KapiKenari;
  bas: number;
  son: number;
  tur: GecisTuru;
  // Öbür yandaki bölüm ve açıklığın ona açılan kısmı (bu bölümün kenarı boyunca); dış kapıda null.
  komsu: number | null;
  ortak: [number, number] | null;
  kendi: boolean;
}

// İki bölüm ancak duvarları üst üste geliyorsa bağlanır (bölümler kenarda değer, ATL-31); yerleşim santimetrededir.
const DUVAR_PAYI = 0.25;
// Bir kişinin geçebileceği en dar ortak açıklık.
const ENAZ_ORTAK = 0.6;

function kenarda(p: Nokta2, g: number, d: number): KapiKenari | null {
  const ic = (v: number, ust: number) => v >= -DUVAR_PAYI && v <= ust + DUVAR_PAYI;
  if (Math.abs(p.z) <= DUVAR_PAYI && ic(p.x, g)) return 'arka';
  if (Math.abs(p.z - d) <= DUVAR_PAYI && ic(p.x, g)) return 'on';
  if (Math.abs(p.x) <= DUVAR_PAYI && ic(p.z, d)) return 'sol';
  if (Math.abs(p.x - g) <= DUVAR_PAYI && ic(p.z, d)) return 'sag';
  return null;
}

export function acikliklar(bolumler: readonly GecisliBolum[]): Map<number, Aciklik[]> {
  const sonuc = new Map<number, Aciklik[]>(bolumler.map((b) => [b.salonId, []]));
  for (const a of bolumler) {
    for (const gc of a.gecisler) {
      const [s0, s1] = gecisAraligi(gc, a.g, a.d);
      const u0 = fabrikayaCevir(a.konum, kenarNoktasi(gc.kenar, s0, a.g, a.d));
      const u1 = fabrikayaCevir(a.konum, kenarNoktasi(gc.kenar, s1, a.g, a.d));
      let komsu: number | null = null;
      let ortak: [number, number] | null = null;
      for (const b of bolumler) {
        if (b.salonId === a.salonId) continue;
        const p0 = bolumeCevir(b.konum, u0);
        const p1 = bolumeCevir(b.konum, u1);
        const kenar = kenarda(p0, b.g, b.d);
        if (kenar === null || kenarda(p1, b.g, b.d) !== kenar) continue;
        const boyunca = (p: Nokta2) => (yatay(kenar) ? p.x : p.z);
        const bas = Math.max(0, Math.min(boyunca(p0), boyunca(p1)));
        const son = Math.min(kenarBoyu(kenar, b.g, b.d), Math.max(boyunca(p0), boyunca(p1)));
        if (son - bas < ENAZ_ORTAK) continue;
        komsu = b.salonId;
        const geri = (v: number) => { const q = bolumeCevir(a.konum, fabrikayaCevir(b.konum, kenarNoktasi(kenar, v, b.g, b.d))); return yatay(gc.kenar) ? q.x : q.z; };
        ortak = [Math.min(geri(bas), geri(son)), Math.max(geri(bas), geri(son))];
        // Komşu aynı yere kendi geçişini koyduysa onunki çizilir.
        const kendileri = b.gecisler.map((o) => ({ kenar: o.kenar, ar: gecisAraligi(o, b.g, b.d) }));
        if (!kendileri.some((o) => o.kenar === kenar && Math.min(o.ar[1], son) - Math.max(o.ar[0], bas) > 0.01)) {
          sonuc.get(b.salonId)?.push({ kenar, bas, son, tur: gc.tur, komsu: a.salonId, ortak: [bas, son], kendi: false });
        }
        break;
      }
      sonuc.get(a.salonId)?.push({ kenar: gc.kenar, bas: s0, son: s1, tur: gc.tur, komsu, ortak, kendi: true });
    }
  }
  return sonuc;
}

export interface Kapi {
  // Geçilen iki bölüm; açıklık birinci bölümün kenarında, ortak kısmı [bas, son] (o bölümün metresi).
  bir: number;
  iki: number;
  kenar: KapiKenari;
  bas: number;
  son: number;
  // Açıklığın ortası (fabrika metresi).
  orta: Nokta2;
  // Kapının iki yanında, bölümlerin içinde kalan birer nokta (rota kapıdan dik geçer).
  birYani: Nokta2;
  ikiYani: Nokta2;
}

// Bölümlerin dışı (avlu): bölüm kimlikleri artıdır, dış kapının öbür yanı bu düğümdür.
export const DIS = 0;

// Bölümler arası kapılar: her bölümün komşuya açılan kendi geçişi; komşusu olmayan geçiş dışarı açılır (bölümler
// arasında boşluk olsa da dışarıdan öbür bölümün kapısına yürünür). `iceri`: kapı yanı noktasının duvardan uzaklığı.
export function kapilar(bolumler: readonly GecisliBolum[], iceri = 0.8): Kapi[] {
  const ac = acikliklar(bolumler);
  const sonuc: Kapi[] = [];
  for (const b of bolumler) {
    for (const a of ac.get(b.salonId) ?? []) {
      if (!a.kendi) continue;
      const boy = kenarBoyu(a.kenar, b.g, b.d);
      const [bas, son] = a.ortak ?? [Math.max(0, a.bas), Math.min(boy, a.son)];
      if (son - bas < ENAZ_ORTAK) continue;
      const ortaYerel = kenarNoktasi(a.kenar, (bas + son) / 2, b.g, b.d);
      const ic = {
        x: ortaYerel.x + (a.kenar === 'sol' ? iceri : a.kenar === 'sag' ? -iceri : 0),
        z: ortaYerel.z + (a.kenar === 'arka' ? iceri : a.kenar === 'on' ? -iceri : 0),
      };
      const orta = fabrikayaCevir(b.konum, ortaYerel);
      const birYani = fabrikayaCevir(b.konum, ic);
      sonuc.push({ bir: b.salonId, iki: a.komsu ?? DIS, kenar: a.kenar, bas, son, orta, birYani, ikiYani: { x: 2 * orta.x - birYani.x, z: 2 * orta.z - birYani.z } });
    }
  }
  return sonuc;
}

// Nokta (birinci bölümün metresi) kapının duvar kalınlığı boyunca geçiş kuşağında mı: kenar boyunca açıklığın içinde
// (gövde payı kadar içeride), duvara dik yönde iki yana `kusak` kadar.
export function kapiKusagindaMi(k: Kapi, p: Nokta2, g: number, d: number, pay: number, kusak: number): boolean {
  const boyunca = yatay(k.kenar) ? p.x : p.z;
  if (boyunca < k.bas + pay || boyunca > k.son - pay) return false;
  const dik = k.kenar === 'arka' ? p.z : k.kenar === 'on' ? p.z - d : k.kenar === 'sol' ? p.x : p.x - g;
  return Math.abs(dik) <= kusak;
}

// Bölümden bölüme en az kapıdan geçen yol (kapı sırası); aynı bölümde boş, yol yoksa null.
export function bolumYolu(kapilar_: readonly Kapi[], bas: number, hedef: number): Kapi[] | null {
  if (bas === hedef) return [];
  const onceki = new Map<number, { kapi: Kapi; den: number }>();
  const kuyruk = [bas];
  const gorulen = new Set([bas]);
  while (kuyruk.length > 0) {
    const s = kuyruk.shift() as number;
    for (const k of kapilar_) {
      const ote = k.bir === s ? k.iki : k.iki === s ? k.bir : null;
      if (ote === null || gorulen.has(ote)) continue;
      gorulen.add(ote);
      onceki.set(ote, { kapi: k, den: s });
      if (ote === hedef) {
        const yol: Kapi[] = [];
        let n = hedef;
        while (n !== bas) { const o = onceki.get(n); if (!o) return null; yol.unshift(o.kapi); n = o.den; }
        return yol;
      }
      kuyruk.push(ote);
    }
  }
  return null;
}

// ---------- dışarıda yürüyüş ----------

// Bölüm duvarına dışarıdan yaklaşma payı (gövde yarıçapı dahil) ve dışarının bölümler kutusundan taşabileceği pay.
const DIS_DUVAR_PAYI = 0.45;
const DIS_ALAN_PAYI = 30;

// Fabrika noktası bütün bölümlerin dışında, duvarlara `pay` kadar uzak ve avluda (bölümler kutusu + pay) mı.
export function distaSerbestMi(bolumler: readonly GecisliBolum[], p: Nokta2, pay = DIS_DUVAR_PAYI): boolean {
  const k = fabrikaKutusu(bolumler);
  if (!k || p.x < k.x0 - DIS_ALAN_PAYI || p.x > k.x1 + DIS_ALAN_PAYI || p.z < k.z0 - DIS_ALAN_PAYI || p.z > k.z1 + DIS_ALAN_PAYI) return false;
  return bolumler.every((b) => {
    const q = bolumeCevir(b.konum, p);
    return q.x < -pay || q.z < -pay || q.x > b.g + pay || q.z > b.d + pay;
  });
}

function dogruSerbest(bolumler: readonly GecisliBolum[], a: Nokta2, s: Nokta2, pay: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(s.x - a.x, s.z - a.z) / 0.2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!distaSerbestMi(bolumler, { x: a.x + (s.x - a.x) * t, z: a.z + (s.z - a.z) * t }, pay)) return false;
  }
  return true;
}

// Dışarıda iki nokta arası yol: doğru yol bir bölüme çarpıyorsa bölüm köşelerinin dışından dolaşılır (görünürlük
// çizgesinde en kısa yol). Uçlar kapı yanı olabilir (duvara yakın): yalnız aradaki noktalar denetlenir. Yol yoksa null.
export function disYolu(bolumler: readonly GecisliBolum[], bas: Nokta2, hedef: Nokta2): Nokta2[] | null {
  const pay = DIS_DUVAR_PAYI - 0.1;
  const kose = DIS_DUVAR_PAYI + 0.5;
  const ucDisi = (a: Nokta2, s: Nokta2) => {
    // Uçtaki kapı yanı duvara yakındır: doğrunun ilk ve son 1 m'si denetlenmez.
    const l = Math.hypot(s.x - a.x, s.z - a.z);
    if (l <= 2) return true;
    const u = 1 / l;
    return dogruSerbest(bolumler, { x: a.x + (s.x - a.x) * u, z: a.z + (s.z - a.z) * u }, { x: s.x - (s.x - a.x) * u, z: s.z - (s.z - a.z) * u }, pay);
  };
  if (ucDisi(bas, hedef)) return [bas, hedef];
  const dugum: Nokta2[] = [bas, hedef];
  for (const b of bolumler) {
    for (const [x, z] of [[-kose, -kose], [b.g + kose, -kose], [b.g + kose, b.d + kose], [-kose, b.d + kose]] as const) {
      const p = fabrikayaCevir(b.konum, { x, z });
      if (distaSerbestMi(bolumler, p, pay)) dugum.push(p);
    }
  }
  const uzak = dugum.map(() => Infinity);
  const onceki = dugum.map(() => -1);
  const bitti = dugum.map(() => false);
  uzak[0] = 0;
  for (;;) {
    let i = -1;
    for (let j = 0; j < dugum.length; j++) if (!bitti[j] && uzak[j] !== Infinity && (i < 0 || (uzak[j] ?? 0) < (uzak[i] ?? 0))) i = j;
    if (i < 0) return null;
    if (i === 1) break;
    bitti[i] = true;
    const a = dugum[i] as Nokta2;
    for (let j = 0; j < dugum.length; j++) {
      const s = dugum[j] as Nokta2;
      if (bitti[j] || j === i) continue;
      const yeni = (uzak[i] ?? 0) + Math.hypot(s.x - a.x, s.z - a.z);
      if (yeni >= (uzak[j] ?? Infinity)) continue;
      const serbest = i < 2 || j < 2 ? ucDisi(a, s) : dogruSerbest(bolumler, a, s, pay);
      if (serbest) { uzak[j] = yeni; onceki[j] = i; }
    }
  }
  const yol: Nokta2[] = [];
  for (let n = 1; n >= 0; n = onceki[n] ?? -1) yol.unshift(dugum[n] as Nokta2);
  return yol;
}
