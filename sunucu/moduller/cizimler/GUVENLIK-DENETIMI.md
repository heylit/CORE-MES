# GUVENLIK-DENETIMI: cizimler (kart #708, dal 708-cizimler)

Her uç `uclar.ts`'te `uc({...})` ile. OKUMA = `{ biri: ['sayfa.cizimler', 'cizimler.oku'] }`. Bütün yazma uçları tam denetimli (çekirdek varsayılanı).

| Uç | İşlem | Sunucudaki kurallar | Test |
|---|---|---|---|
| `GET /cizimler/menu-sayaclari` | oturum | okuyamayana `{}` | CZ-02 |
| `GET /cizimler` | OKUMA | sayfalı, arama `ILIKE` kaçışlı, tür ve arşiv süzgeci | CZ-02, CZ-08 |
| `GET /cizimler/malzeme-secimi` | `cizimler.yaz` | yalnız aktif malzeme kartları (malzemeler `malzemeAra`), en çok 20; arama metni 80 karakter | CZ-09 seçici |
| `GET /cizimler/:id` | OKUMA | yoksa 404 | CZ-02 |
| `GET /cizimler/:id/revizyonlar/:revizyonId/dosya` | OKUMA | revizyon bu belgenin değilse 404; dosya yalnız bu belgenin bağından akar (`dosyaAkisi`) | CZ-11 |
| `POST /cizimler` | `cizimler.yaz`; tekrar korumalı | dosyayı yükleyen bağlar (CZ-04); tür uyumu (CZ-03); 200 MB | CZ-01, CZ-03, CZ-04, CZ-12 |
| `POST /cizimler/:id/guncelle` | `cizimler.yaz` | sürüm | CZ-10 |
| `POST /cizimler/:id/arsivle`, `/arsivden-cikar` | `cizimler.yaz` | sürüm | CZ-08 |
| `POST /cizimler/:id/revizyon-ekle` | `cizimler.yaz` | arşivde 409; aynı dosya 400; tür uyumu | CZ-06, CZ-08 |
| `POST /cizimler/:id/revizyonlar/:revizyonId/yayinla` | `cizimler.yayinla` | yayındaki 409; tek yayında (kısmi tekil dizin) | CZ-05 |
| `POST /cizimler/:id/revizyonlar/:revizyonId/sil` | `cizimler.yaz` | yalnız taslak, son revizyon değil; dosya bağı kalkar; tetikleyici ikinci kat | CZ-07 |
| `POST /cizimler/:id/bag-ekle`, `/bag-kaldir` | `cizimler.yaz` | merkezden malzeme (her tür) ve istasyon (yalnız 3B model, istasyon var olmalı, öbür 3B bağı kalkar); ikinci bağ 409; malzeme hedefi doğrulanmaz (borç 2) | CZ-09, CZ-14 |

## Veri kapsamı
- `disari.kayittakiBelgeDosyasi` yalnız bağlı kayda ve yalnız yayındaki revizyona dosya verir; okuma yetkisini çağıran modül uygular (CZ-09).
- İstemci dosyayı cihazda açar (pdf.js, occt wasm paketin içinden); dışarıya istek yok.
- `disari.belgeAcVeBagla` uç değildir: yalnız sertifika ve rapor açar, belge yalnız verilen kayda bağlı doğar; `cizimler.*` işlemi sorulmaz, yazma yetkisi çağıran modülün ucundadır. Dosyayı içeriği yükleyen kişi bağlar (CZ-04), tür denetlenir (CZ-03); hata olursa belge kalmaz (CZ-13).
