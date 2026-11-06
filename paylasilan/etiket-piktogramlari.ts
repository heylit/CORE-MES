// Etiket piktogramları (kart 2168): basılan etikette ve ekranda aynı çizim. Termal yazıcı siyah-beyaz basar; ince çizgi kırılır,
// bu yüzden biçimler doludur. Her piktogram 48x48 birimlik kutuda ilkel biçimlerden kurulur: sunucu noktaya çevirir, istemci SVG çizer.
// Biçimler sırayla boyanır; `oyuk` biçim zemin rengiyle boyar (delik, ayrım çizgisi).

export const PIKTOGRAM_ADLARI = [
  'konum', 'raf', 'malzeme', 'lot', 'refakat', 'tezgah', 'kalite', 'hatali', 'koli', 'kumpas', 'seri', 'fason', 'yazici',
  'onay', 'uyari', 'red', 'bekliyor', 'rework', 'hurda', 'tara', 'bayrak', 'yukari', 'halka',
] as const;
export type PiktogramAdi = (typeof PIKTOGRAM_ADLARI)[number];

// siyah: siyah kare, beyaz piktogram. beyaz: çerçeveli beyaz kare, siyah piktogram. cizgili: çapraz taralı çerçeve, ortada beyaz
// kare ve siyah piktogram. yok: karosuz, yalnız siyah piktogram.
export const KARO_TURLERI = ['siyah', 'beyaz', 'cizgili', 'yok'] as const;
export type KaroTuru = (typeof KARO_TURLERI)[number];

export const KUTU = 48;

type Nokta = readonly [number, number];
interface Ortak { oyuk?: boolean }
export type Sekil = Ortak & (
  | { t: 'dikdortgen'; x: number; y: number; g: number; h: number; r?: number }
  | { t: 'daire'; x: number; y: number; r: number }
  | { t: 'cokgen'; n: readonly Nokta[] }
  | { t: 'cizgi'; n: readonly Nokta[]; k: number }
  // "/" yönünde çapraz şeritler: x + y değeri `aralik` ile bölününce kalanı `k`dan küçük olan noktalar boyanır.
  | { t: 'tarama'; x: number; y: number; g: number; h: number; aralik: number; k: number }
);

const d = (x: number, y: number, g: number, h: number, r?: number): Sekil => (r === undefined ? { t: 'dikdortgen', x, y, g, h } : { t: 'dikdortgen', x, y, g, h, r });
const o = (s: Sekil): Sekil => ({ ...s, oyuk: true });
const c = (x: number, y: number, r: number): Sekil => ({ t: 'daire', x, y, r });
const p = (...n: Nokta[]): Sekil => ({ t: 'cokgen', n });
const z = (k: number, ...n: Nokta[]): Sekil => ({ t: 'cizgi', n, k });
// Yay: açılar derece, ekran yönünde (y aşağı); a0'dan a1'e adım adım.
function yay(cx: number, cy: number, r: number, a0: number, a1: number, adim = 16): Nokta[] {
  return Array.from({ length: adim + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / adim) * Math.PI) / 180;
    return [Math.round((cx + r * Math.cos(a)) * 100) / 100, Math.round((cy + r * Math.sin(a)) * 100) / 100] as const;
  });
}

