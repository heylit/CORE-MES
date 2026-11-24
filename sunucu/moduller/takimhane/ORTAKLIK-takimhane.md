# Ortaklık: takimhane

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Kaynak: `sunucu/gocler/20261124133000_takimhane_dilim_1_2.sql`, `paylasilan/sozlesme/takimhane.ts`.

## Tablolar
- `takimhane_ozellik`: `kart_no` (katalog kartı), `sinif`, `cap_mm`, `kesici_sayisi`, `iso_kodu`, `malzeme_gruplari`, `yeniden_bilenir`, `izleme`, `surum`.
- `takimhane_emir_takimi`: `uretim_emri_id`, `cep`, `kart_no`, `adet`.
- Stok tablolarına eklenenler (sahibi Stok): `stok_konum.kisi_id` ve `tur = 'kisi'`; `stok_teslim.iade_durumu`, `iade_nedeni`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Takım kartı | katalog kartı (stok kodu `TKM...`) | malzemeler | sahibi malzemeler; özellik burada `kart_no` ile |
| Takım bakiyesi | yok (tek defter Stok'ta) | stok | okunur |
| Kişi konumu (zimmet) | kişiye bağlı stok konumu | stok (`stok_konum`) | kişi kavramı kisiler'de |
| Emrin takım listesi | cep, takım, adet | `takimhane_emir_takimi` | CNC kurulumdaki `tools` ile örtüşebilir (Aşama 2'de sahiplik sorulur) |
| İade durumu | sağlam, aşınmış, kırık | `stok_teslim` | yalnız stok teslimine bağlı |
