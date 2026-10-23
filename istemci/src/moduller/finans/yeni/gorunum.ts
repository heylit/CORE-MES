import type { Analiz, Bulgu, FinansMotoru, Karne } from './motor.ts';

// Prototipte ENGINE bloğunun dışında kalan, birden çok bölümün kullandığı saf görünüm hesapları (F3 ve F4 ortak kullanır).
// Adlar ve eşikler prototipteki gibidir (recoState, openFindings, grades, fanDatasets); renk ve çizim burada değil, grafiktedir.

export type OneriDurumu = 'acik' | 'ertelendi' | 'yapildi' | 'yoksay' | string;

// Ertelenen öneri, erteleme günü gelince yeniden açıktır.
export function recoState(motor: FinansMotoru, id: string): OneriDurumu {
  const r = motor.durum.reco[id];
  if (!r) return 'acik';
  if (r.st === 'ertelendi' && r.until && r.until <= motor.bugun) return 'acik';
  return r.st;
}

export const openFindings = (motor: FinansMotoru, A: Analiz): Bulgu[] => A.findings.filter((f) => recoState(motor, f.id) === 'acik');

export type Not = 'ok' | 'warn' | 'risk' | 'na';
export const NOT_ADI: Record<Not, string> = { ok: 'İyi', warn: 'Orta', risk: 'Zayıf', na: 'Veri yetersiz' };

// Tahmin karnesinin dört notu (prototip grades).
export function grades(B: Karne): Record<'cash' | 'sales' | 'ar' | 'cust', Not> {
  const c = B.cash, s = B.sales, a = B.ar, u = B.cust;
  const satisHatasi = s ? s.mape[s.best] : null;
  return {
    cash: !c ? 'na' : (c.cov80 >= 0.68 && c.cov80 <= 0.92 && c.errMed < c.errNaive * 0.85) ? 'ok' : (c.cov80 >= 0.5 && c.errMed < c.errNaive * 1.05) ? 'warn' : 'risk',
    sales: !s || satisHatasi === null ? 'na' : satisHatasi < 0.12 ? 'ok' : satisHatasi < 0.25 ? 'warn' : 'risk',
    ar: !a ? 'na' : Math.abs(a.predLossPct - a.actualOpenPct) < 0.04 ? 'ok' : Math.abs(a.predLossPct - a.actualOpenPct) < 0.1 ? 'warn' : 'risk',
    cust: !u || u.rho === null ? 'na' : u.rho >= 0.6 ? 'ok' : u.rho >= 0.3 ? 'warn' : 'risk',
  };
}

export type MonteCarlo = ReturnType<FinansMotoru['monteCarlo']>;

// Nakit yelpazesinin verisi (prototip fanDatasets): bantlar alttan üste, ortanca, eşik ve en düşük hafta.
// Grafik bunları sırayla çizer: p90 ve p10 arası açık, p75 ve p25 arası koyu dolgu; renkler tasarım değişkeninden.
export interface Yelpaze {
  p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[];
  esik: number[];
  dipHafta: number;
}
export function yelpaze(mc: MonteCarlo): Yelpaze {
  const b = mc.bands;
  return {
    p10: b.map((x) => x.p10), p25: b.map((x) => x.p25), p50: b.map((x) => x.p50), p75: b.map((x) => x.p75), p90: b.map((x) => x.p90),
    esik: b.map(() => mc.th),
    dipHafta: mc.dipWeek,
  };
}
