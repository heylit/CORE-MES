import { fmt, fmtD, fmtDY, nf } from './motor.ts';

// Yeni ekranların para ve tarih biçimi. Motorun biçimleri (prototipteki) aynen kullanılır: ekrandaki sayı prototipteki
// yazımla aynı kalır (FNS-34, 36, 52, 57, 58 gösterim kuralları).
export { fmt as tl, fmtD as kisaTarih, fmtDY as tarih, nf as sayiMetni };

// Para birimli tutar: TRY kuruşsuz ₺, öteki birim iki ondalık ve kodla.
export const paraMetni = (v: unknown, pb: string): string => (pb === 'TRY' ? fmt(Number(v) || 0) : `${nf(Number(v) || 0, 2)} ${pb}`);

// Kayıt yoksa tire: sıfır uydurulmaz.
export const YOK = '—';
export const varsaTl = (v: number | null | undefined): string => (v === null || v === undefined ? YOK : fmt(v));