export const PIKTOGRAMLAR: Readonly<Record<PiktogramAdi, readonly Sekil[]>> = {
  konum: [c(24, 18, 15.5), p([9.6, 24], [24, 46], [38.4, 24]), o(c(24, 18, 6.5))],
  raf: [d(4, 3, 5, 42), d(39, 3, 5, 42), d(4, 17, 40, 3.5), d(4, 31.5, 40, 3.5), d(4, 43, 40, 2.5), d(12, 6, 11, 11), d(25, 9.5, 11, 7.5), o(d(16.5, 6, 2, 4)),
    d(12, 23, 8, 8.5), d(22, 21, 14, 10.5), d(12, 37, 24, 6)],
  malzeme: [c(13.5, 32, 10), c(34.5, 32, 10), c(24, 13.5, 10), o(c(13.5, 32, 3.2)), o(c(34.5, 32, 3.2)), o(c(24, 13.5, 3.2))],
  lot: [d(5, 4, 17, 15), d(26, 4, 17, 15), d(5, 21.5, 38, 14.5), o(d(12, 4, 3, 6)), o(d(33, 4, 3, 6)), o(d(22.5, 21.5, 3, 6)),
    d(2, 38.5, 44, 3.5), d(4, 42, 7, 4), d(20.5, 42, 7, 4), d(37, 42, 7, 4)],
  refakat: [d(7, 5, 34, 41, 3), d(16, 1.5, 16, 7.5, 2), o(d(20, 3.5, 8, 3, 1)), o(d(14.8, 16, 2.4, 22)), o(c(16, 16, 3.6)), o(c(16, 27, 3.6)), o(c(16, 38, 3.6)),
    o(d(23, 14.5, 13, 3, 1.5)), o(d(23, 25.5, 13, 3, 1.5)), o(d(23, 36.5, 9, 3, 1.5))],
  tezgah: [d(3, 7, 42, 33, 2), o(d(7, 11, 25, 24)), d(16, 11, 7, 7), p([16, 18], [23, 18], [19.5, 24]), d(11, 29, 17, 4), o(d(35, 11, 7, 10)),
    o(c(38.5, 26, 1.8)), o(c(38.5, 31.5, 1.8)), d(1, 40, 46, 5), d(38, 1, 4, 6)],
  kalite: [p([24, 2], [42, 8.5], [42, 22], [41.4, 27], [39.6, 32], [36.6, 37], [32, 41.6], [28, 44.2], [24, 46], [20, 44.2], [16, 41.6], [11.4, 37], [8.4, 32], [6.6, 27], [6, 22], [6, 8.5]),
    o(z(5.2, [15, 24.5], [21.5, 31], [34, 17.5]))],
  hatali: [c(24, 24, 21), o(c(24, 24, 7)), o(c(24, 9.5, 2.6)), o(c(24, 38.5, 2.6)), o(c(9.5, 24, 2.6)), o(c(38.5, 24, 2.6)),
    o(z(3, [30, 3.5], [25, 12.5], [30.5, 18], [24.5, 26.5], [28.5, 34], [25.5, 45]))],
  koli: [p([24, 3], [45, 12.5], [45, 35.5], [24, 45], [3, 35.5], [3, 12.5]), o(z(2.6, [3.8, 12.8], [24, 22], [44.2, 12.8])), o(z(2.6, [24, 22], [24, 44.5])), o(z(4, [13, 7.8], [34, 17.3]))],
  kumpas: [d(3, 5, 42, 8), p([3, 13], [12, 13], [12, 28], [7.5, 43], [3, 43]), p([21, 13], [30, 13], [30, 25], [25.5, 34], [21, 34]), d(19, 3, 13, 12, 1.5), o(d(22, 6, 7, 4)),
    ...[14, 34, 38, 42].map((x) => o(d(x, 7, 1.4, 2.6)))],
  seri: [d(2, 9, 44, 30, 3), o(c(7, 14, 1.8)), o(c(41, 14, 1.8)), o(c(7, 34, 1.8)), o(c(41, 34, 1.8)),
    o(z(3.2, [19, 15], [16.5, 33])), o(z(3.2, [28, 15], [25.5, 33])), o(z(3.2, [13, 20.5], [32, 20.5])), o(z(3.2, [12, 27.5], [31, 27.5])), o(d(34, 18, 2, 12)), o(d(37.5, 18, 1, 12))],
  fason: [d(1, 10, 28, 23, 1.5), p([29, 17], [38.5, 17], [46, 25.5], [46, 33], [29, 33]), o(p([32, 20], [37.5, 20], [42, 25], [32, 25])),
    c(10, 37, 6), o(c(10, 37, 2.4)), c(37, 37, 6), o(c(37, 37, 2.4)), o(z(3.4, [7, 21.5], [20, 21.5])), o(z(3.4, [15.5, 16.5], [20.5, 21.5], [15.5, 26.5]))],
  yazici: [d(12, 2, 24, 11), d(3, 14, 42, 20, 3), o(c(38.5, 20, 2.2)), d(11, 27, 26, 19), o(d(13.5, 29.5, 21, 14)), d(16, 32, 16, 2.4), d(16, 36.5, 11, 2.4)],
  onay: [c(24, 24, 21.5), o(z(5.6, [13, 24.5], [20.5, 32], [35.5, 16.5]))],
  uyari: [p([24, 3], [46.5, 43.5], [1.5, 43.5]), o(d(21.6, 16, 4.8, 15, 2.4)), o(c(24, 36.5, 2.8))],
  red: [p([15.5, 2], [32.5, 2], [46, 15.5], [46, 32.5], [32.5, 46], [15.5, 46], [2, 32.5], [2, 15.5]), o(z(5.6, [15, 15], [33, 33])), o(z(5.6, [33, 15], [15, 33]))],
  bekliyor: [d(8, 2, 32, 4.5, 1.5), d(8, 41.5, 32, 4.5, 1.5),
    p([11, 6.5], [37, 6.5], [37, 9.5], [34, 15], [27, 24], [34, 33], [37, 38.5], [37, 41.5], [11, 41.5], [11, 38.5], [14, 33], [21, 24], [14, 15], [11, 9.5]),
    o(p([16, 11], [32, 11], [24, 21])), o(p([24, 29.5], [31.5, 37.5], [16.5, 37.5])), p([24, 32.5], [29.4, 36.9], [18.6, 36.9])],
  rework: [z(6, ...yay(24, 24, 15.5, -15.4, -345.5, 24)), p([32, 11], [46.5, 8], [44, 22.5]), c(24, 24, 4.5)],
  hurda: [d(17, 2, 14, 6, 1.5), o(d(20, 4.5, 8, 2)), d(5, 8, 38, 5, 1.5), p([8.5, 15.5], [39.5, 15.5], [36.7, 46], [11.3, 46]),
    o(d(16, 20, 3, 21, 1.5)), o(d(22.5, 20, 3, 21, 1.5)), o(d(29, 20, 3, 21, 1.5))],
  tara: [z(4.5, [4, 14], [4, 4], [14, 4]), z(4.5, [34, 4], [44, 4], [44, 14]), z(4.5, [44, 34], [44, 44], [34, 44]), z(4.5, [14, 44], [4, 44], [4, 34]),
    d(12, 14, 4, 20), d(19, 14, 2, 20), d(24, 14, 5, 20), d(31, 14, 2, 20), d(35, 14, 2, 20)],
  bayrak: [d(8, 3, 4.5, 42, 2), p([12.5, 5], [39.5, 5], [33.5, 14], [39.5, 23], [12.5, 23])],
  yukari: [p([14, 4], [23, 14], [17, 14], [17, 30], [11, 30], [11, 14], [5, 14]), p([34, 4], [43, 14], [37, 14], [37, 30], [31, 30], [31, 14], [25, 14]), d(4, 36, 40, 6, 1.5)],
  // Refakat kartında işlem no çerçevesi: içine yazı basılır.
  halka: [c(24, 24, 24), o(c(24, 24, 19.8))],
};

