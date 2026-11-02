# Ortaklık: cizimler

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261012101500_cizimler_tablolar.sql`, `paylasilan/sozlesme/belge-merkezi.ts`.

## Tablolar
- `belge_merkezi_belge`: `id`, `ad`, `tur`, `resim_no`, `aciklama`, `aktif`, `surum`, `olusturan_id` -> `kisi`, `olusturuldu`, `guncellendi`.
- `belge_merkezi_revizyon`: `id`, `belge_id`, `sira`, `ozet` -> `dosya`, `dosya_turu`, `antet_rev`, `durum`, `not`, `yukleyen_id` -> `kisi`, `yuklendi`, `yayinlayan_id` -> `kisi`, `yayinlandi`.
- `belge_merkezi_bag`: `belge_id`, `hedef_modul`, `hedef_id`, `kapak`, `ekleyen_id` -> `kisi`, `eklendi`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Teknik belge (çizim, 3B model, makine dokümanı, sertifika, kroki) | ad, tür, açıklama | `belge_merkezi_belge` | sahibi bu modül; Arkon `arkon_dosya`, atölye `atolye_model` ve `atolye_kroki` aynı kavramı ayrıca tutuyor (borç 4) |
| Revizyon | harf (sıradan), durum, not | `belge_merkezi_revizyon` | modül içi; Arkon dosyalarında revizyon alanı var mı: BİLMİYORUM |
| Dosya içeriği | özet | `belge_merkezi_revizyon.ozet` | yabancı anahtar `dosya` (ADR 0009) |
| Malzeme | kart no | `belge_merkezi_bag.hedef_id` (`hedef_modul = 'malzemeler'`) | sahibi malzemeler; anahtar yok (borç 2) |
| Teknik resim numarası, antet revizyonu (kart #688) | belgede resim no, revizyonda antet rev | `belge_merkezi_belge.resim_no`, `belge_merkezi_revizyon.antet_rev` | malzeme kartındaki resim no ve rev alanlarıyla eşleşir (malzemeler `disari.malzemeResimAnahtarlari`); kartta tutan malzemeler |
| Kaydın kapak resmi | kayıt başına tek kapak bağı | `belge_merkezi_bag.kapak` | modül içi |
| İstasyon, atölye kaydı, Arkon kaydı, ölçü aleti, rota, iş emri, stok partisi, satın alma sipariş satırı | kayıt kimliği | `belge_merkezi_bag` | sahibi kendi modülü; bağı o modül `disari.ts` ile kurar |
| Kişi | açan, yükleyen, yayınlayan, bağlayan | `*_id` | yabancı anahtar `kisi`; ad kisiler `disari.ts` ile |
| Durum listeleri | belge türü, revizyon durumu, bağ modülü | sözleşme `BELGE_TURLERI`, `REVIZYON_DURUMLARI`, `BAG_MODULLERI` | modül içi |
