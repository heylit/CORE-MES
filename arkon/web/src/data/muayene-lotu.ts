import { tmiPaketiMi } from './yeni-paket';
/* Muayene (kalite) paketinin numune planı: TMI emrinden gelen pakette lot büyüklüğü emir adedidir.
   564 2 a: kalite istasyonunun TMI paketinde numune sayısı ve kabul sayısı (Ac) Kalite Merkezi'nin AQL planıdır (`tmi.aql`, sunucu damgalar);
   plan yoksa planlamacının girdiği değer kalır. */
export interface MuayenePlani { lot: number; n: number; ac: number; [alan: string]: unknown }
export interface MuayenePaketi { id?: unknown; target?: unknown; tmi?: unknown }

const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
// Paketin Kalite Merkezi lot planı: n ve Ac sayıysa döner; durdurulmuş sıkılıkta `durduruldu`; yoksa null.
export function aqlPlani(p: MuayenePaketi | null | undefined): { n: number; ac: number; re: number | null } | { durduruldu: true } | null {
  const aql = p && typeof p.tmi === 'object' && p.tmi !== null ? (p.tmi as { aql?: unknown }).aql : undefined;
  if (typeof aql !== 'object' || aql === null) return null;
  const a = aql as { durduruldu?: unknown; n?: unknown; ac?: unknown; re?: unknown };
  if (a.durduruldu === true) return { durduruldu: true };
  return sayiMi(a.n) && a.n > 0 && sayiMi(a.ac) ? { n: a.n, ac: a.ac, re: sayiMi(a.re) ? a.re : null } : null;
}

// Yerel paketin `target` alanı numune sayısıdır (kalite düzenleyicisi n ile birlikte yazar), emir adedi değildir: yalnız TMI paketinde lot olur.
export function muayeneNumunePlani<T extends MuayenePlani>(p: MuayenePaketi | null | undefined, st: T): T {
  const adet = p?.target;
  if (!tmiPaketiMi(p) || typeof adet !== 'number' || !Number.isSafeInteger(adet) || adet <= 0) return st;
  const aql = aqlPlani(p);
  if (aql && 'n' in aql) return { ...st, lot: adet, n: Math.min(aql.n, adet), ac: aql.ac };
  return { ...st, lot: adet, n: Math.min(st.n, adet) };
}
