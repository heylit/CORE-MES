import type { Tezgah } from '../veri/tipler.ts';

// Prototipin SIĞMA KONTROLÜ bölümünün veri ve saf kısmı: parça ve ham tezgâhın çap, boy, kurs, yük sınırlarına sığıyor mu.
// Tezgâh değerleri Hazırlık → Tezgâh bilgileri'nden (girildiyse), yoksa katalog değerlerinden (CAP_DEF; tipik katalog
// değerleri, varsayım).

export interface KapasiteDegerleri {
  maxD?: number; maxL?: number; bar?: number; subBar?: number; chuck?: number;
  xT?: number; yT?: number; zT?: number; zDay?: number; load?: number; viseW?: number; tbl?: string;
}

export const CAP_DEF: Record<string, KapasiteDegerleri> = {
  tfm: { maxD: 600, maxL: 1500, bar: 100, subBar: 80, chuck: 12, xT: 650, yT: 300, zT: 1500 },
  tcy: { maxD: 350, maxL: 700, bar: 80, chuck: 10, yT: 100 },
  f5a: { xT: 600, yT: 500, zT: 450, zDay: 600, tbl: 'Ø600', load: 300, viseW: 160 },
  ulathe: { maxD: 450, maxL: 1500, bar: 50, chuck: 8 },
};

// Kopya tezgâh (`f5a_2` gibi) aslının katalog değerini alır.
export function capDefOf(m: Pick<Tezgah, 'id'>): KapasiteDegerleri {
  return CAP_DEF[m.id] || CAP_DEF[String(m.id).replace(/_\d+$/, '')] || {};
}
