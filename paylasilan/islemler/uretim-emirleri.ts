// Okuma uçları oturumla açılır; yaz emir açar ve iptal eder; fason dış atölyeye gidişi, dönüşü ve tamamlamayı kaydeder.
// ara-istasyon: emir listesini göremeyen (operatör) üst çubuk aramasında yalnız bugün atandığı istasyonun açık emirlerini bulur.
// hazirlik-muaf: eksik hazırlık maddesini gerekçeyle geçmek (264 a, yalnız müdür); kalibrasyon ve çizimde muafiyet yoktur.
// sayim-duzelt: başkasının sayımını düzeltmek (185 a, yalnız yönetici ve vardiya sorumlusu); `arkon.amir` müdürde de olduğu için ayrıdır.
// kapanis-oku: Kapanış onayları sayfası; kapanis-kalite: kalite onayı ve reti; kapanis-onay: müdür onayı, reti, madde muafiyeti ve tamamlanan
// emri geri açma (1078 teyit).
export const URETIM_EMIRLERI_ISLEMLERI = [
  'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'uretim-emirleri.ara-istasyon', 'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.sayim-duzelt',
  'uretim-emirleri.kapanis-oku', 'uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-onay',
] as const;
