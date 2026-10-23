import type { Personel } from './tipler.ts';

// Veri yoksa sıfır yazılmaz; çizgi gösterilir.
export const YOK = '—';

const paraBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const paraKisaBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;

const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TARIH = /^(\d{4})-(\d{2})-(\d{2})/;

export const para = (v: unknown): string => (sayiMi(v) ? paraBicimi.format(v) : YOK);
export const paraKisa = (v: unknown): string => (sayiMi(v) ? paraKisaBicimi.format(v) : YOK);

// Kayıt tarihleri yerel gündür (YYYY-AA-GG); saat dilimi kaydırmasın diye Date'e çevrilmez.
export function tarih(v: unknown): string {
  const m = typeof v === 'string' ? TARIH.exec(v) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : YOK;
}

export function kisaTarih(v: unknown): string {
  const m = typeof v === 'string' ? TARIH.exec(v) : null;
  if (!m) return YOK;
  return `${Number(m[3])} ${AYLAR[Number(m[2]) - 1]?.slice(0, 3) ?? ''}`;
}

// "2026-07" -> "Temmuz 2026".
export function ayAdi(ay: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ay);
  const ad = m ? AYLAR[Number(m[2]) - 1] : undefined;
  return m && ad ? `${ad} ${m[1]}` : YOK;
}

// Motorun `fullName` kuralı: ad ve soyad boşsa "İsimsiz", kayıt yoksa çizgi.
export function adSoyad(p: Pick<Personel, 'ad' | 'soyad'> | null | undefined): string {
  if (!p) return YOK;
  return `${p.ad ?? ''} ${p.soyad ?? ''}`.trim() || 'İsimsiz';
}

export function basHarfler(p: Pick<Personel, 'ad' | 'soyad'> | null | undefined): string {
  return `${(p?.ad ?? '?').charAt(0)}${(p?.soyad ?? '').charAt(0)}`.toLocaleUpperCase('tr');
}
