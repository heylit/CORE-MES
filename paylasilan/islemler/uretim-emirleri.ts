// Okuma uçları oturumla açılır; yaz emir açar ve iptal eder; fason dış atölyeye gidişi, dönüşü ve tamamlamayı kaydeder.
// ara-istasyon: emir listesini göremeyen (operatör) üst çubuk aramasında yalnız bugün atandığı istasyonun açık emirlerini bulur.
// hazirlik-muaf: eksik hazırlık maddesini gerekçeyle geçmek (264 a, yalnız müdür); kalibrasyon ve çizimde muafiyet yoktur.
export const URETIM_EMIRLERI_ISLEMLERI = ['uretim-emirleri.yaz', 'uretim-emirleri.fason', 'uretim-emirleri.ara-istasyon', 'uretim-emirleri.hazirlik-muaf'] as const;
