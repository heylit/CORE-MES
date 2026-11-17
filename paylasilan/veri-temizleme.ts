// Deneme verisi temizleme sabitleri (3395 a); zod taşımaz, istemci de değer olarak ithal eder.
export const TEMIZLIK_TURLERI = ['uretim_emri', 'siparis', 'malzeme'] as const;
export type TemizlikTuru = (typeof TEMIZLIK_TURLERI)[number];
export const TEMIZLIK_ONAY_METNI = 'TEMIZLE';
// Bir istekte en çok bu kadar kök: etki tek transaction'da hesaplanır, denetim eki de bu sınıra göre paketlenir.
export const TEMIZLIK_EN_COK_KOK = 500;
// Temizlik bu süreden eski yedekle başlamaz.
export const TEMIZLIK_YEDEK_EN_ESKI_DK = 30;
