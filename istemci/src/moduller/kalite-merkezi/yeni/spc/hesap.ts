import type { Seri } from '../spc.ts';

export interface Kutu { a: number; b: number; adet: number; disarida: boolean }

// Dağılım grafiğinin kutuları: aralık tolerans sınırlarını da kapsar, kutu sayısı ölçüm sayısının kareköküyle (6-16).
export function dagilim(s: Pick<Seri, 'noktalar' | 'lo' | 'hi'>): Kutu[] {
  const x = s.noktalar.map((p) => p.v);
  if (!x.length) return [];
  const lo = Math.min(s.lo, ...x);
  const hi = Math.max(s.hi, ...x);
  const k = Math.max(6, Math.min(16, Math.round(Math.sqrt(x.length)) + 3));
  const w = (hi - lo) / k || 1;
  const kutular = Array.from({ length: k }, (_, i) => ({ a: lo + i * w, b: lo + (i + 1) * w, adet: 0, disarida: false }));
  x.forEach((v) => { const i = Math.min(k - 1, Math.max(0, Math.floor((v - lo) / w))); kutular[i]!.adet++; });
  kutular.forEach((b) => { b.disarida = b.b <= s.lo + 1e-12 || b.a >= s.hi - 1e-12; });
  return kutular;
}

// İkinci menü sayacı: en az 10 ölçümlü olup yetenekli olmayan seriler; kontrol dışı ya da yetersiz varsa kötü.
export function spcSayaci(liste: readonly Seri[]): { n: number; kotu: boolean } | null {
  const a = liste.filter((x) => x.n >= 10 && x.durum.ton !== 'iyi');
  return a.length ? { n: a.length, kotu: a.some((x) => x.durum.ton === 'kotu') } : null;
}

