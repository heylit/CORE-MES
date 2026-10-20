# Ortaklık (uretim-emirleri)

| Kavram | Burada | Sahibi / öteki yer |
|---|---|---|
| Üretim emri, iş emri | `uretim_emri`, `uretim_emirleri_is_emri` | uretim-emirleri (sahip) |
| Malzeme (ürün, bileşen) | `uretim_emri.malzeme_no`, `uretim_emirleri_is_emri_bileseni.malzeme_no` -> `malzeme_katalog_karti.no` | malzemeler |
| Ürün kodu ve adı (açılış anındaki) | `uretim_emri.parca_no`, `parca_ad` | malzemeler (kart) |
| Firma (fason) | `uretim_emirleri_is_emri.fason_firma_id` -> `finans_firma` | finans |
| Makine, istasyon | `makine_id`, `istasyon_id` (iş emri, aday, defterler) | istasyonlar |
| Kişi | `kisi_id` (iş emri, aday, fason hareketi), `acan_id`, defterler | kisiler |
| Operasyon tipi | `uretim_emirleri_is_emri.operasyon_tipi_id` -> `istasyonlar_operasyon_tipi` | istasyonlar |
| Rota revizyonu | `uretim_emri.kaynak_rota_revizyonu_id` (FK yok, UE-B1) | rota |
| Süre, bağımlılık, devir, talimat sürümü | iş emrinde kopya | rota (kaynak) |
| Emir no | `uretim_emri.emir_no` (UE-000123) | uretim-emirleri; stok `uretim_emri_id` taşır |
| Durum listeleri | emir: taslak, planli, basladi, bitti, iptal; iş emri: bekliyor, calisiyor, tamam; fason yönü: gidis, donus | uretim-emirleri; plan okur |
| Öncelik, başlangıç, teslim | `uretim_emri.oncelik`, `baslangic`, `teslim` | uretim-emirleri; plan yazar (P6) |
| Duruş ve hurda nedeni | defterlerde | durus-nedenleri |
