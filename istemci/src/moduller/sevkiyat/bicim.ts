// Ekran metinleri ve sayı/saat biçimi. İş kuralı yoktur; hesaplar sunucudan gelir.
import type { Amac, AracTuru, GunTipi, IsTuru, NoktaTuru } from '#paylasilan/sozlesme/sevkiyat.ts';

export const GUN_TIPI_ADI: Record<GunTipi, string> = { 'hafta-ici': 'Hafta içi', cuma: 'Cuma', cumartesi: 'Cumartesi', pazar: 'Pazar' };
export const AMAC_ADI: Record<Amac, string> = { sure: 'En hızlı', mesafe: 'En kısa yol', maliyet: 'En ucuz' };
export const AMAC_ACIKLAMASI: Record<Amac, string> = {
  sure: 'En az toplam süre',
  mesafe: 'En az kilometre',
  maliyet: 'TL/km, sürücü TL/saat ve günlük araç giderinin toplamı en az',
};
export const AMAC_KISA: Record<Amac, string> = { sure: 'En az süre', mesafe: 'En az km', maliyet: 'En az gider' };
export const ARAC_TURU_ADI: Record<AracTuru, string> = { binek: 'Binek', kamyonet: 'Kamyonet', kamyon: 'Kamyon' };
export const IS_TURU_ADI: Record<IsTuru, string> = { teslimat: 'Bırakılacak', alim: 'Alınacak', aktarma: 'Al → Bırak' };
export const IS_TURU_ACIKLAMASI: Record<IsTuru, string> = {
  teslimat: 'Fabrikadan yüklenir, noktaya bırakılır.',
  alim: 'Noktadan alınır, fabrikaya getirilir.',
  aktarma: 'Bir noktadan alınıp fabrikaya uğramadan başka noktaya bırakılır; aynı seferde önce alış.',
};
export const NOKTA_TURU_ADI: Record<NoktaTuru, string> = {
  fabrika: 'Fabrika', musteri: 'Müşteri', tedarikci: 'Tedarikçi', fason: 'Fason', kargo: 'Kargo', diger: 'Diğer',
};
export const AMACLAR: readonly Amac[] = ['sure', 'mesafe', 'maliyet'];
export const ARAC_TURLERI: readonly AracTuru[] = ['binek', 'kamyonet', 'kamyon'];
export const IS_TURLERI: readonly IsTuru[] = ['teslimat', 'alim', 'aktarma'];
export const NOKTA_TURLERI: readonly NoktaTuru[] = ['fabrika', 'musteri', 'tedarikci', 'fason', 'kargo', 'diger'];

// Gün içi dakika -> "SS:DD".
export function saatMetni(dakika: number): string {
  const yuvarlak = Math.round(dakika), gunIci = ((yuvarlak % 1440) + 1440) % 1440;
  return `${String(Math.floor(gunIci / 60)).padStart(2, '0')}:${String(gunIci % 60).padStart(2, '0')}`;
}
export function sureMetni(dakika: number): string {
  const toplam = Math.round(dakika), saat = Math.floor(toplam / 60), kalan = toplam % 60;
  return saat ? (kalan ? `${saat} sa ${kalan} dk` : `${saat} sa`) : `${kalan} dk`;
}
const ONDALIK = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const PARA = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
export const kilometreMetni = (kilometre: number) => `${ONDALIK.format(kilometre)} km`;
export const paraMetni = (tutar: number) => PARA.format(tutar);
export const sayiMetni = (deger: number | string) => ONDALIK.format(Number(deger));
export const isaretli = (fark: number, bicim: (deger: number) => string) => `${fark >= 0 ? '+' : '−'}${bicim(Math.abs(fark))}`;

// Yerel saatle bugünün tarihi (YYYY-AA-GG).
export function bugun(simdi = new Date()): string {
  return `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}`;
}
export const tarihMetni = (tarih: string) => tarih.split('-').reverse().join('.');
// Tarihi gün gün kaydırır (yerel takvimle; ay ve yıl geçişi Date'e bırakılır).
export function gunKaydir(tarih: string, gun: number): string {
  const [yil, ay, gunu] = tarih.split('-').map(Number);
  return bugun(new Date(yil ?? 1970, (ay ?? 1) - 1, (gunu ?? 1) + gun));
}
// Ekranda seçili güne göre gün adı: "bugün", "yarın", "dün" ya da "GG.AA.YYYY günü"; cümle içinde küçük harfle kullanılır.
export function gunAdi(tarih: string, simdi = new Date()): string {
  const b = bugun(simdi);
  if (tarih === b) return 'bugün';
  if (tarih === gunKaydir(b, 1)) return 'yarın';
  if (tarih === gunKaydir(b, -1)) return 'dün';
  return `${tarihMetni(tarih)} günü`;
}
