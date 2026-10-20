# Ortaklık: cizimler

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261012101500_cizimler_tablolar.sql`, `paylasilan/sozlesme/cizimler.ts`.

## Tablolar
- `cizimler_belge`: `id`, `ad`, `tur`, `aciklama`, `aktif`, `surum`, `olusturan_id` -> `kisi`, `olusturuldu`, `guncellendi`.
- `cizimler_revizyon`: `id`, `belge_id`, `sira`, `ozet` -> `dosya`, `dosya_turu`, `durum`, `not`, `yukleyen_id` -> `kisi`, `yuklendi`, `yayinlayan_id` -> `kisi`, `yayinlandi`.
- `cizimler_bag`: `belge_id`, `hedef_modul`, `hedef_id`, `ekleyen_id` -> `kisi`, `eklendi`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Teknik belge (çizim, 3B model, makine dokümanı, sertifika, kroki) | ad, tür, açıklama | `cizimler_belge` | sahibi bu modül; Arkon `arkon_dosya`, atölye `atolye_model` ve `atolye_kroki` aynı kavramı ayrıca tutuyor (borç 4) |
| Revizyon | harf (sıradan), durum, not | `cizimler_revizyon` | modül içi; Arkon dosyalarında revizyon alanı var mı: BİLMİYORUM |
| Dosya içeriği | özet | `cizimler_revizyon.ozet` | yabancı anahtar `dosya` (ADR 0009) |
| Malzeme | kart no | `cizimler_bag.hedef_id` (`hedef_modul = 'malzemeler'`) | sahibi malzemeler; anahtar yok (borç 2) |
| İstasyon, atölye kaydı, Arkon kaydı, ölçü aleti, rota, iş emri, stok partisi, satın alma sipariş satırı | kayıt kimliği | `cizimler_bag` | sahibi kendi modülü; bağı o modül `disari.ts` ile kurar |
| Kişi | açan, yükleyen, yayınlayan, bağlayan | `*_id` | yabancı anahtar `kisi`; ad kisiler `disari.ts` ile |
| Durum listeleri | belge türü, revizyon durumu, bağ modülü | sözleşme `BELGE_TURLERI`, `REVIZYON_DURUMLARI`, `BAG_MODULLERI` | modül içi |
