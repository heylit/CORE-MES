# Ortaklık (proje-maliyet)

Tek tablosu `proje_maliyet_defteri` (199 a; proje_id, is_emri_id, plan, gercek, ucretler, adet, saglam, bitis, dondurma, donduran_id); yabancı anahtarla projeler_proje, uretim_emirleri_is_emri ve kisi'ye bağlıdır. Öbür kavramlar başka modülün `disari.ts` okumasıdır.

| Kavram | Sahibi | Okunan | Durum |
|---|---|---|---|
| proje, projenin siparişi, bütçe (198 a) | projeler | `projeGetir` (bütçe alanı bekleniyor) | var / istek |
| sipariş tutarı, termin, para birimi, ceza | siparisler | `siparisAyrintisi` | var |
| kur | finans | `kurGetir` | var |
| istasyon, kişi, malzeme birim maliyeti | finans | `birimMaliyetleri` | var, bağlanmadı |
| projenin iş emirleri, süreler, katılım | uretim-emirleri | `projeninIsEmirleri`, `isEmriSureleri` | istek |
| iş emri başına fason tutarı | satin-alma | `isEmriFasonTutarlari` | istek |
| emre malzeme sarfı | stok | `emrinAkisHareketleri` | var, bağlanmadı |
| kâr riski günlük oranı | plan | `planAyariOku` (6b) | istek |
