# Ortaklık (toplantilar)

| Kavram | Tablo / sütun | Sahibi | Not |
|---|---|---|---|
| toplantı | `toplantilar_toplanti` | toplantilar | konu bağı: `proje_id`, `uretim_emri_id`, `firma_id` (en çok biri) |
| katılımcı | `toplantilar_katilimci.kisi_id` | toplantilar | kişi kisiler'dedir |
| gündem, karar | `toplantilar_gundem`, `toplantilar_karar` | toplantilar | karar yalnız eklenir |
| toplantı aksiyonu | `toplantilar_aksiyon` | toplantilar | tek sorumlu, son tarih; Görevler'deki görevle aynı kavram değildir (3448-4 b: projesiz aksiyon 3. dilimde Görevler'e) |
| proje görevi | `projeler_gorev.toplanti_aksiyon_id` | projeler | aksiyondan açılan görevin bağı; `toplantiAksiyonundanGorevAc` |
| proje, üretim emri, firma | — | projeler, uretim-emirleri, musteri-tedarikci | yalnız `disari.ts` ile okunur |
| bildirim ve e-posta | `bildirim_kaydi`, `bildirim_eposta_kuyrugu` (kayit_basligi, zaman_araligi, yer, duzenleyen) | bildirim | türler `toplantilar.davet/degisti/iptal` |
| takvim kaydı | — | takvim | `takvimKayitlari` (kaynak `toplanti`) |
