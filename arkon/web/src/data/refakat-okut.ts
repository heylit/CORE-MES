/* Refakat kartı okutma (kart #1062). Üretim emrinin tek kartında tek QR vardır: `UE:<emir id>`; elle yazılan emir numarası (UE-004512)
   da kabul edilir. Terminal emrin bu istasyondaki sıradaki bitmemiş işini açar, başlatmaz (kullanıcı kararı 13.10). Emir bağı iş emri
   paketindeki `tmi.emirId` alanıdır; sunucuya ayrıca sorulmaz. Karar yalnız okur, kayıt yazmaz. */
import { tmiPlani } from './tmi-plan';

export type RefakatKodu = { emirId: number } | { emirNo: string };

export function refakatKodu(ham: string): RefakatKodu | null {
  const n = String(ham || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
  const kimlik = /^UE:(\d+)$/.exec(n);
  if (kimlik) return { emirId: Number(kimlik[1]) };
  return /^UE-\d+$/.test(n) ? { emirNo: n } : null;
}

interface RefakatPaketi { machine?: string; no?: string; tmi?: { emirId?: number; opNo?: number; plan?: unknown } | null }
interface RefakatIsi { no?: string; state?: string; pkg?: RefakatPaketi | null }

export type RefakatSonucu = { tur: 'ac'; sira: number } | { tur: 'baska-istasyon'; istasyon: string | null } | { tur: 'yok' };

const noBicimi = (s: unknown): string => String(s ?? '').toLocaleUpperCase('tr-TR').replace(/\s+/g, '');

export function refakatIsi(kod: RefakatKodu, isler: readonly RefakatIsi[], paketler: readonly RefakatPaketi[]): RefakatSonucu {
  const emrin = (p: RefakatPaketi | null | undefined): boolean => !!p && ('emirId' in kod ? p.tmi?.emirId === kod.emirId : noBicimi(p.no) === kod.emirNo);
  const sira = isler.findIndex((x) => emrin(x.pkg) && x.state !== 'done');
  if (sira >= 0) return { tur: 'ac', sira };
  // Ne sırada ne pakette izi olan emir bu cihazda bilinmiyor: "bu istasyonda işi yok" demek yanıltır.
  if (!isler.some((x) => emrin(x.pkg)) && !paketler.some(emrin)) return { tur: 'yok' };
  // Bu istasyonda bitmemiş işi yok: emrin bitmemiş işlerinden en küçük operasyon numaralısının istasyonu söylenir. Sunucu bitmiş iş
  // emrinin paketinde planı boş bırakır (tmi-plan.ts); bu istasyonda bitirilen iş de sayılmaz.
  const bitenler = new Set(isler.filter((x) => x.state === 'done' && x.pkg).map((x) => x.pkg));
  const sonraki = paketler
    .filter((p) => emrin(p) && !bitenler.has(p) && tmiPlani(p as Parameters<typeof tmiPlani>[0]) !== null)
    .sort((a, b) => (a.tmi?.opNo ?? 0) - (b.tmi?.opNo ?? 0))[0];
  return { tur: 'baska-istasyon', istasyon: sonraki?.machine ?? null };
}
