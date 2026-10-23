// Okuma (kurulum kayıtlarını görme) ve yazma (prototipin bütün kayıtları: tezgâh, takım, stok, ömür, hazırlık). Okuma ucu sayfa
// işlemiyle de açılır; sayfası olup yazma işlemi olmayan kişide değişiklikler yalnız açık sekmede kalır. Hazırlık onayı yalnız
// hazırlık adımlarının onayını yazar; tezgâh, takım ve stok kayıtlarını düzenlemez (kullanıcı kararı 16.10.2026).
// Takım değişimi ve kullanım düzeltmesi ayrı işlemdir; taşıyan ömür uyarısını da alır. Takım tanımlama yaz işleminde kalır (300 a).
// Stok kartına bağlı takımın kullanımı stoktan düşer (153 a, 164 b): ayrı işlemdir, bugün yalnız yöneticide.
export const CNC_KURULUM_ISLEMLERI = ['cnc-kurulum.oku', 'cnc-kurulum.yaz', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.takim-degistir', 'cnc-kurulum.stok-dus'] as const;
