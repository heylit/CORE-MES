# Ortaklık: akis

Modül kendi kavramını tutmaz ve tablosu yoktur; her şeyi sahibinden okur. Aşama 2 tablosu için okunan kavramlar:

| Kavram | Sahibi | Okunan yer |
|---|---|---|
| üretim emri, iş emri, üretim olayları, sayım, fason hareketi | uretim-emirleri | `uretim_emri`, `uretim_emirleri_is_emri`, `uretim_kaydi`, `uretim_olayi`, `uretim_sayimi`, `uretim_emirleri_fason_hareketi` (`emirAkisKaydi`) |
| stok hareketi, parti, lot, mal kabul zamanı | stok | `stok_hareketi`, `stok_parti.lot_no`, `stok_mal_kabul.zaman` (`emrinAkisHareketleri`, `partiGirisZamanlari`) |
| statü (HM/YM/MM) | recete-rota | `recete_rota_statu` (`receteRotaStatuleri`) |
| sevke hazır, sevkiyat işi durumu | sevkiyat | `sevkiyat_bekleyen.hazir_zamani`, `sevkiyat_isi.durum`, `durum_zamani` (`emirlerinSevkDurumu`) |
| istasyon adı | istasyonlar | `istasyonAdlari` |
