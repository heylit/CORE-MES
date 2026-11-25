import type { KmNumunePlani, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { cizimBalonu } from '../../../kalite-merkezi/disari.ts';
import type { NumuneKurali, NumuneZamani, Olcen, Pkg, PlanItem } from './tipler.ts';

// Teknik resim ve balonların sahibi Kalite Merkezi'dir (789): TMI emrinden gelen pakette Hazırlık balon tanımını yazmaz, Kalite Merkezi'nden
// alır. Plan maddesi Kalite Merkezi balonunun kimliğini taşır (795 a); operatör ölçüsü sunucuda o kimlikle Kalite Merkezi'ne yazılır.

// Paketin hangi Kalite Merkezi resminden ve hangi sürümünden kurulduğu; sürüm artınca "değişti" görünür.
export interface KmBagi { id: number; surum: number }

export function kmBagi(p: Readonly<Record<string, unknown>>): KmBagi | null {
  const b = p['kmResim'];
  if (b === null || typeof b !== 'object') return null;
  const { id, surum } = b as Record<string, unknown>;
  return typeof id === 'number' && typeof surum === 'number' ? { id, surum } : null;
}

// Balon tanımı yalnız Kalite Merkezi'ndedir; malzemesi olmayan eski paket kendi planını düzenlemeyi sürdürür.
export const kmSahibi = (p: Pick<Pkg, 'malzemeNo'>): boolean => typeof p.malzemeNo === 'number';

export function kmPlani(r: Pick<KmResim, 'balonlar'>): PlanItem[] {
  // Ortak parçanın yazı kutusu (ar) dizi, modelin tipi sayı der; Hazırlık balonları aynı biçimde saklar (balonlarYaz).
  return r.balonlar.map((b) => ({ freq: 'İlk parça', crit: false, ...cizimBalonu(b), kmBalon: b.id }) as PlanItem);
}

export type KmResimDurumu = 'pakette' | 'degisti' | 'yok';
export function kmResimDurumu(p: Readonly<Record<string, unknown>>, r: Pick<KmResim, 'id' | 'surum'>): KmResimDurumu {
  const b = kmBagi(p);
  if (!b || b.id !== r.id) return 'yok';
  return b.surum === r.surum ? 'pakette' : 'degisti';
}

export const etkinResimler = (l: readonly KmResim[]): KmResim[] => l.filter((r) => r.aktif);

// Taslak paket Kalite Merkezi'nin balonlu resmiyle kendiliğinden kurulur (3687): balon tanımı zaten salt okunurdur, "Pakete al" bekleyen taslak
// boş ve düzenlenemez bir plan gösterirdi. Yayındaki paket elle güncellenir ("değişti" görünür), bağı olan taslak yeniden kurulmaz.
export function otomatikKmResmi(p: Readonly<Pick<Pkg, 'malzemeNo' | 'status'>> & Readonly<Record<string, unknown>>, resimler: readonly KmResim[]): KmResim | null {
  // Elle girilmiş plan kalemi varsa kendiliğinden değiştirilmez (kalem kaybolmasın); kişi "Pakete al" ile bilerek alır.
  if (!kmSahibi(p) || p.status !== 'draft' || kmBagi(p) !== null || (Array.isArray(p['plan']) && p['plan'].length > 0)) return null;
  return etkinResimler(resimler).find((r) => r.eski !== true && r.tur === 'resim' && r.balonlar.length > 0) ?? null;
}

// 3689: numune planının sahibi Kalite Merkezi'dir (parça x operasyon). Pakete çevrilmiş kuralı `samp`'ta, hangi sürümden geldiğini `kmNumune`'de
// taşır; terminal ve ilk parça kapısı `samp`'ı okumaya devam eder. Balon numarası plan maddesi kimliğidir (kmPlani).
// Sunucu paket yazarken aynı çeviriyi denetler (sunucu/moduller/arkon/km-numune-ceviri.ts); iki yerin testi aynı beklentiyi taşır.
const ZAMAN: Readonly<Record<'ilk' | 'her' | 'sure' | 'vardiya' | 'son', NumuneZamani>> = { ilk: 'first', her: 'every', sure: 'time', vardiya: 'shift', son: 'last' };
export function kmNumuneKurallari(plan: Pick<KmNumunePlani, 'kurallar'>): NumuneKurali[] {
  return plan.kurallar.map((k) => ({
    id: k.kimlik,
    when: ZAMAN[k.ne],
    ...(k.n === undefined ? {} : { n: k.n }),
    who: k.kim.map((w): Olcen => (w === 'kalite' ? 'q' : 'op')),
    items: k.balonlar === 'hepsi' ? 'all' : k.balonlar === 'kritik' ? 'crit' : [...k.balonlar],
    ...(k.kapi === undefined ? {} : { gate: k.kapi }),
  }));
}

export interface KmNumuneBagi { surum: number }
export function kmNumuneBagi(p: Readonly<Record<string, unknown>>): KmNumuneBagi | null {
  const b = p['kmNumune'];
  if (b === null || typeof b !== 'object') return null;
  const { surum } = b as Record<string, unknown>;
  return typeof surum === 'number' ? { surum } : null;
}
// Paket tek operasyona bağlıdır (tmi.opNo); Kalite Merkezi planı operasyon numarasıyla bulunur.
export function kmNumunePlani(p: Readonly<Record<string, unknown>>, planlar: readonly KmNumunePlani[]): KmNumunePlani | null {
  const t = p['tmi'];
  const opNo = t !== null && typeof t === 'object' ? (t as { opNo?: unknown }).opNo : undefined;
  return typeof opNo === 'number' ? planlar.find((x) => x.opNo === opNo) ?? null : null;
}
// yok: Kalite Merkezi'nde bu operasyonun planı tanımlı değil; pakette: pakettekiyle aynı sürüm; degisti: Kalite Merkezi'nde daha yeni sürüm var;
// bagsiz: plan var ama pakete alınmamış.
export type KmNumuneDurumu = 'yok' | 'pakette' | 'degisti' | 'bagsiz';
export function kmNumuneDurumu(p: Readonly<Record<string, unknown>>, plan: Pick<KmNumunePlani, 'surum'> | null): KmNumuneDurumu {
  if (plan === null) return 'yok';
  const b = kmNumuneBagi(p);
  return b === null ? 'bagsiz' : b.surum === plan.surum ? 'pakette' : 'degisti';
}
// Taslakta, bağı ve elle yazılmış kuralı olmayan pakete kendiliğinden gelir (3687 ile aynı ilke); yayındaki paket "Güncelle" ile elle alır.
export function otomatikKmNumunesi(p: Readonly<Pick<Pkg, 'malzemeNo' | 'status' | 'samp'>> & Readonly<Record<string, unknown>>, planlar: readonly KmNumunePlani[]): KmNumunePlani | null {
  if (!kmSahibi(p) || p.status !== 'draft' || kmNumuneBagi(p) !== null || (Array.isArray(p.samp) && p.samp.length > 0)) return null;
  const plan = kmNumunePlani(p, planlar);
  return plan !== null && plan.kurallar.length > 0 ? plan : null;
}
