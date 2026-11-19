import type { AksiyonDurumu, ToplantiDurumu } from '#paylasilan/sozlesme/toplantilar.ts';
import { tesisGunBasi, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const DURUM_TONU: Readonly<Record<ToplantiDurumu, RozetTonu>> = { planlandi: 'bilgi', yapildi: 'tamam', iptal: 'pasif' };
export const AKSIYON_TONU: Readonly<Record<AksiyonDurumu, RozetTonu>> = { acik: 'uyari', bitti: 'tamam', iptal: 'pasif' };

const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// Tesis saatiyle parçalar: tarih 'YYYY-MM-DD', saat 'HH:MM'.
export const tarihi = (an: string): string => tesisSaati(Date.parse(an)).slice(0, 10);
export const saati = (an: string): string => tesisSaati(Date.parse(an)).slice(11, 16);
export const gunMetni = (tarih: string): string => `${tarih.slice(8, 10)}.${tarih.slice(5, 7)}.${tarih.slice(0, 4)}`;

// "21.11.2026 Cuma 09:30-10:15" (tesis saati).
export function zamanMetni(baslangic: string, bitis: string): string {
  const gun = tarihi(baslangic);
  return `${gunMetni(gun)} ${GUNLER[new Date(`${gun}T12:00:00Z`).getUTCDay()] ?? ''} ${saati(baslangic)}-${saati(bitis)}`;
}

// Formdaki tesis günü ve saati ISO zamana çevrilir (sunucu saat dilimli zaman ister).
export function anOlustur(tarih: string, saat: string): string {
  const [s, d] = saat.split(':').map(Number);
  return new Date(tesisGunBasi(tarih) + ((s ?? 0) * 60 + (d ?? 0)) * 60_000).toISOString();
}

// Bağlı kaydın kendi ekranı; görmeye yetkisi olmayan kişiyi o ekran durdurur.
export function konuYolu(tur: 'proje' | 'uretim-emri' | 'firma', id: number): string {
  if (tur === 'proje') return `/projeler/${String(id)}`;
  if (tur === 'uretim-emri') return `/uretim-emirleri/${String(id)}`;
  return `/musteri-tedarikci?firma=${String(id)}`;
}
