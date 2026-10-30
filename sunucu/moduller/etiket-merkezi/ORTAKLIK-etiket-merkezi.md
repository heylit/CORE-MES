# ORTAKLIK: etiket-merkezi

Modülün tuttuğu ya da gösterdiği, başka modülde de olan kavramlar. Şablon değerleri şimdilik örnektir.

| Kavram | Sahibi | Etiket Merkezi'nde | Bağlanınca okunacak yer |
|---|---|---|---|
| Konum, harita kutusu | stok (`stok_konum.kod`), atolye (`atolye_goz`, `atolye_alan`) | şablon alanı `kod` (ad, yer boş); QR `LOC:<kod>`; basılan konum `etiket_merkezi_baski_kaydi.kaynak_id` | stok `konumAdlari` (bağlandı) |
| Malzeme | malzemeler (`malzeme_katalog_karti.no`) | `ad`, `kod`, `kart`; QR `MLZ:<no>` | malzemeler `malzemeOzetleri` |
| Lot | stok (`stok_parti.lot_no`) | `lotNo`, `malzeme`, `parti`, `giris`; QR `LOT:<lot no>` | stok `lotEtiketleri` (parti ya da mal kabul) |
| Üretim emri, refakat kartı | uretim-emirleri | `emirNo`, `urunAd`, `urunKod`, `adetTermin`, `parti`, `adimlar`; QR `UE:<id>` | uretim-emirleri (`refakatKarti`) |
| İstasyon | istasyonlar, stok (istasyonun konumu) | `kod`, `ad`; QR `LOC:<istasyon konum kodu>` | istasyonlar ve stok (istenecek) |
| QR önekleri | paylasilan (`kod-sozlugu.ts` `KOD_ONEKI`) | yalnız okunur | aynı |
| Yazıcı | etiket-merkezi (`etiket_merkezi_yazici`: ad, dil, dpi, baglanti, adres) | sahibi | - |
| Baskı kaydı | etiket-merkezi (`etiket_merkezi_baski`: yazici_id, sablon_anahtar, adet, kisi_id, sonuc) | sahibi | - |
| Basılan kayıt | etiket-merkezi (`etiket_merkezi_baski_kaydi`: baski_id, kaynak_tur, kaynak_id; yabancı anahtar yok) | sahibi | Aşama 2'de kaynak tablosuna bağ |
| Kişi | kisiler (`kisi`) | `degistiren_kisi_id`, `kisi_id`; ad `kisiAdlari` ile | kisiler `disari.ts` |
| Etiket türü | etiket-merkezi (`etiket_merkezi_etiket_turu`: kod, ad, sahip_modul, tetik, alanlar, sablon_turu, kayit_turleri, durum, disaridaki_yol) | sahibi; `sahip_modul` modül adı metnidir, yabancı anahtar değil | - |
| Etiket şablonu | etiket-merkezi (şimdilik kodda; tablo tasarım ekranıyla) | sahibi | - |
