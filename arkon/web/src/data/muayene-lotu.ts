import { tmiPaketiMi } from './yeni-paket';
/* Muayene (kalite) paketinin numune planı: TMI emrinden gelen pakette lot büyüklüğü emir adedidir.
   Numune sayısı ve kabul sayısı (Ac) planlamacının girdiği değerdir; yeni örnekleme tablosu yok. */
export interface MuayenePlani { lot: number; n: number; ac: number; [alan: string]: unknown }
export interface MuayenePaketi { id?: unknown; target?: unknown }

// Yerel paketin `target` alanı numune sayısıdır (kalite düzenleyicisi n ile birlikte yazar), emir adedi değildir: yalnız TMI paketinde lot olur.
export function muayeneNumunePlani<T extends MuayenePlani>(p: MuayenePaketi | null | undefined, st: T): T {
  const adet = p?.target;
  if (!tmiPaketiMi(p) || typeof adet !== 'number' || !Number.isSafeInteger(adet) || adet <= 0) return st;
  return { ...st, lot: adet, n: Math.min(st.n, adet) };
}
