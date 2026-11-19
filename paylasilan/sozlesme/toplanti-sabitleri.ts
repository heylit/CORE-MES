// Toplantılar (3448) sabitleri: zod taşımaz, istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
export const TOPLANTI_TURLERI = ['uretim', 'musteri', 'proje', 'kalite', 'diger'] as const;
export type ToplantiTuru = (typeof TOPLANTI_TURLERI)[number];
export const TOPLANTI_TUR_ADLARI: Readonly<Record<ToplantiTuru, string>> = {
  uretim: 'Üretim', musteri: 'Müşteri', proje: 'Proje', kalite: 'Kalite', diger: 'Diğer',
};
export const TOPLANTI_DURUMLARI = ['planlandi', 'yapildi', 'iptal'] as const;
export type ToplantiDurumu = (typeof TOPLANTI_DURUMLARI)[number];
export const TOPLANTI_DURUM_ADLARI: Readonly<Record<ToplantiDurumu, string>> = { planlandi: 'Planlandı', yapildi: 'Yapıldı', iptal: 'İptal' };
// Konu bağı en çok birdir; serbest konuda bağ yoktur, konu başlıktır.
export const KONU_TURLERI = ['proje', 'uretim-emri', 'firma', 'serbest'] as const;
export type KonuTuru = (typeof KONU_TURLERI)[number];
export const KONU_TUR_ADLARI: Readonly<Record<KonuTuru, string>> = { proje: 'Proje', 'uretim-emri': 'Üretim emri', firma: 'Firma', serbest: 'Serbest konu' };
export const AKSIYON_DURUMLARI = ['acik', 'bitti', 'iptal'] as const;
export type AksiyonDurumu = (typeof AKSIYON_DURUMLARI)[number];
export const AKSIYON_DURUM_ADLARI: Readonly<Record<AksiyonDurumu, string>> = { acik: 'Açık', bitti: 'Bitti', iptal: 'İptal' };
export const TOPLANTI_KAPSAMLARI = ['yaklasan', 'gecmis'] as const;
export type ToplantiKapsami = (typeof TOPLANTI_KAPSAMLARI)[number];

export const KATILIMCI_EN_COK = 60;
export const GUNDEM_EN_COK = 30;
