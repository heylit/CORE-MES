# Ortaklık: smartes

| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| İstasyon | SmartES WorkstationCode karşılığı | `smartes_esleme` (`tur = 'istasyon'`, `tmi_id`, `smartes_kod`); okunan kod `smartes_is_emri_durumu.istasyon_kodu` | sahibi istasyonlar; yabancı anahtar yok (Aşama 2) |
| Makine | SmartES MachineCode karşılığı | `smartes_esleme` (`tur = 'makine'`); okunan kod `smartes_is_emri_durumu.makine_kodu`, `smartes_durus.makine_kodu`, `smartes_alarm.makine_kodu` | sahibi istasyonlar |
| Operasyon tipi | SmartES OperationCode karşılığı | `smartes_esleme` (`tur = 'operasyon-tipi'`) | sahibi istasyonlar |
| Duruş nedeni | SmartES duruş nedeni kodu karşılığı | `smartes_esleme` (`tur = 'durus-nedeni'`); okunan kod `smartes_durus.neden_kodu` | sahibi durus-nedenleri |
| Üretim emri / iş emri | gönderim izi ve SmartES iş emri no | `smartes_giden.is_emri_id`, `ozet`; okunan `smartes_is_emri_durumu.is_emri_no`, `erp_id` | sahibi uretim-emirleri; yabancı anahtar yok |
| Malzeme | stok no (okunan ve gönderilen) | `smartes_is_emri_durumu.stok_no`; gönderimde `malzemeOzetleri` | sahibi malzemeler |
| Üretim sayısı | okunan sağlam, red, makine sayacı | `smartes_is_emri_durumu.saglam`, `red`, `makine_saglam`, `makine_red` | üretim kaydının sahibi uretim-emirleri (BASKA-MODUL-ISTEKLERI 3) |
| Kişi | eşlemeyi son değiştiren | `smartes_esleme.guncelleyen_kisi_id` | sahibi kisiler (yabancı anahtar `kisi`) |
| Red / hurda | okunan red kaydı: adet, neden kodu ve adı, iş emri no, istasyon, makine, stok no | `smartes_red` (`smartes_id` tekil, `ham`) | stok ve kalite modülüne işlenmiyor; sahibi bağlamada belirlenir |
| Ambar hareketi | okunan ambar hareketi: ambar kodu, hareket türü, miktar, stok no | `smartes_ambar_hareketi` | stok modülü ile kavram ortak (ambar, hareket); bağlamada |
| Kalite kontrol sonucu | okunan ölçüm adı, değer, sonuç, iş emri no, stok no | `smartes_kalite_kontrol` | kalite kavramı; bağlamada |
| Tanım gönderim izi | SmartES'e tanım gönderilen istasyon ve stok kartı (kod, durum) | `smartes_tanim_giden` (`tur`, `tmi_id`, `kod`); akış izi `smartes_akis_izi` | tmi_id sahibi istasyonlar / malzemeler; yabancı anahtar yok |
