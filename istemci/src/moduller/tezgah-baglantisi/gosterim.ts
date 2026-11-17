import type { TezgahDurumu, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const YOK = '—';

// Renk tek başına anlam taşımaz: durum kelimeyle yazılır.
export const DURUM: Record<TezgahDurumu, { metin: string; ton: RozetTonu }> = {
  calisiyor: { metin: 'Çalışıyor', ton: 'tamam' },
  bekliyor: { metin: 'Bekliyor', ton: 'uyari' },
  alarm: { metin: 'Alarm', ton: 'hata' },
  'baglanti-yok': { metin: 'Bağlantı yok', ton: 'pasif' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'pasif' },
};

// SmartES kendi durum adlarını verir; "kapalı" yalnız SmartES'te vardır.
const SMARTES_DURUM: Record<string, string> = { ...Object.fromEntries(Object.entries(DURUM).map(([k, v]) => [k, v.metin])), kapali: 'Kapalı' };
export const smartesDurumMetni = (d: string): string => SMARTES_DURUM[d] ?? d;

export const ALAN_ADI: Record<TezgahKarsilastirmaAlani, string> = {
  durum: 'Durum', program: 'Program', sayac: 'Sayaç', isMiliHizi: 'İş mili', isMiliYuku: 'Yük',
};

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export const sayiMetni = (n: number | null, birim = ''): string => (n === null ? YOK : `${SAYI.format(n)}${birim}`);
export const yukMetni = (n: number | null): string => (n === null ? YOK : `%${SAYI.format(n)}`);
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const saatMetni = (z: string | null): string => (z === null ? YOK : SAAT.format(new Date(z)));