// Biçimi kutu içinde ölçekleyip kaydırır; `tersle` dolu ile oyuğu değiştirir (siyah karoda beyaz piktogram).
function tasi(s: Sekil, olcek: number, ofset: number, tersle: boolean): Sekil {
  const n = (v: number) => ofset + v * olcek;
  const oyuk = tersle ? !s.oyuk : s.oyuk === true;
  const ek = oyuk ? { oyuk: true } : {};
  switch (s.t) {
    case 'dikdortgen': return { t: 'dikdortgen', x: n(s.x), y: n(s.y), g: s.g * olcek, h: s.h * olcek, ...(s.r === undefined ? {} : { r: s.r * olcek }), ...ek };
    case 'daire': return { t: 'daire', x: n(s.x), y: n(s.y), r: s.r * olcek, ...ek };
    case 'cokgen': return { t: 'cokgen', n: s.n.map(([x, y]) => [n(x), n(y)] as const), ...ek };
    case 'cizgi': return { t: 'cizgi', n: s.n.map(([x, y]) => [n(x), n(y)] as const), k: s.k * olcek, ...ek };
    case 'tarama': return { t: 'tarama', x: n(s.x), y: n(s.y), g: s.g * olcek, h: s.h * olcek, aralik: s.aralik * olcek, k: s.k * olcek, ...ek };
  }
}
const yerlestir = (ad: PiktogramAdi, olcek: number, ofset: number, tersle: boolean): Sekil[] => PIKTOGRAMLAR[ad].map((s) => tasi(s, olcek, ofset, tersle));

// Karo ve piktogram birlikte, 48 birimlik kutuda; oranlar önizleme 3'teki (2168) çizimle aynı.
export function simgeCizimi(ad: PiktogramAdi, karo: KaroTuru): Sekil[] {
  switch (karo) {
    case 'yok': return yerlestir(ad, 1, 0, false);
    case 'siyah': return [d(0, 0, KUTU, KUTU), ...yerlestir(ad, 0.74, KUTU * 0.13, true)];
    case 'beyaz': return [d(0, 0, KUTU, KUTU), o(d(2.5, 2.5, KUTU - 5, KUTU - 5)), ...yerlestir(ad, 0.72, KUTU * 0.14, false)];
    case 'cizgili': {
      const ic = KUTU * 0.17;
      return [
        { t: 'tarama', x: 0, y: 0, g: KUTU, h: KUTU, aralik: 6, k: 2.4 },
        d(0, 0, KUTU, 1.8), d(0, KUTU - 1.8, KUTU, 1.8), d(0, 0, 1.8, KUTU), d(KUTU - 1.8, 0, 1.8, KUTU),
        o(d(ic, ic, KUTU - 2 * ic, KUTU - 2 * ic)), ...yerlestir(ad, 0.56, KUTU * 0.22, false),
      ];
    }
  }
}

// Alan değeri "<karo>:<piktogram>" biçimindedir (örnek "siyah:lot"); tanınmayan değer basılmaz.
export function simgeCoz(deger: string): { ad: PiktogramAdi; karo: KaroTuru } | null {
  const parcalar = deger.split(':');
  if (parcalar.length !== 2) return null;
  const [karo, ad] = parcalar;
  return (KARO_TURLERI as readonly string[]).includes(karo ?? '') && (PIKTOGRAM_ADLARI as readonly string[]).includes(ad ?? '')
    ? { ad: ad as PiktogramAdi, karo: karo as KaroTuru } : null;
}
