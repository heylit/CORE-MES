# Ortaklık (oee)

Modül kendi tablosu tutmaz; bütün kavramlar başka modülün `disari.ts` okumasıdır.

| Kavram | Sahibi | Okunan |
|---|---|---|
| iş merkezi, istasyon, makine | istasyonlar | `isMerkezleri`, `istasyonlar`, `aktifMakineler` |
| kişi - makine ataması (yüzde), kişi kapsamı | istasyonlar | `makineKisiAtamalari`, `kisininIzinliIsMerkezleri` |
| çalışma takvimi (vardiya, tatil, planlı duruş) | vardiya | `calismaTakvimleri` |
| makine çalışma süresi, sağlam/hurda, standart süre | uretim-emirleri | `makineSureleri`, `aralikAdetleri`, `kirilimStandartSureleri` |
| istasyon ve kişi saat maliyeti, para birimi | finans | `birimMaliyetleri` |
