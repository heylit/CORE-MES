import type { BildirimTuru } from './bildirim.ts';

// E-posta kanalının (ADR 0015, 3397) zod'suz sabitleri: istemci de değer olarak ithal eder (canlı ön izleme, seçenekler).

// Şablon konusu olayın kaynak modülünden gelir; gecikme ve hatırlatma konu değil süzgeçtir (olayın sınıfı ve adı).
export const EPOSTA_KONULARI = ['satin-alma', 'proje', 'satis', 'planlama', 'uretim', 'genel'] as const;
export type EpostaKonusu = (typeof EPOSTA_KONULARI)[number];
export const EPOSTA_KONU_ADLARI: Record<EpostaKonusu, string> = {
  'satin-alma': 'Satın alma', proje: 'Proje', satis: 'Satış', planlama: 'Planlama', uretim: 'Üretim devir alma', genel: 'Genel',
};
const KONU_MODULLERI: Record<string, EpostaKonusu> = {
  'satin-alma': 'satin-alma', malzemeler: 'satin-alma', projeler: 'proje', 'uretim-emirleri': 'proje', siparisler: 'satis',
  arkon: 'planlama', plan: 'planlama', stok: 'uretim', istasyonlar: 'uretim', 'cnc-kurulum': 'uretim',
};
export const turKonusu = (tur: BildirimTuru | string): EpostaKonusu => KONU_MODULLERI[tur.slice(0, tur.indexOf('.'))] ?? 'genel';

// E-postanın ikonu bu listedendir; her biri sunucuda gömülü küçük resimdir (dış adres yok).
export const EPOSTA_SIMGELERI = ['cart', 'clipboard-check', 'tag', 'calendar', 'route', 'clock', 'bell', 'alert'] as const;
export type EpostaSimgesi = (typeof EPOSTA_SIMGELERI)[number];

// Gövdeye yalnız bu alanlar girer (ADR 0015 md 6, 3397): müşteri ve tedarikçi adı, fiyat, parça no ve serbest metin yer tutucusu yoktur.
export const EPOSTA_YER_TUTUCULARI = ['alici_adi', 'olay', 'kayit_no', 'tarih', 'gecikme_gunu', 'istasyon', 'kayit_baglantisi'] as const;
export type EpostaYerTutucusu = (typeof EPOSTA_YER_TUTUCULARI)[number];
// Kalıpta yalnız izinli yer tutucu geçer; bilinmeyen {ad} kaydı reddeder (müşteri adı gibi alan sonradan sızmasın).
export function bilinmeyenYerTutucular(metin: string): string[] {
  const izinli = new Set<string>(EPOSTA_YER_TUTUCULARI);
  return [...new Set([...metin.matchAll(/\{([^{}\s]*)\}/g)].map((e) => e[1] ?? '').filter((ad) => !izinli.has(ad)))];
}
export type EpostaDegerleri = Record<EpostaYerTutucusu, string | null>;
// Boş değer boş metin olur; yer tutucunun kendisi e-postada kalmaz.
export const sablonDoldur = (kalip: string, d: EpostaDegerleri): string =>
  kalip.replace(/\{([a-z_]+)\}/g, (butun, ad: string) => ((EPOSTA_YER_TUTUCULARI as readonly string[]).includes(ad) ? d[ad as EpostaYerTutucusu] ?? '' : butun));
// Bilgi tablosunun satırları; boş değerli satır e-postaya yazılmaz.
export const EPOSTA_TABLO_ALANLARI = ['kayit_no', 'olay', 'tarih', 'gecikme_gunu', 'istasyon'] as const;
export type EpostaTabloAlani = (typeof EPOSTA_TABLO_ALANLARI)[number];
export const EPOSTA_TABLO_ADLARI: Record<EpostaTabloAlani, string> = {
  kayit_no: 'Kayıt no', olay: 'Olay', tarih: 'Tarih', gecikme_gunu: 'Gecikme günü', istasyon: 'İstasyon',
};
export const EPOSTA_KONU_EN_UZUN = 150;
export const EPOSTA_GOVDE_EN_UZUN = 2000;

// Posta sunucusu kipi (3397-4 a): kurum içi sunucu ve yerel aktarıcı kurum içi adresi, dış servis tek tanımlı dış adresi kullanır.
export const EPOSTA_KIPLERI = ['kurum-ici', 'yerel-aktarici', 'dis-servis'] as const;
export type EpostaKipi = (typeof EPOSTA_KIPLERI)[number];
export const EPOSTA_KIP_ADLARI: Readonly<Record<EpostaKipi, string>> = {
  'kurum-ici': 'Kurum içi posta sunucusu',
  'yerel-aktarici': 'Yerel aktarıcı (dış servise BT aktarır)',
  'dis-servis': 'Dış posta servisi',
};

export const EPOSTA_ZAMANLARI = ['hemen', 'ozet'] as const;
export type EpostaZamani = (typeof EPOSTA_ZAMANLARI)[number];
export const EPOSTA_TEKRAR_EN_COK = 10;
export const EPOSTA_GUN_EN_COK = 60;
export const EPOSTA_YUKSELT_ROL_EN_COK = 20;
export const EPOSTA_YUKSELT_KISI_EN_COK = 50;

export const EPOSTA_SONUCLARI = ['gonderildi', 'gonderilemedi', 'atlandi'] as const;
export type EpostaSonucu = (typeof EPOSTA_SONUCLARI)[number];
