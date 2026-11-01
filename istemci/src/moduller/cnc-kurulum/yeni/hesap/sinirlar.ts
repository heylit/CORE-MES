import type { Tezgah } from '../veri/tipler.ts';

// Prototipin SIĞMA KONTROLÜ bölümünün veri ve saf kısmı: parça ve ham tezgâhın çap, boy, kurs, yük sınırlarına sığıyor mu.
// Tezgâh değerleri Hazırlık → Tezgâh bilgileri'nden (girildiyse), yoksa katalog değerlerinden (CAP_DEF; tipik katalog
// değerleri, varsayım).

export interface KapasiteDegerleri {
  maxD?: number; maxL?: number; bar?: number; subBar?: number; chuck?: number;
  xT?: number; yT?: number; zT?: number; zDay?: number; load?: number; viseW?: number; tbl?: string;
}

export const CAP_DEF: Record<string, KapasiteDegerleri> = {
  tfm: { maxD: 668, maxL: 1549, bar: 101, subBar: 78, chuck: 12, xT: 673, yT: 300, zT: 1524 },
  tcy: { maxD: 366, maxL: 705, bar: 80, chuck: 10, yT: 100 },
  f5a: { xT: 650, yT: 520, zT: 475, zDay: 625, tbl: 'Ø630', load: 300, viseW: 160 },
  f5b: { xT: 630, yT: 560, zT: 560, zDay: 710, tbl: '840×600', load: 500, viseW: 160 },
  f5c: { xT: 750, yT: 650, zT: 560, zDay: 710, tbl: '840×650', load: 600, viseW: 200 },
  f5d: { xT: 950, yT: 850, zT: 650, zDay: 800, tbl: '1250×850', load: 1000, viseW: 200 },
  fgk: { xT: 3600, yT: 700, zT: 750, zDay: 900, tbl: '4000×750', load: 4000, viseW: 200 },
  yim: { xT: 730, yT: 730, zT: 880, zDay: 1000, tbl: '500×500', load: 500, viseW: 200 },
  tby: { maxD: 920, maxL: 5100, bar: 164, chuck: 16, xT: 485, yT: 220 },
  ulathe: { maxD: 460, maxL: 1500, bar: 52, chuck: 8 },
};

// Kopya tezgâh (`f5a_2` gibi) aslının katalog değerini alır.
export function capDefOf(m: Pick<Tezgah, 'id'>): KapasiteDegerleri {
  return CAP_DEF[m.id] || CAP_DEF[String(m.id).replace(/_\d+$/, '')] || {};
}
