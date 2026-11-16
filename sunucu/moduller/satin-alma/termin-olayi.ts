import type { Db } from '#cekirdek/db.ts';

// 3256-1: açık siparişin malzeme gelişi (beklenen teslim günü ya da kalan miktarı) ya da elle tedarik termini değişti. Plan bunu canlı
// planın "eskidi" işaretine çevirir; satın alma planı bilmez. Dinleyici komutla aynı işlemde koşar.
// 3349: isEmriIdler, fason hizmet siparişindeki firma tarihi (planın kullandığı dönüş günü) girilen, değişen ya da kalkan iş emirleridir.
export interface TerminOlayi { malzemeNolar: number[]; isEmriIdler: number[] }
export type TerminDinleyicisi = (db: Db, olay: TerminOlayi) => Promise<void>;

const dinleyiciler: TerminDinleyicisi[] = [];

export function terminDinle(d: TerminDinleyicisi): () => void {
  dinleyiciler.push(d);
  return () => { dinleyiciler.splice(dinleyiciler.indexOf(d), 1); };
}

export async function terminBildir(db: Db, olay: TerminOlayi): Promise<void> {
  if (olay.malzemeNolar.length === 0 && olay.isEmriIdler.length === 0) return;
  for (const d of dinleyiciler) await d(db, olay);
}

// Önce ve sonra okunan gelişlerden (talepGelisleriOku) gelişi değişen malzemeler: satır eklendi, çıktı, günü ya da kalan miktarı değişti.
export interface GelisSatiri { malzemeNo: number; tarih: string | null; miktar: string; satirId: number }
export function degisenMalzemeler(once: readonly GelisSatiri[], sonra: readonly GelisSatiri[]): number[] {
  const iz = (l: readonly GelisSatiri[]) => new Map(l.map((x) => [x.satirId, `${String(x.malzemeNo)}|${x.tarih ?? ''}|${String(Number(x.miktar))}`]));
  const a = iz(once), b = iz(sonra);
  const degisen = new Set<number>();
  for (const x of once) if (a.get(x.satirId) !== b.get(x.satirId)) degisen.add(x.malzemeNo);
  for (const x of sonra) if (a.get(x.satirId) !== b.get(x.satirId)) degisen.add(x.malzemeNo);
  return [...degisen].sort((x, y) => x - y);
}

// 3349: önce ve sonra okunan firma tarihlerinden (fasonSiparisTarihiSec, planın kullandığı kural) tarihi değişen iş emirleri: tarih girildi,
// değişti ya da kalktı. Sipariş numarasının değişmesi sayılmaz (plan yalnız tarihi kullanır).
export function degisenFasonIsEmirleri(once: ReadonlyMap<number, { tarih: string }>, sonra: ReadonlyMap<number, { tarih: string }>): number[] {
  const degisen = new Set<number>();
  for (const [id, x] of once) if (sonra.get(id)?.tarih !== x.tarih) degisen.add(id);
  for (const [id, x] of sonra) if (once.get(id)?.tarih !== x.tarih) degisen.add(id);
  return [...degisen].sort((x, y) => x - y);
}
