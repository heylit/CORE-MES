import type { AlanGovdesi, BirimDurumu, BirimOlayi, DurumKomutu, KodTuru, SayacKapsami, Yontem } from '#paylasilan/sozlesme/markalama.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

export const YONTEM_ADLARI: Readonly<Record<Yontem, string>> = {
  lazer: 'Lazer', nokta_vurus: 'Nokta vuruş', murekkep: 'Mürekkep / boya', elektrokimyasal: 'Elektrokimyasal', etiket: 'Etiket',
};
export const KOD_TURU_ADLARI: Readonly<Record<KodTuru, string>> = { yok: 'Yalnız yazı', qr: 'QR', datamatrix: 'DataMatrix' };
export const KAPSAM_ADLARI: Readonly<Record<SayacKapsami, string>> = {
  malzeme: 'Malzeme boyunca', emir: 'Her emirde baştan', yil: 'Her yıl baştan',
};
export const DURUM_ADLARI: Readonly<Record<BirimDurumu, string>> = { saglam: 'Sağlam', red: 'Red', rework: 'Rework', hurda: 'Hurda' };
export const DURUM_TONLARI: Readonly<Record<BirimDurumu, RozetTonu>> = { saglam: 'tamam', red: 'uyari', rework: 'bilgi', hurda: 'hata' };
export const OLAY_ADLARI: Readonly<Record<BirimOlayi, string>> = {
  markalandi: 'Markalandı', hatali_markalama: 'Hatalı markalama', dogrulandi: 'Doğrulandı', red: 'Red', rework: 'Rework\'e gönderildi',
  kabul: 'Kabul edildi', hurda: 'Hurdaya ayrıldı',
};
export const KOMUT_ADLARI: Readonly<Record<DurumKomutu, string>> = { red: 'Red', rework: 'Rework', kabul: 'Kabul', hurda: 'Hurda' };
export const KOMUT_SIMGELERI: Readonly<Record<DurumKomutu, SimgeAdi>> = { red: 'alert', rework: 'wrench', kabul: 'check', hurda: 'x' };

// Düğmeleri göstermek içindir; geçişin kararı sunucudadır (MRK-04).
export const GECERLI_KOMUTLAR: Readonly<Record<BirimDurumu, readonly DurumKomutu[]>> = {
  saglam: ['red', 'hurda'], red: ['rework', 'kabul', 'hurda'], rework: ['red', 'kabul', 'hurda'], hurda: [],
};

export const SABLON_ACIKLAMALARI: Readonly<Record<string, string>> = {
  '{PARCA}': 'Stok kodu', '{EMIR}': 'Emir no', '{YY}': 'Yıl (2 hane)', '{YYYY}': 'Yıl', '{WW}': 'Hafta', '{MM}': 'Ay', '{DD}': 'Gün', '{SEQ:5}': 'Sıra (5 hane)',
};

// Sözleşmedeki listeler zod taşıdığı için istemciye değer olarak girmez; adları tutan kayıtlar her değeri içerir (tip denetler).
const anahtarlari = <T extends string>(k: Readonly<Record<T, string>>): readonly T[] => Object.keys(k) as T[];
export const YONTEMLER = anahtarlari(YONTEM_ADLARI);
export const KOD_TURLERI = anahtarlari(KOD_TURU_ADLARI);
export const SAYAC_KAPSAMLARI = anahtarlari(KAPSAM_ADLARI);
export const BIRIM_DURUMLARI = anahtarlari(DURUM_ADLARI);
export const ICERIK_ADLARI: Readonly<Record<AlanGovdesi['icerik'], string>> = { seri: 'Seri no (birime özel)', sabit: 'Sabit metin' };
export const ICERIKLER = anahtarlari(ICERIK_ADLARI);
export const SABLON_PARCALARI = Object.keys(SABLON_ACIKLAMALARI);
// Sözleşmedeki AZAMI_ALAN ile aynı; sunucu ayrıca reddeder.
export const AZAMI_ALAN = 20;
