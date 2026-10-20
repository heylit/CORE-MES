# GUVENLIK-DENETIMI: durus-nedenleri (kart #247, dal 247-tanim-modulleri)

Her uç `uclar.ts`'te `uc({...})` ile. Testler `durus-nedenleri.test.ts` (gerçek PostgreSQL); "Test" sütunundaki adlar test başlığının başıdır.
Oturumsuz istek her uçta 401 (çekirdek; DN-S3 iki okuma ucu için ölçer).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /durus-nedenleri` | `biri: sayfa.durus-nedenleri, sayfa.terminal` | `yalnizAktif` pasifleri süzer (DN-06); önerilen kod pasifler dahil hesaplanır (DN-09) | DN-S4, DN-06 | DN-S4 (yalnız `sayfa.arkon` 403), DN-S3 (oturumsuz 401) |
| `GET /hurda-nedenleri` | `biri: sayfa.durus-nedenleri, sayfa.terminal` | aynı | DN-S4 | DN-S4, DN-S3 |
| `POST /durus-nedenleri` | `durus-nedenleri.yaz` | kod biçimi ve tekilliği (DN-03, kısıt), kategori (DN-01), çağrı yalnız plansızda, ekip ve gecikme birlikte (DN-07, kısıt); sıra sona | DN-01 | DN-S3, DN-S3 rol taraması (403), DN-03 (409), DN-07, DN-01 (kategori 400) |
| `POST /durus-nedenleri/:id/guncelle` | `durus-nedenleri.yaz` | aynı kurallar; planlıya çevirmede çağrı silinir (DN-08); kod değişir, id sabit (DN-S2); silme yok, pasife alınır (DN-05) | DN-08, DN-S2, DN-05 | DN-S3 (403), DN-S2 (başkasının kodu 409), DN-S4 (okuma yetkisi yazmaz) |
| `POST /hurda-nedenleri` | `durus-nedenleri.yaz` | kod biçimi ve tekilliği (DN-04); yalnız kod, ad, etkinlik, sıra (DN-11) | DN-04, DN-11 | DN-S3 (403), DN-04 (409) |
| `POST /hurda-nedenleri/:id/guncelle` | `durus-nedenleri.yaz` | aynı | DN-05 | DN-S3 (403), DN-S4 |

## Uç katmanından geçmeyen okuma
`disari.ts` (`durusNedeniGetir`, `durusNedenleriniListele`, `hurdaNedeniGetir`, `hurdaNedenleriniListele`) kullanıcı ve işlem istemez; Arkon ve üretim emirleri
sunucuda çağırır. Yetkiyi çağıran modülün kendi ucu taşır. DN-S5 bu yolun HTTP yetkisi olmayan rol için de çalıştığını sabitler.

## Denetim kaydı
Yazma uçları gövdeyi denetime tam yazar ("yazma denetim kaydına düşer" testi).

## Yalnız ekranda kalan kurallar
- Simge listesi: sunucu yalnız biçimi denetler; hangi simgenin var olduğunu ekranın seçim listesi sınırlar (NOTLAR.md).
- Yeni neden ve düzenleme düğmesinin görünmesi `durus-nedenleri.yaz`'a bağlıdır; yetki sunucudadır.
- İkinci menü maddeleri yalnız görünürlüktür.

## Açık konular
Rol satırı yok (UYUM-BORCU 1); sürüm denetimi yok (UYUM-BORCU 3). Kayıt kişi ve zaman tutmaz; değişiklik denetim kaydındadır.
