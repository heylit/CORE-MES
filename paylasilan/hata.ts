// Sunucunun her hata cevabı bu biçimdedir; istemci tek yerde yorumlar.
export const HATA_KODLARI = [
  'DOGRULAMA',
  'OTURUM_YOK',
  'YETKI_YOK',
  'BULUNAMADI',
  'CAKISMA',
  'BAGIMLI_KAYIT',
  'GECERSIZ',
  'ONAY_GEREKLI',
  'COK_BUYUK',
  'COK_ISTEK',
  'MESGUL',
  'VERITABANI_YOK',
  'SUNUCU',
] as const;

export type HataKodu = (typeof HATA_KODLARI)[number];

export interface HataGovdesi {
  kod: HataKodu;
  mesaj: string;
  alan?: string;
  ayrinti?: unknown;
}

export const HATA_DURUMU: Record<HataKodu, number> = {
  DOGRULAMA: 400,
  OTURUM_YOK: 401,
  YETKI_YOK: 403,
  BULUNAMADI: 404,
  CAKISMA: 409,
  BAGIMLI_KAYIT: 409,
  GECERSIZ: 422,
  ONAY_GEREKLI: 409,
  COK_BUYUK: 413,
  COK_ISTEK: 429,
  MESGUL: 503,
  VERITABANI_YOK: 503,
  SUNUCU: 500,
};

// Kişinin veri kapsamı dışındaki kayda yazma 403'ü: ileti tektir, modül kendi metnini yazmaz.
export const KAPSAM_DISI_ILETISI = 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.';

// Eski sürümle yazma 409'u öteki çakışmalardan `ayrinti.neden` ile ayrılır: istemci bunda formu değil kaydı yeniler.
export const ESKI_SURUM_NEDENI = 'eski-surum';
export const ESKI_SURUM_ILETISI = 'Bu kayıt siz açtıktan sonra değiştirildi. Sayfayı yenileyip değişikliğinizi yeniden yapın.';

export interface EskiSurumAyrintisi {
  neden: typeof ESKI_SURUM_NEDENI;
}

export function eskiSurumMu(govde: HataGovdesi): boolean {
  const ayrinti = govde.ayrinti as { neden?: unknown } | null | undefined;
  return govde.kod === 'CAKISMA' && typeof ayrinti === 'object' && ayrinti?.neden === ESKI_SURUM_NEDENI;
}
