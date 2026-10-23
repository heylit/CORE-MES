import type { RozetTonu } from '../../../ortak/arayuz/Rozet.tsx';
import type { KmTon } from './kurallar.ts';

export const YOK = '—';

// Uygulamanın tarih biçimi: ISO günü (yyyy-aa-gg) gg.aa.yyyy olarak; boşsa çizgi.
export function trd(iso: string | null | undefined): string {
  if (!iso) return YOK;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// İz zamanı (ISO an) gün ve saat:dakika.
export function zamanKisa(an: string | null | undefined): string {
  if (!an) return YOK;
  return `${trd(an.slice(0, 10))} ${an.slice(11, 16)}`;
}

export const sayiMetni = (n: number | null | undefined): string => (n === null || n === undefined ? YOK : Number(n).toLocaleString('tr-TR'));
export const iki = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? YOK : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ondalik = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? YOK : v.toLocaleString('tr-TR', { maximumFractionDigits: 4 });


// Uygulamanın durum damgası (stamp ok/warn/bad/info) ortak rozet tonuna.
export const rozetTonu = (t: KmTon): RozetTonu => (t === 'iyi' ? 'tamam' : t === 'uyari' ? 'uyari' : t === 'kotu' ? 'hata' : t === 'bilgi' ? 'bilgi' : 'pasif');
