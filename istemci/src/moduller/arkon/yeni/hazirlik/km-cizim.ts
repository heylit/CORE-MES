import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { cizimBalonu } from '../../../kalite-merkezi/disari.ts';
import type { Pkg, PlanItem } from './tipler.ts';

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
