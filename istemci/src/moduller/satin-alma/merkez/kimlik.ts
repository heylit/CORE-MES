import type { PurchaseRequest } from './tipler.ts';
import { nfx, tsDate } from './util.ts';

// Talebin kimliğinde kalemler kısaca: ilk iki kalem miktar ve birimiyle, kalanı sayıyla. Miktarı olmayan kalemde sayı uydurulmaz.
export function kalemOzeti(r: Pick<PurchaseRequest, 'items'>, en = 2): string {
  const kalemler = r.items ?? [];
  if (kalemler.length === 0) return 'Kalem yok';
  const ilk = kalemler.slice(0, en).map((k) => k.qty === null ? k.name : `${k.name} (${`${nfx.format(k.qty)} ${k.unit}`.trim()})`);
  const kalan = kalemler.length - ilk.length;
  return kalan > 0 ? `${ilk.join(', ')} +${String(kalan)} kalem` : ilk.join(', ');
}

// Talebin geldiği gün (açılış zamanı); bilinmiyorsa boş.
export const gelisGunu = (r: Pick<PurchaseRequest, 'createdAt'>): string => tsDate(r.createdAt || undefined);
