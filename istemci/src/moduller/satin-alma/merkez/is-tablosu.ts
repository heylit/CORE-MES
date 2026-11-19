import { awardOrders, evaluate, orderDue } from './calc.ts';
import { jobs, adimdaGun, type Job } from './roles.ts';
import type { PurchaseRequest, RequestItem } from './tipler.ts';
import { addDays, dayDiff, parseNum, todayStr } from './util.ts';

// 3442-1: satın almanın ilk sayfası tablo. Satır, satın almanın elindeki iş (iş kutusuyla aynı sıra) ve onaydaki karar.
export type IsTuru = 'order' | 'decide' | 'draft' | 'quotes' | 'delivery' | 'approval';
export const IS_ADI: Record<IsTuru, string> = {
  order: 'Sipariş ver', decide: 'Karar ver', draft: 'Teklif iste', quotes: 'Teklif bekleniyor', delivery: 'Teslimat bekleniyor', approval: 'Onayda',
};
const SIRA: IsTuru[] = ['order', 'decide', 'draft', 'quotes', 'delivery', 'approval'];

// Teslimat: siparişte beklenen teslim (sipariş tarihi + termin günü ya da girilen tarih), kararda seçilen teklifin termin günü,
// karar yoksa en iyi teklifin termin günü. Teklif yoksa bilinmez (null); gün uydurulmaz. Tahmini tarih bugünden sayılır.
export interface Teslimat { tarih: string | null; gun: number | null; kaynak: 'siparis' | 'karar' | 'teklif' | null }
export function teslimatOf(r: PurchaseRequest, bugun = todayStr()): Teslimat {
  const siparisler = awardOrders(r).filter((o) => !o.deliveredDate);
  if (r.status === 'ordered' && siparisler.length) {
    const tarihler = siparisler.map((o) => orderDue(o)).filter(Boolean).sort();
    const son = tarihler.at(-1) ?? null;
    return { tarih: son, gun: son ? dayDiff(bugun, son) : null, kaynak: 'siparis' };
  }
  const tahmin = (gun: number | null, kaynak: Teslimat['kaynak']): Teslimat => ({ tarih: gun === null ? null : addDays(bugun, gun), gun, kaynak: gun === null ? null : kaynak });
  if (r.award) {
    const secilen = r.award.mode === 'single' ? (r.quotes ?? []).filter((q) => q.id === r.award?.quoteId) : awardOrders(r).map((o) => o.q);
    const gunler = secilen.map((q) => parseNum(q.leadDays)).filter((g): g is number => g !== null);
    return tahmin(gunler.length ? Math.max(...gunler) : null, 'karar');
  }
  if ((r.quotes ?? []).length) {
    const en = evaluate(r).ranking[0];
    return tahmin(en ? parseNum(en.q.leadDays) : null, 'teklif');
  }
  return { tarih: null, gun: null, kaynak: null };
}

// Teslimat ihtiyaç tarihinden sonraysa kaç gün geç (yoksa null).
export function termineGore(r: PurchaseRequest, t: Teslimat): number | null {
  if (!t.tarih || !r.needDate) return null;
  const d = dayDiff(r.needDate, t.tarih);
  return d > 0 ? d : null;
}

export interface IsSatiri { r: PurchaseRequest; tur: IsTuru; job: Job; gec: boolean; adimdaGun: number | null }
export function isSatirlari(): IsSatiri[] {
  const g = jobs();
  return SIRA.flatMap((tur) => (g[tur] ?? []).map((job) => ({ r: job.r, tur, job, gec: (job.flag ?? '').includes('flag bad') && !job.ret, adimdaGun: adimdaGun(job.r) })))
    .sort((a, b) => Number(b.gec) - Number(a.gec) || SIRA.indexOf(a.tur) - SIRA.indexOf(b.tur) || (a.r.needDate || '9999').localeCompare(b.r.needDate || '9999'));
}

export interface KalemSatiri extends IsSatiri { kalem: RequestItem; sira: number }
export const kalemSatirlari = (satirlar: IsSatiri[]): KalemSatiri[] =>
  satirlar.flatMap((s) => (s.r.items ?? []).map((kalem, sira) => ({ ...s, kalem, sira })));
