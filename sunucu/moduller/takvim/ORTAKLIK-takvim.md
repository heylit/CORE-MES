# Ortaklık (takvim)

Modül tablo tutmaz; bütün kayıtlar başka modülün `disari.ts` okumasıdır ve sahibi o modüldür.

| Kavram | Sahibi | Okunan |
|---|---|---|
| sipariş termini, firma adı | siparisler | `takvimKayitlari` |
| ölçü aleti kalibrasyon vadesi | kalibrasyon | `takvimKayitlari` |
| denetim ve son gün (ortak kayıt `yerel/kalite-denetim-v4`) | denetim-hazirlik | `takvimKayitlari` |
| izin, kişi adı | ik | `takvimKayitlari` |
| resmi tatil | ik | `resmiTatilGunleri` |
| vergi beyanı son günü | finans | `takvimKayitlari` |
| tek seferlik planlı duruş, istasyon / iş merkezi adı | vardiya | `takvimKayitlari` |
| üretim emri başlangıç ve teslim tarihi, emir no, parça adı | uretim-emirleri | `takvimKayitlari` |
| sevkiyat işi günü, belge no, nokta ve firma adı | sevkiyat | `takvimKayitlari` |
| satın alma siparişi beklenen teslimi, sipariş no, tedarikçi adı | satin-alma | `takvimKayitlari` |
