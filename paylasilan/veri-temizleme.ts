// Deneme verisi temizleme sabitleri (3395 a); zod taşımaz, istemci de değer olarak ithal eder.
export const TEMIZLIK_TURLERI = ['uretim_emri', 'siparis', 'malzeme'] as const;
export type TemizlikTuru = (typeof TEMIZLIK_TURLERI)[number];
export const TEMIZLIK_ONAY_METNI = 'TEMIZLE';
// Bir istekte en çok bu kadar kök: etki tek transaction'da hesaplanır, denetim eki de bu sınıra göre paketlenir.
export const TEMIZLIK_EN_COK_KOK = 500;
// Tek tarihle toplu sıfırlamada bir seferde en çok kök (3395 ek). Ölçüm: kök başına ~8 ms etki, temizlik etkiyi yeniden kurar;
// 2000 kök bağlı kayıtlarıyla 300 s işlem sınırının içinde kalsın.
export const TEMIZLIK_TARIHLE_EN_COK_KOK = 2000;
// Temizlik bu süreden eski yedekle başlamaz.
export const TEMIZLIK_YEDEK_EN_ESKI_DK = 30;
