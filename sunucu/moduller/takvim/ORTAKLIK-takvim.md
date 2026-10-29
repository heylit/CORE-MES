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
| emir plan tarihleri, sevk, satın alma termini | plan, sevkiyat, satin-alma | bağlanmadı (UYUM-BORCU.md) |
